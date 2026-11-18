import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { launch } from "chrome-launcher";
import CDP from "chrome-remote-interface";
import {
  essaySpeechText,
  essayLongSentence,
} from "./lib/voice-smoke-input.mjs";

const origin = process.env.VOICE_SMOKE_ORIGIN || "http://localhost:4321";
const selectedModel = process.argv[2] || "phonon";
assert.ok(["phonon", "kokoro"].includes(selectedModel));
const chrome = await launch({
  chromeFlags: [
    "--headless=new",
    ...(process.env.VOICE_SMOKE_GPU === "1" ? [] : ["--disable-gpu"]),
    "--no-sandbox",
  ],
  port: 0,
});
let client;
try {
  client = await CDP({ port: chrome.port });
  const { Page, Runtime, Network, Browser, Target } = client;
  await Promise.all([Page.enable(), Runtime.enable(), Network.enable()]);
  const requests = [];
  const failures = [];
  const requestsById = new Map();
  Network.requestWillBeSent(({ requestId, request }, sessionId) => {
    const entry = {
      url: request.url,
      method: request.method,
      postData: request.postData,
      target: sessionId || "page",
      encodedBytes: 0,
    };
    requests.push(entry);
    requestsById.set(`${sessionId || "page"}:${requestId}`, entry);
  });
  Network.loadingFinished(({ requestId, encodedDataLength }, sessionId) => {
    const entry = requestsById.get(`${sessionId || "page"}:${requestId}`);
    if (entry) entry.encodedBytes = encodedDataLength;
  });
  const attachmentFailures = [];
  Target.attachedToTarget(async ({ sessionId }) => {
    try {
      await client.send("Network.enable", {}, sessionId);
      await client.send(
        "Target.setAutoAttach",
        { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
        sessionId,
      );
    } catch (error) {
      attachmentFailures.push(error.message);
    } finally {
      await client
        .send("Runtime.runIfWaitingForDebugger", {}, sessionId)
        .catch((error) => attachmentFailures.push(error.message));
    }
  });
  await Target.setAutoAttach({
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: true,
  });
  Runtime.exceptionThrown(({ exceptionDetails }) =>
    failures.push(
      exceptionDetails.text + ": " + exceptionDetails.exception?.description,
    ),
  );
  await Browser.setDownloadBehavior({ behavior: "deny" });
  const evaluate = async (expression) => {
    const result = await Runtime.evaluate({
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const ready = Page.loadEventFired();
  await Page.navigate({ url: `${origin}/resources/free-ai-voice-generator/` });
  await ready;
  await evaluate(`new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { clearInterval(timer); reject(new Error('Generator did not initialize')); }, 30000);
    const timer = setInterval(() => {
      if (document.querySelector('[data-bhktw="voice"]')?.value === 'NbpkqMVS3CJeq2j8') { clearInterval(timer); clearTimeout(timeout); resolve(); }
    }, 100);
  })`);
  assert.deepEqual(
    await evaluate(
      `({model: document.querySelector('[data-bhktw="model"]').value, count: document.querySelector('[data-bhktw="voice"]').options.length})`,
    ),
    { model: "phonon", count: 37 },
  );
  if (process.env.VOICE_SMOKE_LIFECYCLE === "1") {
    const recovery = await evaluate(`(async () => {
      const pick = name => document.querySelector('[data-bhktw="'+name+'"]');
      const NativeWorker = window.Worker;
      window.Worker = class { constructor() { throw new Error('Module workers unavailable (smoke fixture)'); } };
      pick('model').value = ${JSON.stringify(selectedModel)}; pick('model').dispatchEvent(new Event('change'));
      pick('text').value = 'A short recovery test.'; pick('generate').click();
      await new Promise((resolve, reject) => { const started = Date.now(); const timer = setInterval(() => {
        if (!pick('generate').disabled) { clearInterval(timer); resolve(); }
        else if (Date.now()-started > 30000) { clearInterval(timer); reject(new Error('Failure recovery timed out')); }
      }, 50); });
      window.Worker = NativeWorker;
      return { message: pick('err').textContent, hidden: pick('output').classList.contains('hidden'), src: pick('audio').getAttribute('src'), enabled: !pick('generate').disabled };
    })()`);
    assert.match(recovery.message, /Module workers unavailable/);
    assert.match(
      recovery.message,
      selectedModel === "phonon" ? /Phonon needs/ : /Kokoro needs/,
    );
    assert.equal(recovery.hidden, true);
    assert.equal(recovery.src, null);
    assert.equal(recovery.enabled, true);
    console.log(JSON.stringify({ recovery }));
  }
  await evaluate(`{
    const NativeWorker = window.Worker;
    window.__liveWorkers = new Set(); window.__maxWorkers = 0; window.__runtimeDetails = [];
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        window.__liveWorkers.add(this); window.__maxWorkers = Math.max(window.__maxWorkers, window.__liveWorkers.size);
        let requestedDevice;
        const send = this.postMessage.bind(this);
        this.postMessage = (message, ...rest) => { if (message.type === 'load') requestedDevice = message.options.device; return send(message, ...rest); };
        this.addEventListener('message', ({data}) => {
          if (data.type === 'result' && data.value?.device) window.__runtimeDetails.push({model: 'phonon', device: data.value.device, reason: data.value.deviceReason, threads: data.value.threads});
          if (data.result === true && requestedDevice) window.__runtimeDetails.push({model: 'kokoro', device: requestedDevice});
        });
        const stop = this.terminate.bind(this);
        this.terminate = () => { window.__liveWorkers.delete(this); stop(); };
      }
    };
  }`);
  let passage =
    "The first part begins here. We walk through a quiet garden and notice the different flowers growing along the wall. At the far end there is a bench where someone has left a blue umbrella. The second part begins after the gate. " +
    "The long sentence starts with a red umbrella and " +
    "the visitor follows the winding path past the trees and across the wooden bridge while the afternoon light falls over the water and the leaves turn gently in the breeze and ".repeat(
      9,
    ) +
    "the long sentence ends beside a yellow bicycle.";
  const essaySlug = process.env.VOICE_SMOKE_ESSAY;
  if (essaySlug) {
    assert.match(essaySlug, /^[a-z0-9-]+$/);
    const response = await fetch(`${origin}/${essaySlug}/`);
    assert.ok(response.ok, `Essay request failed: ${response.status}`);
    passage = essaySpeechText(await response.text());
    if (process.env.VOICE_SMOKE_LONG_SENTENCE === "1")
      passage = essayLongSentence(passage);
  }
  console.log(
    JSON.stringify({
      essaySlug,
      characters: passage.length,
      words: passage.split(/\s+/).length,
      longSentence: process.env.VOICE_SMOKE_LONG_SENTENCE === "1",
    }),
  );
  assert.ok(passage.length > 0 && passage.length <= 50000);
  await evaluate(`{
    const pick = n => document.querySelector('[data-bhktw="'+n+'"]');
    pick('text').value = ${JSON.stringify(passage)};
    pick('model').value = 'phonon'; pick('model').dispatchEvent(new Event('change'));
    pick('speed').value = '1.3'; pick('speed').dispatchEvent(new Event('change'));
    pick('model').value = 'kokoro'; pick('model').dispatchEvent(new Event('change'));
    if (pick('voice').options.length !== 28) throw new Error('Kokoro voice count');
    pick('speed').value = '1.2'; pick('speed').dispatchEvent(new Event('change'));
    pick('model').value = 'phonon'; pick('model').dispatchEvent(new Event('change'));
    if (pick('speed').value !== '1.3' || pick('text').value !== ${JSON.stringify(passage)}) throw new Error('State not restored');
    pick('model').value = ${JSON.stringify(selectedModel)}; pick('model').dispatchEvent(new Event('change'));
    pick('speed').value = ${JSON.stringify("1")}; pick('speed').dispatchEvent(new Event('change'));
    window.__blobs = [];
    const createUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { window.__blobs.push(blob); return createUrl(blob); };
    window.__earlyOutput = false;
    window.__watch = setInterval(() => {
      if (pick('generate').disabled && (!pick('output').classList.contains('hidden') || pick('audio').getAttribute('src'))) window.__earlyOutput = true;
    }, 50);
    pick('generate').click();
  }`);
  if (process.env.VOICE_SMOKE_LIFECYCLE === "1") {
    const switched = await evaluate(`(async () => {
      const pick = name => document.querySelector('[data-bhktw="'+name+'"]');
      pick('model').value = ${JSON.stringify(selectedModel === "phonon" ? "kokoro" : "phonon")}; pick('model').dispatchEvent(new Event('change'));
      pick('model').value = ${JSON.stringify(selectedModel)}; pick('model').dispatchEvent(new Event('change'));
      await new Promise((resolve, reject) => { const started = Date.now(); const timer = setInterval(() => {
        if (!pick('generate').disabled) { clearInterval(timer); resolve(); }
        else if (Date.now()-started > 180000) { clearInterval(timer); reject(new Error('Old load did not settle')); }
      }, 100); });
      const result = { hidden: pick('output').classList.contains('hidden'), src: pick('audio').getAttribute('src'), live: window.__liveWorkers.size };
      pick('generate').click();
      return result;
    })()`);
    assert.deepEqual(switched, { hidden: true, src: null, live: 0 });
    console.log(JSON.stringify({ switched }));
  }
  const outcome = await evaluate(`new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { clearInterval(timer); reject(new Error('Generation timeout: '+document.querySelector('[data-bhktw="status-msg"]').textContent)); }, ${Number(process.env.VOICE_SMOKE_TIMEOUT_MS || 600000)});
    const timer = setInterval(() => {
      const button = document.querySelector('[data-bhktw="generate"]');
      if (button.disabled) return;
      clearInterval(timer); clearTimeout(timeout); clearInterval(window.__watch);
      const error = document.querySelector('[data-bhktw="err"]');
      resolve({error: error.classList.contains('hidden') ? null : error.textContent, earlyOutput: window.__earlyOutput, src: document.querySelector('[data-bhktw="audio"]').src, mp3: !document.querySelector('[data-bhktw="download-mp3"]').disabled, wav: !document.querySelector('[data-bhktw="download-wav"]').disabled });
    }, 500);
  })`);
  console.log(
    JSON.stringify(
      { selectedModel, outcome, failures, attachmentFailures, requests },
      null,
      2,
    ),
  );
  assert.deepEqual(attachmentFailures, []);
  assert.ok(
    requests.some(
      (request) =>
        request.target !== "page" && request.url.includes("huggingface.co/"),
    ),
  );
  assert.equal(outcome.error, null);
  const runtimeDetails = await evaluate("window.__runtimeDetails");
  const backend = runtimeDetails
    .filter((runtime) => runtime.model === selectedModel)
    .at(-1);
  assert.ok(backend, "Runtime did not report its selected backend");
  assert.equal(
    backend.device,
    process.env.VOICE_SMOKE_GPU === "1"
      ? "webgpu"
      : selectedModel === "phonon"
        ? "cpu"
        : "wasm",
  );
  console.log(JSON.stringify({ backend, runtimeDetails }));
  assert.equal(outcome.earlyOutput, false);
  assert.equal(outcome.mp3, true);
  assert.equal(outcome.wav, true);
  const workers = await evaluate(
    `({live: window.__liveWorkers.size, maximum: window.__maxWorkers})`,
  );
  assert.equal(workers.live, 0);
  assert.ok(workers.maximum <= 1);
  console.log(JSON.stringify({ workers }));
  const decoded = await evaluate(`(async () => {
    const response = await fetch(document.querySelector('[data-bhktw="audio"]').src);
    const bytes = await response.arrayBuffer();
    const view = new DataView(bytes);
    const context = new AudioContext();
    const decoded = await context.decodeAudioData(bytes.slice(0));
    await context.close();
    return {sampleRate: view.getUint32(24, true), samples: view.getUint32(40, true) / 2, duration: decoded.duration};
  })()`);
  const mp3Decoded = await evaluate(`(async () => {
    document.querySelector('[data-bhktw="download-mp3"]').click();
    document.querySelector('[data-bhktw="download-wav"]').click();
    const blob = window.__blobs.find(blob => blob.type === 'audio/mpeg');
    if (!blob) throw new Error('MP3 download missing');
    const context = new AudioContext();
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    await context.close();
    return { bytes: blob.size, duration: decoded.duration, channels: decoded.numberOfChannels };
  })()`);
  assert.ok(mp3Decoded.bytes > 1000);
  assert.ok(Math.abs(mp3Decoded.duration - decoded.duration) < 0.2);
  console.log(JSON.stringify({ mp3Decoded }));
  const outputDirectory =
    process.env.VOICE_SMOKE_OUTPUT_DIR || "/tmp/voice96-audio";
  await mkdir(outputDirectory, { recursive: true });
  const prefix = `${outputDirectory}/${selectedModel}-${process.env.VOICE_SMOKE_GPU === "1" ? "gpu" : "cpu"}${essaySlug ? `-${essaySlug}${process.env.VOICE_SMOKE_LONG_SENTENCE === "1" ? "-long-sentence" : ""}` : ""}`;
  for (const [extension, mime] of [
    ["wav", "audio/wav"],
    ["mp3", "audio/mpeg"],
  ]) {
    const base64 = await evaluate(`(async () => {
      const blob = window.__blobs.find(blob => blob.type === ${JSON.stringify(mime)});
      return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob); });
    })()`);
    await writeFile(`${prefix}.${extension}`, Buffer.from(base64, "base64"));
  }
  await writeFile(`${prefix}.txt`, passage);
  const screenshot = await Page.captureScreenshot({ format: "png" });
  await writeFile(`${prefix}.png`, Buffer.from(screenshot.data, "base64"));
  console.log(
    JSON.stringify({
      outputPrefix: prefix,
      listening: "Not performed; local files retained for review.",
    }),
  );
  assert.equal(decoded.sampleRate, 24000);
  assert.ok(decoded.duration > 10);
  assert.ok(
    !requests.some(
      (r) =>
        r.postData?.includes(passage) ||
        r.url.includes(encodeURIComponent(passage)),
    ),
  );
  assert.ok(
    !requests.some((r) => r.method === "POST" && !r.url.startsWith(origin)),
  );
  console.log(
    JSON.stringify(
      {
        decoded,
        privacy:
          "No remote POST or passage-bearing URL/body observed across attached page and worker targets.",
        modelEncodedBytes: requests
          .filter((request) => /huggingface\.co|hf\.co/.test(request.url))
          .reduce((total, request) => total + request.encodedBytes, 0),
        attachmentFailures,
      },
      null,
      2,
    ),
  );
} finally {
  await client?.close();
  await chrome.kill();
}
