import { modelLoadOptions, modelLoadSequence } from "./voice-generator.mjs";

function workerRuntime(worker, notify) {
  let nextId = 0;
  let failure;
  const pending = new Map();
  function dispose(error = new Error("Kokoro runtime stopped.")) {
    if (failure) return;
    failure = error;
    worker.terminate();
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }
  worker.onmessage = ({ data }) => {
    if (data.status) {
      notify(data.status);
      return;
    }
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.error) request.reject(new Error(data.error));
    else request.resolve(data.result);
  };
  worker.onerror = (event) => {
    event.preventDefault?.();
    dispose(
      new Error(
        `Kokoro module worker failed: ${event.message || "could not start"}`,
      ),
    );
  };
  function request(message) {
    if (failure) return Promise.reject(failure);
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ ...message, id });
      } catch (error) {
        dispose(error);
      }
    });
  }
  return {
    request,
    dispose,
    generate: (text, options) => request({ type: "generate", text, options }),
  };
}

export async function loadKokoroRuntime({
  hasWebGpu,
  createWorker,
  notify = () => {},
  loadTimeoutMs = 180000,
}) {
  let lastError;
  for (const device of modelLoadSequence(hasWebGpu)) {
    notify(`Loading Kokoro ${device === "wasm" ? "CPU" : "WebGPU"} model…`);
    const runtime = workerRuntime(createWorker(), notify);
    const timer = setTimeout(
      () =>
        runtime.dispose(
          new Error(
            "Kokoro loading timed out. Check your connection and try again.",
          ),
        ),
      loadTimeoutMs,
    );
    try {
      await runtime.request({
        type: "load",
        options: modelLoadOptions(device),
      });
      return runtime;
    } catch (error) {
      lastError = error;
      runtime.dispose();
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
