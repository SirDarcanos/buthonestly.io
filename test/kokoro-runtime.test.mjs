import assert from "node:assert/strict";
import test from "node:test";

let runtime;
try {
  runtime = await import("../src/lib/kokoro-runtime.mjs");
} catch (error) {
  if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
}

function workerFor(device, calls) {
  return {
    terminate() {
      calls.push([device, "terminated"]);
    },
    postMessage(message) {
      calls.push([device, message.type, message.options?.device]);
      queueMicrotask(() => {
        if (message.type === "load" && device === "webgpu")
          this.onmessage({
            data: { id: message.id, error: "GPU initialization failed" },
          });
        else
          this.onmessage({
            data: {
              id: message.id,
              result:
                message.type === "generate"
                  ? { audio: new Float32Array([0.5]), sampling_rate: 24000 }
                  : true,
            },
          });
      });
    },
  };
}

test("a failed WebGPU runtime terminates before an isolated CPU retry", async () => {
  assert.equal(typeof runtime?.loadKokoroRuntime, "function");
  const calls = [];
  let count = 0;
  const loaded = await runtime.loadKokoroRuntime({
    hasWebGpu: true,
    createWorker: () => workerFor(count++ ? "wasm" : "webgpu", calls),
  });
  assert.deepEqual(calls.slice(0, 3), [
    ["webgpu", "load", "webgpu"],
    ["webgpu", "terminated"],
    ["wasm", "load", "wasm"],
  ]);
  assert.deepEqual(
    await loaded.generate("Hello", { voice: "af_heart", speed: 1 }),
    { audio: new Float32Array([0.5]), sampling_rate: 24000 },
  );
  loaded.dispose();
  assert.deepEqual(calls.at(-1), ["wasm", "terminated"]);
});

test("CPU-only loading uses one worker and worker crashes reject and clean up", async () => {
  assert.equal(typeof runtime?.loadKokoroRuntime, "function");
  const calls = [];
  const worker = workerFor("wasm", calls);
  const loaded = await runtime.loadKokoroRuntime({
    hasWebGpu: false,
    createWorker: () => worker,
  });
  assert.equal(calls.length, 1);
  worker.postMessage = () => {};
  const pending = loaded.generate("Hello", { voice: "af_heart", speed: 1 });
  worker.onerror({ message: "worker crashed", preventDefault() {} });
  await assert.rejects(pending, /worker crashed/);
  await assert.rejects(loaded.generate("Retry", {}), /worker crashed/);
  assert.deepEqual(calls.at(-1), ["wasm", "terminated"]);
});
