// Node port of the Honest_TTS Vertex AI client: signs a service-account JWT
// (RS256) → bearer token → Gemini TTS, returns 16-bit PCM. No SDK — node:crypto
// + global fetch. The "AUDIO PROFILE: Nico" prompt and style/pace presets are
// carried over from the WordPress plugin to match the live voice.

import crypto from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKEN_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
export const DEFAULT_MODEL = "gemini-2.5-flash-preview-tts";
export const DEFAULT_VOICE = "Enceladus";
export const DEFAULT_STYLE = "reflective";
export const DEFAULT_PACE = "conversational";
export const SAMPLE_RATE = 24000; // Gemini TTS returns 24 kHz mono 16-bit PCM.

// `text` goes under "Style:" in the director's notes; role/scene set the AUDIO
// PROFILE header.
const STYLE_PRESETS = {
  reflective: {
    text: "Thoughtful and contemplative. Land on concrete imagery, proper nouns, and dates with quiet weight. Treat em-dashes and semicolons as brief breaths, not full pauses. Avoid an announced, broadcast cadence — speak as if to a single listener.",
    role: "A writer reading their own essay aloud.",
    scene:
      "Late afternoon in a warmly lit reading room. The writer is in an armchair, manuscript in their lap. The room is quiet; one person is listening.",
  },
  witty: {
    text: "Warm and lightly playful. Lean into wordplay and ironic asides without overdoing them. Sound like someone who enjoys their own sentences but isn't showing off.",
    role: "An essayist reading their own piece with quiet enjoyment of their own jokes.",
    scene:
      "A small dinner party that has wound down to coffee. The writer holds a notebook and reads aloud; the friends across the table are smiling.",
  },
  casual: {
    text: "Friendly and conversational. Treat parentheticals and asides as quick voice drops. Sound like someone reading their own writing aloud to a friend, not a voiceover artist.",
    role: "A blogger reading their latest post to a friend.",
    scene:
      "A weekend afternoon on a sunlit porch. Phone in hand, talking to a single friend sitting beside them.",
  },
  journalistic: {
    text: "Clear and measured. Emphasize names, numbers, and quoted phrases. Steady intonation throughout; reserve emphasis for the lede and the closing line. Avoid theatrical inflection.",
    role: "A radio journalist delivering a feature piece.",
    scene:
      "Mid-morning in a radio studio. Headphones on, script in front of them, the on-air light is red.",
  },
  literary: {
    text: "Polished audiobook narration. Vary intonation for dialogue tags and descriptive passages. Land on imagery; let metaphors breathe. Engaged but never overplayed.",
    role: "An experienced audiobook narrator.",
    scene:
      "A soundproofed recording booth. Bound manuscript on a stand, water glass nearby, full attention on the text.",
  },
  warm: {
    text: "Friendly and inviting, with a slight smile in the voice. Let personal observations land with warmth without becoming saccharine.",
    role: "Someone reading aloud to a person they care about.",
    scene:
      "Evening by a fireplace. A handwritten letter or notebook in hand; the person they're reading to is sitting close, listening warmly.",
  },
  technical: {
    text: "Patient and precise. Clear articulation on names, version numbers, and short identifiers. Matter-of-fact tone; no dramatic emphasis.",
    role: "An engineer walking a colleague through a writeup.",
    scene:
      "A quiet office, late afternoon. Standing beside a whiteboard, gesturing at notes, explaining unhurriedly to one attentive listener.",
  },
};

const PACE_PRESETS = {
  slow: "Deliberate and unhurried. Full pauses at periods. Let complex sentences breathe before moving on.",
  measured:
    "Just under conversational. Clarity over speed. Steady throughout, with brief pauses on commas.",
  conversational:
    "Quick, lively, everyday speech — the pace of someone telling a friend a story in person, not reading aloud. Keep sentences moving; don't linger too long on commas.",
  brisk:
    "Noticeably fast and energetic. Clip transitions tight, push through sentences with momentum. Articulation stays crisp but never slows the pace.",
};

export function listStyles() {
  return Object.keys(STYLE_PRESETS);
}
export function listPaces() {
  return Object.keys(PACE_PRESETS);
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Build the director's-notes prompt around a transcript chunk.
function buildInput(text, { style, pace }) {
  const preset = STYLE_PRESETS[style] ?? null;
  const styleText = preset?.text ?? "";
  const paceText = PACE_PRESETS[pace] ?? "";
  const role = preset?.role ?? "A writer reading their own work aloud.";
  const scene =
    preset?.scene ?? "A quiet room with one attentive listener nearby.";

  const notes = [
    "Read every line of the TRANSCRIPT below, in order, including the first line. Do not omit, summarize, paraphrase, or invent content beyond the transcript. Do not voice these director's notes — they are direction only.",
  ];
  if (styleText) notes.push("", "Style: " + styleText);
  if (paceText) notes.push("", "Pace: " + paceText);
  if (styleText || paceText) notes.push("", "Accent: neutral American");

  return (
    "# AUDIO PROFILE: Nico\n\n" +
    "## " +
    role +
    "\n\n" +
    "## THE SCENE: " +
    scene +
    "\n\n" +
    "### DIRECTOR'S NOTES\n\n" +
    notes.join("\n\n") +
    "\n\n#### TRANSCRIPT\n\n" +
    text
  );
}

export class GeminiTTS {
  // serviceAccount: parsed JSON with { project_id, client_email, private_key }.
  constructor(serviceAccount, opts = {}) {
    const sa = serviceAccount ?? {};
    this.projectId = String(sa.project_id ?? "");
    this.clientEmail = String(sa.client_email ?? "");
    this.privateKey = String(sa.private_key ?? "");
    this.region = opts.region || "us-central1";
    this.model = opts.model || DEFAULT_MODEL;
    this._token = null; // { value, expiresAt }
    if (!this.projectId || !this.clientEmail || !this.privateKey) {
      throw new Error(
        "Service account JSON is missing project_id, client_email, or private_key.",
      );
    }
  }

  async #accessToken() {
    if (this._token && this._token.expiresAt - 60_000 > Date.now()) {
      return this._token.value;
    }
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = b64url(
      JSON.stringify({
        iss: this.clientEmail,
        scope: TOKEN_SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    );
    const unsigned = header + "." + claims;
    const signature = crypto
      .createSign("RSA-SHA256")
      .update(unsigned)
      .sign(this.privateKey);
    const jwt = unsigned + "." + b64url(signature);

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      throw new Error(
        `Token exchange failed (HTTP ${res.status}): ${data.error_description || data.error || "check the service account JSON"}`,
      );
    }
    this._token = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return this._token.value;
  }

  // Returns a Buffer of raw PCM.
  async synthesize(text, { voice = DEFAULT_VOICE, style, pace } = {}) {
    if (!text.trim()) throw new Error("No text to synthesize.");
    const input = buildInput(text, { style, pace });
    const url =
      `https://${encodeURIComponent(this.region)}-aiplatform.googleapis.com/v1/projects/` +
      `${encodeURIComponent(this.projectId)}/locations/${encodeURIComponent(this.region)}` +
      `/publishers/google/models/${encodeURIComponent(this.model)}:generateContent`;
    const payload = {
      contents: [{ role: "user", parts: [{ text: input }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
        },
      },
    };

    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(1500 * attempt);
      const token = await this.#accessToken();
      let res;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        lastErr = e;
        continue; // network blip — retry
      }
      if (res.status === 401 || res.status === 403) this._token = null;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data?.error?.message || `Vertex AI returned HTTP ${res.status}`;
        lastErr = new Error(msg);
        if (res.status === 429 || res.status >= 500) continue; // transient
        throw lastErr; // 4xx other than 429 won't get better on retry
      }
      const inline = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!inline?.data) {
        const finish = data?.candidates?.[0]?.finishReason || "unknown";
        throw new Error(
          `TTS response contained no audio (finishReason: ${finish}).`,
        );
      }
      const pcm = Buffer.from(inline.data, "base64");
      if (!pcm.length) throw new Error("TTS response decoded to empty audio.");
      return pcm;
    }
    throw lastErr ?? new Error("TTS failed after retries.");
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
