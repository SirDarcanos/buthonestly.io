import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";

export const NARRATION_SAMPLE_RATE = 24000;
export const NARRATION_CHANNELS = 1;
export const NARRATION_BITRATE = "96k";
export const DIRECTOR_PROMPT_FORMAT = "nico-director-notes-v1";
export const NARRATION_CACHE_CONTROL =
  "public, max-age=0, must-revalidate, s-maxage=31536000";

const STYLE_PRESETS = Object.freeze({
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
});

const PACE_PRESETS = Object.freeze({
  slow: "Deliberate and unhurried. Full pauses at periods. Let complex sentences breathe before moving on.",
  measured:
    "Just under conversational. Clarity over speed. Steady throughout, with brief pauses on commas.",
  conversational:
    "Quick, lively, everyday speech — the pace of someone telling a friend a story in person, not reading aloud. Keep sentences moving; don't linger too long on commas.",
  brisk:
    "Noticeably fast and energetic. Clip transitions tight, push through sentences with momentum. Articulation stays crisp but never slows the pace.",
});

export const narrationStyles = Object.freeze(Object.keys(STYLE_PRESETS));
export const narrationPaces = Object.freeze(Object.keys(PACE_PRESETS));

export const buildDirectorPrompt = (text, { style, pace }) => {
  const stylePreset = STYLE_PRESETS[style];
  const pacePreset = PACE_PRESETS[pace];
  const notes = [
    "Read every line of the TRANSCRIPT below, in order, including the first line. Do not omit, summarize, paraphrase, or invent content beyond the transcript. Do not voice these director's notes — they are direction only.",
    "",
    `Style: ${stylePreset.text}`,
    "",
    `Pace: ${pacePreset}`,
    "",
    "Accent: neutral American",
  ];

  return [
    "# AUDIO PROFILE: Nico",
    "",
    `## ${stylePreset.role}`,
    "",
    `## THE SCENE: ${stylePreset.scene}`,
    "",
    "### DIRECTOR'S NOTES",
    "",
    notes.join("\n\n"),
    "",
    "#### TRANSCRIPT",
    "",
    text,
  ].join("\n");
};

const vertexEndpoint = ({ projectId, region, model }) => {
  const host =
    region === "global"
      ? "aiplatform.googleapis.com"
      : `${encodeURIComponent(region)}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(region)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
};

const responseMessage = async (response) => {
  const data = await response.json().catch(() => ({}));
  return {
    data,
    message:
      data?.error?.message || `Vertex AI returned HTTP ${response.status}`,
  };
};

export const createVertexTtsAdapter = ({
  auth,
  fetch: fetchRequest = globalThis.fetch,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) => {
  let projectId;

  return {
    async preflight(settings) {
      projectId = await auth.getProjectId();
      if (!projectId) {
        throw new Error(
          "Google Application Default Credentials did not provide a project ID. Set GOOGLE_CLOUD_PROJECT or configure ADC.",
        );
      }
      await auth.getRequestHeaders(vertexEndpoint({ projectId, ...settings }), {
        forceRefresh: false,
      });
    },

    async synthesize(text, settings) {
      if (!projectId) await this.preflight(settings);
      const url = vertexEndpoint({ projectId, ...settings });
      const payload = {
        contents: [
          {
            role: "user",
            parts: [{ text: buildDirectorPrompt(text, settings) }],
          },
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: settings.voice },
            },
          },
        },
      };
      let lastError;
      let refreshAuthorization = false;
      let authorizationWasRefreshed = false;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (attempt > 0 && !refreshAuthorization) {
          await sleep(1500 * attempt);
        }
        let response;
        const forceRefresh = refreshAuthorization;
        try {
          const authenticationHeaders = await auth.getRequestHeaders(url, {
            forceRefresh,
          });
          if (forceRefresh) authorizationWasRefreshed = true;
          refreshAuthorization = false;
          const headers =
            authenticationHeaders instanceof Headers
              ? Object.fromEntries(authenticationHeaders.entries())
              : authenticationHeaders;
          response = await fetchRequest(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify(payload),
          });
        } catch (error) {
          if (forceRefresh) throw error;
          lastError = error;
          continue;
        }

        const { data, message } = await responseMessage(response);
        if (!response.ok) {
          lastError = new Error(message);
          if ([401, 403].includes(response.status)) {
            if (authorizationWasRefreshed) throw lastError;
            refreshAuthorization = true;
            continue;
          }
          if (response.status === 429 || response.status >= 500) continue;
          throw lastError;
        }

        const inlineData = data?.candidates?.[0]?.content?.parts?.find(
          (part) => part.inlineData?.data,
        )?.inlineData;
        if (!inlineData?.data) {
          const finishReason = data?.candidates?.[0]?.finishReason ?? "unknown";
          throw new Error(
            `Vertex TTS response contained no audio (finishReason: ${finishReason}).`,
          );
        }
        const mimeType = String(inlineData.mimeType ?? "").toLowerCase();
        const pcm = Buffer.from(inlineData.data, "base64");
        if (
          !mimeType.startsWith("audio/l16") ||
          !mimeType.includes("rate=24000") ||
          pcm.length === 0 ||
          pcm.length % 2 !== 0
        ) {
          throw new Error(
            "Vertex TTS response must be nonempty 24 kHz mono 16-bit PCM audio.",
          );
        }
        return pcm;
      }

      throw lastError ?? new Error("Vertex TTS failed after three attempts.");
    },
  };
};

const ffmpegGuidance = () =>
  process.platform === "darwin"
    ? "ffmpeg was not found. Install it with brew install ffmpeg on macOS. On Linux, install ffmpeg with your distribution package manager."
    : "ffmpeg was not found. Install it with your Linux distribution package manager. On macOS, run brew install ffmpeg.";

const runProcess = ({ spawnProcess, args, input }) =>
  new Promise((resolve, reject) => {
    const child = spawnProcess("ffmpeg", args, {
      stdio: [input ? "pipe" : "ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", (error) => {
      reject(error.code === "ENOENT" ? new Error(ffmpegGuidance()) : error);
    });
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.trim()}`));
    });
    if (input) {
      child.stdin?.on("error", () => {});
      child.stdin?.end(input);
    } else {
      child.stdin?.end();
    }
  });

const runCommand = ({ spawnProcess, command, args, env }) =>
  new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || `command exited ${code}`));
    });
    child.stdin?.end();
  });

const cloudflareResult = async (response, operation) => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success !== true) {
    const details = body.errors
      ?.map((error) => error.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(
      `${operation} failed${details ? `: ${details}` : ` with HTTP ${response.status}`}`,
    );
  }
  return body.result;
};

export const createCloudflareNarrationAdapter = ({
  repositoryRoot = process.cwd(),
  env = process.env,
  spawnProcess = spawn,
  fetch: fetchRequest = globalThis.fetch,
} = {}) => {
  const configuration = () => {
    const values = {
      token: env.CLOUDFLARE_API_TOKEN,
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      zoneId: env.CLOUDFLARE_ZONE_ID,
      bucket: env.NARRATION_R2_BUCKET,
    };
    const missing = Object.entries(values)
      .filter(([, value]) => !value?.trim())
      .map(([name]) => name);
    if (missing.length > 0) {
      throw new Error(
        `Cloudflare narration configuration is missing ${missing.join(", ")}. Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ZONE_ID, and NARRATION_R2_BUCKET in the local environment. The token needs R2 write and Zone Cache Purge permissions.`,
      );
    }
    return values;
  };
  const wranglerPath = path.join(
    repositoryRoot,
    "node_modules/wrangler/bin/wrangler.js",
  );
  const wrangler = (args) =>
    runCommand({
      spawnProcess,
      command: process.execPath,
      args: [wranglerPath, ...args],
      env,
    });
  const cloudflareFetch = (url, options = {}) => {
    const { token } = configuration();
    return fetchRequest(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
  };

  return {
    async preflight({ publicUrl }) {
      const { bucket } = configuration();
      const parsedUrl = new URL(publicUrl);
      if (parsedUrl.protocol !== "https:") {
        throw new Error("The narration public URL must use HTTPS");
      }
      await wrangler(["--version"]);
      await wrangler(["r2", "bucket", "info", bucket, "--json"]);
      const tokenResponse = await cloudflareFetch(
        "https://api.cloudflare.com/client/v4/user/tokens/verify",
      );
      const token = await cloudflareResult(
        tokenResponse,
        "Cloudflare credential verification",
      );
      if (token?.status !== "active") {
        throw new Error(
          `Cloudflare API token is ${token?.status ?? "not active"}`,
        );
      }
      const { zoneId } = configuration();
      // An invalid file exercises zone authorization without purging a cache entry.
      const purgeProbe = await cloudflareFetch(
        `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/purge_cache`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: ["narration-upload-permission-probe"],
          }),
        },
      );
      const purgeProbeBody = await purgeProbe.json().catch(() => ({}));
      const purgeProbeErrors = purgeProbeBody.errors
        ?.map((error) => error.message)
        .filter(Boolean);
      const rejectedInvalidUrl =
        purgeProbe.status === 400 &&
        purgeProbeBody.success === false &&
        purgeProbeErrors?.some((message) => /invalid url/iu.test(message));
      if (!rejectedInvalidUrl) {
        const details = purgeProbeErrors?.join("; ");
        throw new Error(
          `Cloudflare zone and Cache Purge authorization verification failed${details ? `: ${details}` : ` with HTTP ${purgeProbe.status}`}`,
        );
      }
      const target = await fetchRequest(publicUrl, {
        method: "HEAD",
        redirect: "manual",
      });
      if (target.status !== 404 && !target.ok) {
        throw new Error(
          `The narration public URL preflight returned HTTP ${target.status}. Check the R2 custom domain in the Cloudflare dashboard.`,
        );
      }
    },

    async upload({ filePath, key }) {
      const { bucket } = configuration();
      await wrangler([
        "r2",
        "object",
        "put",
        `${bucket}/${key}`,
        "--file",
        filePath,
        "--content-type",
        "audio/mpeg",
        "--cache-control",
        NARRATION_CACHE_CONTROL,
        "--remote",
      ]);
    },

    async purge({ publicUrl }) {
      const { zoneId } = configuration();
      const response = await cloudflareFetch(
        `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/purge_cache`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: [publicUrl] }),
        },
      );
      await cloudflareResult(response, "Cloudflare exact-URL cache purge");
    },

    async verify({ publicUrl, expectedHash }) {
      const response = await fetchRequest(publicUrl, {
        cache: "no-store",
        redirect: "error",
      });
      if (!response.ok) {
        throw new Error(`Public narration returned HTTP ${response.status}`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().startsWith("audio/")) {
        throw new Error(
          `Public narration returned ${contentType || "no Content-Type"} instead of audio`,
        );
      }
      const cacheControl = response.headers.get("cache-control") ?? "";
      for (const directive of [
        "max-age=0",
        "must-revalidate",
        "s-maxage=31536000",
      ]) {
        if (!cacheControl.toLowerCase().includes(directive)) {
          throw new Error(
            `Public narration Cache-Control is missing ${directive}`,
          );
        }
      }
      const publicHash = createHash("sha256")
        .update(Buffer.from(await response.arrayBuffer()))
        .digest("hex");
      if (publicHash !== expectedHash) {
        throw new Error("Public bytes do not match the approved MP3");
      }
    },
  };
};

export const createFfmpegAdapter = ({ spawnProcess = spawn } = {}) => ({
  async preflight() {
    try {
      const { stdout } = await runProcess({
        spawnProcess,
        args: ["-hide_banner", "-encoders"],
      });
      if (!/\blibmp3lame\b/u.test(stdout)) {
        throw new Error(
          "ffmpeg does not include the required libmp3lame MP3 encoder. Install a full ffmpeg build with libmp3lame support.",
        );
      }
    } catch (error) {
      if (error.code === "ENOENT" || /not found/i.test(error.message)) {
        throw new Error(ffmpegGuidance());
      }
      throw error;
    }
  },

  async encode({ pcm, outputPath, sampleRate, channels, bitrate }) {
    await runProcess({
      spawnProcess,
      input: pcm,
      args: [
        "-y",
        "-loglevel",
        "error",
        "-f",
        "s16le",
        "-ar",
        String(sampleRate),
        "-ac",
        String(channels),
        "-i",
        "pipe:0",
        "-codec:a",
        "libmp3lame",
        "-b:a",
        bitrate,
        outputPath,
      ],
    });
  },
});
