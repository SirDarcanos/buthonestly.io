import { chunkText } from "./chunk-text.mjs";
import { VOICE_GROUPS, SPEED_CONTROLS } from "./voice-catalogue.mjs";

export const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const KOKORO_MODEL_REVISION = "1939ad2a8e416c0acfeecc08a694d14ef25f2231";
export const KOKORO_MODULE_URL =
  "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
export const LAMEJS_URL =
  "https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js";

export function modelLoadSequence(hasWebGpu) {
  return hasWebGpu ? ["webgpu", "wasm"] : ["wasm"];
}

export function modelLoadOptions(runtime) {
  if (runtime === "webgpu") {
    return {
      revision: KOKORO_MODEL_REVISION,
      dtype: "fp32",
      device: "webgpu",
    };
  }
  return {
    revision: KOKORO_MODEL_REVISION,
    dtype: "q8",
    device: "wasm",
  };
}

const mutableAssetBase = `https://huggingface.co/${KOKORO_MODEL_ID}/resolve/main/`;
const pinnedAssetBase = `https://huggingface.co/${KOKORO_MODEL_ID}/resolve/${KOKORO_MODEL_REVISION}/`;

function pinModelAssetUrl(url) {
  return url.startsWith(mutableAssetBase)
    ? `${pinnedAssetBase}${url.slice(mutableAssetBase.length)}`
    : url;
}

export function createPinnedModelFetch(fetchImpl) {
  return (input, init) => {
    if (typeof input === "string")
      return fetchImpl(pinModelAssetUrl(input), init);
    if (input instanceof URL)
      return fetchImpl(new URL(pinModelAssetUrl(input.href)), init);
    if (typeof Request !== "undefined" && input instanceof Request) {
      return fetchImpl(new Request(pinModelAssetUrl(input.url), input), init);
    }
    return fetchImpl(input, init);
  };
}

export async function generateSpeech(runtime, request, notify = () => {}) {
  const { model, text, voice, speed, signal } = request;
  if (!text?.trim()) throw new Error("Paste some text first.");
  if (text.length > 50000)
    throw new Error("Please use at most 50,000 characters.");
  const parts = [];
  let sampleRate = runtime.sampleRate || 24000;
  const check = () => signal?.throwIfAborted();
  if (model === "phonon") {
    for (const chunk of chunkText(text, 40)) {
      check();
      const speech = runtime.stream(chunk, { voice, signal });
      for await (const pcm of speech) {
        check();
        parts.push(pcm);
        notify("Generating Phonon audio…");
      }
      await speech.done;
    }
  } else {
    const segments = text.split(/(\[\d+(?:\.\d+)?s\])/g);
    for (const segment of segments) {
      check();
      if (/^\[\d+(?:\.\d+)?s\]$/.test(segment)) {
        parts.push(
          new Float32Array(
            Math.round(parseFloat(segment.slice(1)) * sampleRate),
          ),
        );
        continue;
      }
      // Kokoro's phoneme context truncates long input; retain the existing 60-word bound.
      for (const chunk of chunkText(segment, 60)) {
        check();
        notify("Generating Kokoro audio…");
        const result = await runtime.generate(chunk, { voice, speed });
        const rate = result.sampling_rate || result.sampleRate;
        if (!result.audio || !Number.isFinite(rate))
          throw new Error("Unexpected Kokoro output.");
        if (parts.length && rate !== sampleRate)
          throw new Error("Audio sample rate changed.");
        sampleRate = rate;
        parts.push(result.audio);
      }
    }
  }
  check();
  const audio = new Float32Array(
    parts.reduce((total, pcm) => total + pcm.length, 0),
  );
  let offset = 0;
  for (const pcm of parts) {
    audio.set(pcm, offset);
    offset += pcm.length;
  }
  if (!audio.length)
    throw new Error("No audio was generated. Please try again.");
  return { audio, sampleRate };
}

export function createVoiceSession() {
  let model = "phonon";
  let revision = 0;
  let busy = false;
  let activeController;
  const settings = {
    phonon: { voice: "NbpkqMVS3CJeq2j8", speed: 0 },
    kokoro: { voice: "af_heart", speed: 1 },
  };
  return {
    get model() {
      return model;
    },
    get settings() {
      return { ...settings[model] };
    },
    get busy() {
      return busy;
    },
    select(next) {
      if (!VOICE_GROUPS[next]) throw new Error("Unknown model.");
      revision++;
      activeController?.abort();
      model = next;
    },
    configure(patch) {
      const next = { ...settings[model], ...patch };
      if (
        !VOICE_GROUPS[model].some((group) =>
          group.voices.some(([id]) => id === next.voice),
        )
      )
        throw new Error("Unsupported voice.");
      const range = SPEED_CONTROLS[model];
      if (
        !Number.isFinite(next.speed) ||
        next.speed < range.min ||
        next.speed > range.max
      )
        throw new Error("Unsupported speed.");
      settings[model] = next;
    },
    async run({ load, synthesize, onStatus = () => {} }) {
      if (busy) throw new Error("A generation is already running.");
      busy = true;
      const token = revision;
      const controller = new AbortController();
      activeController = controller;
      const request = { model, ...settings[model], signal: controller.signal };
      const assertCurrent = () => {
        if (token !== revision)
          throw new DOMException(
            "Model changed. Generate again for the selected model.",
            "AbortError",
          );
      };
      const notify = (...args) => {
        if (token === revision) onStatus(...args);
      };
      let runtime;
      let result;
      try {
        runtime = await load(request, notify);
        assertCurrent();
        result = await synthesize(runtime, request, notify);
        assertCurrent();
      } catch (error) {
        assertCurrent();
        throw error;
      } finally {
        try {
          await runtime?.dispose?.();
        } finally {
          busy = false;
          activeController = undefined;
        }
      }
      assertCurrent();
      return result;
    },
  };
}

const scriptLoads = new Map();

export function loadScriptOnce(
  url,
  { document = globalThis.document, isReady = () => false } = {},
) {
  if (isReady()) return Promise.resolve();
  if (scriptLoads.has(url)) return scriptLoads.get(url);

  const load = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Unable to load ${url}`));
    document.head.append(script);
  }).catch((error) => {
    scriptLoads.delete(url);
    throw error;
  });
  scriptLoads.set(url, load);
  return load;
}
