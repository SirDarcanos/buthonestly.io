import {
  VOICE_GROUPS,
  SPEED_CONTROLS,
  PHONON_VOICES,
  PHONON_MODEL_REVISION,
  PHONON_CATALOGUE_REVISION,
} from "./voice-catalogue.mjs";
import {
  createVoiceSession,
  generateSpeech,
  LAMEJS_URL,
  loadScriptOnce,
} from "./voice-generator.mjs";

import { loadKokoroRuntime } from "./kokoro-runtime.mjs";

function getLamejs() {
  const candidates = [
    typeof window.lamejs !== "undefined" ? window.lamejs : null,
    typeof window.Lame !== "undefined" ? window.Lame : null,
  ];
  for (const c of candidates) {
    if (!c) continue;
    if (typeof c.Mp3Encoder === "function") return c;
    if (c.default && typeof c.default.Mp3Encoder === "function")
      return c.default;
  }
  return null;
}

function encodeWav(samples, sampleRate) {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  function writeString(off, str) {
    for (let i = 0; i < str.length; i++)
      view.setUint8(off + i, str.charCodeAt(i));
  }
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function encodeMp3(samples, sampleRate) {
  const lib = getLamejs();
  if (!lib)
    throw new Error(
      "MP3 encoder (lamejs) not available — script may have failed to load.",
    );
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const encoder = new lib.Mp3Encoder(1, sampleRate, 128);
  const blockSize = 1152;
  const chunks = [];
  for (let i = 0; i < int16.length; i += blockSize) {
    const slice = int16.subarray(i, i + blockSize);
    const buf = encoder.encodeBuffer(slice);
    if (buf.length > 0) chunks.push(buf);
  }
  const flushBuf = encoder.flush();
  if (flushBuf.length > 0) chunks.push(flushBuf);
  return new Blob(chunks, { type: "audio/mpeg" });
}

async function loadRuntime(request, notify) {
  if (request.model === "phonon") {
    notify("Loading Phonon runtime…");
    const { PhononTTS } = await import("phonon-tts");
    const base = `https://huggingface.co/gradium/phonon-31m-en/resolve/${PHONON_MODEL_REVISION}`;
    const catalogue = `https://huggingface.co/gradium/phonon-voices/resolve/${PHONON_CATALOGUE_REVISION}`;
    const runtime = await PhononTTS.load({
      lang: "en",
      quant: "q8",
      device: "auto",
      threads: 1,
      conditions: { duration_delta: request.speed },
      model: {
        weights: { q8: `${base}/model.q8.gguf` },
        tokenizer: `${base}/tokenizer.json`,
        config: `${base}/config.json`,
        voices: Object.fromEntries(
          PHONON_VOICES.map((v) => [v.id, `${catalogue}/${v.filename}`]),
        ),
        defaultVoice: request.voice,
      },
      onProgress: ({ file, loaded, total, cached }) =>
        notify(
          cached
            ? `Reading cached ${file}…`
            : total && loaded < total
              ? `Downloading ${file}: ${(loaded / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MiB…`
              : `Preparing ${file}…`,
        ),
    });
    notify(`Phonon ready — ${runtime.device}. ${runtime.deviceReason}`);
    return runtime;
  }
  let hasWebGpu = false;
  try {
    hasWebGpu = Boolean(await navigator.gpu?.requestAdapter());
  } catch {}
  return loadKokoroRuntime({
    hasWebGpu,
    notify,
    // A failed ONNX WebGPU initialization can poison same-realm CPU retries.
    createWorker: () =>
      new Worker(new URL("./kokoro-worker.mjs", import.meta.url), {
        type: "module",
      }),
  });
}

export function initVoiceGenerator(root) {
  const pick = (name) => root.querySelector(`[data-bhktw="${name}"]`);
  const session = createVoiceSession();
  const model = pick("model"),
    voice = pick("voice"),
    speed = pick("speed");
  const button = pick("generate"),
    status = pick("status-msg"),
    error = pick("err");
  const output = pick("output"),
    audio = pick("audio");
  const mp3 = pick("download-mp3"),
    wav = pick("download-wav");
  const downloads = new Map();
  let audioUrl;
  function resetOutput() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = undefined;
    downloads.clear();
    mp3.disabled = wav.disabled = true;
    output.classList.add("hidden");
  }
  function showError(message) {
    error.textContent = message;
    error.classList.remove("hidden");
  }
  function renderModel() {
    const settings = session.settings;
    voice.replaceChildren(
      ...VOICE_GROUPS[session.model].map((group) => {
        const element = document.createElement("optgroup");
        element.label = group.label;
        element.append(
          ...group.voices.map(([id, label]) => new Option(label, id)),
        );
        return element;
      }),
    );
    voice.value = settings.voice;
    const range = SPEED_CONTROLS[session.model];
    for (const key of ["min", "max", "step"]) speed[key] = String(range[key]);
    speed.value = String(settings.speed);
    pick("speed-label").textContent =
      session.model === "phonon" ? "Duration adjustment" : "Speed ×";
    pick("speed-help").textContent =
      session.model === "phonon"
        ? "0 is normal; negative is faster, positive is slower. Small adjustments work best."
        : "1 is normal; larger values are faster.";
    document.querySelectorAll("[data-voice-samples]").forEach((section) => {
      const selected = section.dataset.voiceSamples === session.model;
      section.classList.toggle("hidden", !selected);
      if (!selected)
        section.querySelectorAll("audio").forEach((player) => player.pause());
    });
  }
  model.addEventListener("change", () => {
    session.select(model.value);
    resetOutput();
    error.classList.add("hidden");
    renderModel();
    status.textContent = session.busy
      ? "Stopping the previous job… Loading may need to finish first."
      : "Click Generate to load the selected model (cached files are reused).";
  });
  for (const [element, key] of [
    [voice, "voice"],
    [speed, "speed"],
  ]) {
    element.addEventListener("change", () => {
      try {
        session.configure({
          [key]: key === "speed" ? Number(element.value) : element.value,
        });
      } catch (e) {
        showError(e.message);
      }
    });
  }
  for (const [btn, extension] of [
    [mp3, "mp3"],
    [wav, "wav"],
  ]) {
    btn.addEventListener("click", () => {
      const blob = downloads.get(extension);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `audio-${session.model}-${Date.now()}.${extension}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  button.addEventListener("click", async () => {
    if (session.busy) return;
    error.classList.add("hidden");
    const text = pick("text").value.trim();
    if (!text || text.length > 50000) {
      showError(
        !text
          ? "Paste some text first."
          : "Please use at most 50,000 characters.",
      );
      return;
    }
    try {
      session.configure({ voice: voice.value, speed: Number(speed.value) });
    } catch (e) {
      showError(e.message);
      return;
    }
    resetOutput();
    button.disabled = voice.disabled = speed.disabled = true;
    try {
      const result = await session.run({
        load: loadRuntime,
        synthesize: async (runtime, request, notify) => {
          const result = await generateSpeech(
            runtime,
            { ...request, text },
            notify,
          );
          notify("Encoding completed audio…");
          const wavBlob = encodeWav(result.audio, result.sampleRate);
          await loadScriptOnce(LAMEJS_URL, {
            isReady: () => getLamejs() !== null,
          });
          request.signal.throwIfAborted();
          return {
            wav: wavBlob,
            mp3: encodeMp3(result.audio, result.sampleRate),
          };
        },
        onStatus: (message) => {
          status.textContent = message;
        },
      });
      downloads.set("wav", result.wav);
      downloads.set("mp3", result.mp3);
      audioUrl = URL.createObjectURL(result.wav);
      audio.src = audioUrl;
      audio.dataset.audioLabel = `${model.options[model.selectedIndex].text} — ${voice.options[voice.selectedIndex].text}`;
      mp3.disabled = wav.disabled = false;
      output.classList.remove("hidden");
      status.textContent = "Done. The complete passage is ready.";
      window.fathom?.trackEvent?.("Voice generated");
    } catch (e) {
      if (e.name === "AbortError")
        status.textContent =
          "Model changed. Click Generate for the selected model.";
      else {
        status.textContent = "Generation failed. You can retry.";
        showError(
          session.model === "phonon"
            ? `${e.message} Phonon needs WebAssembly SIMD and module workers. Try an up-to-date browser or select Kokoro.`
            : `${e.message} Kokoro needs WebAssembly and module workers. Check your connection, retry, or select Phonon.`,
        );
      }
    } finally {
      button.disabled = voice.disabled = speed.disabled = false;
    }
  });
  renderModel();
  window.addEventListener(
    "pagehide",
    () => {
      session.select(session.model);
      resetOutput();
    },
    { once: true },
  );
}
