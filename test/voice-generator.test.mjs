import assert from "node:assert/strict";
import test from "node:test";

import {
  KOKORO_MODEL_ID,
  KOKORO_MODEL_REVISION,
  createPinnedModelFetch,
  loadScriptOnce,
  modelLoadOptions,
  modelLoadSequence,
} from "../src/lib/voice-generator.mjs";

test("Kokoro model loads use the reviewed ONNX revision", () => {
  assert.equal(KOKORO_MODEL_ID, "onnx-community/Kokoro-82M-v1.0-ONNX");
  assert.equal(
    KOKORO_MODEL_REVISION,
    "1939ad2a8e416c0acfeecc08a694d14ef25f2231",
  );
  assert.deepEqual(modelLoadOptions("webgpu"), {
    revision: KOKORO_MODEL_REVISION,
    dtype: "fp32",
    device: "webgpu",
  });
  assert.deepEqual(modelLoadOptions("wasm"), {
    revision: KOKORO_MODEL_REVISION,
    dtype: "q8",
    device: "wasm",
  });
  assert.deepEqual(modelLoadSequence(false), ["wasm"]);
  assert.deepEqual(modelLoadSequence(true), ["webgpu", "wasm"]);
});

test("Kokoro asset requests are rewritten from main to the reviewed revision", async () => {
  const requests = [];
  const pinnedFetch = createPinnedModelFetch(async (input, init) => {
    requests.push([input, init]);
    return { ok: true };
  });

  await pinnedFetch(
    "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/af_heart.bin",
    { cache: "force-cache" },
  );
  await pinnedFetch(
    "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/config.json",
  );
  await pinnedFetch("https://example.com/other.json");

  assert.equal(
    requests[0][0],
    `https://huggingface.co/${KOKORO_MODEL_ID}/resolve/${KOKORO_MODEL_REVISION}/voices/af_heart.bin`,
  );
  assert.deepEqual(requests[0][1], { cache: "force-cache" });
  assert.equal(
    requests[1][0],
    `https://huggingface.co/${KOKORO_MODEL_ID}/resolve/${KOKORO_MODEL_REVISION}/config.json`,
  );
  assert.equal(requests[2][0], "https://example.com/other.json");
});

test("external scripts load only when requested and concurrent calls share one load", async () => {
  const appended = [];
  const document = {
    createElement(tag) {
      assert.equal(tag, "script");
      return {};
    },
    head: {
      append(script) {
        appended.push(script);
      },
    },
  };
  let ready = false;
  const url = "https://cdn.example.test/encoder.js";

  const first = loadScriptOnce(url, { document, isReady: () => ready });
  const second = loadScriptOnce(url, { document, isReady: () => ready });

  assert.equal(appended.length, 1);
  ready = true;
  appended[0].onload();
  await Promise.all([first, second]);

  await loadScriptOnce(url, { document, isReady: () => ready });
  assert.equal(appended.length, 1);
});
