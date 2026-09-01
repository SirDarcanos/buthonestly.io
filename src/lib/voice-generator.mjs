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
