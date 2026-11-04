import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { launch } from "chrome-launcher";
import CDP from "chrome-remote-interface";
import { VOICE_GROUPS, previewPath } from "../src/lib/voice-catalogue.mjs";

const origin = process.env.VOICE_SMOKE_ORIGIN || "http://localhost:4321";
const directory =
  process.env.VOICE_ACCEPTANCE_OUTPUT || "/tmp/voice99-remaining";
const manifestPath = process.env.VOICE_PREVIEW_MANIFEST;
assert.ok(
  manifestPath,
  "Set VOICE_PREVIEW_MANIFEST to the uploaded handoff manifest",
);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
await mkdir(directory, { recursive: true });
const chrome = await launch({
  chromeFlags: ["--headless=new", "--disable-gpu", "--no-sandbox"],
  port: 0,
});
let client;
const report = {
  source: process.env.VOICE_ACCEPTANCE_HEAD,
  status: "running",
  checks: [],
  requests: [],
};
try {
  client = await CDP({ port: chrome.port });
  const { Page, Runtime, Network, Target, Browser } = client;
  report.browser = await Browser.getVersion();
  await Promise.all([Page.enable(), Runtime.enable(), Network.enable()]);
  let phase = "initial";
  const pending = new Map();
  const attachmentFailures = [];
  Network.requestWillBeSent(({ requestId, request }, session) => {
    const entry = {
      phase,
      url: request.url,
      method: request.method,
      postData: request.postData,
      target: session || "page",
      bytes: 0,
    };
    report.requests.push(entry);
    pending.set(`${session}:${requestId}`, entry);
  });
  Network.loadingFinished(({ requestId, encodedDataLength }, session) => {
    const entry = pending.get(`${session}:${requestId}`);
    if (entry) entry.bytes = encodedDataLength;
  });
  Target.attachedToTarget(async ({ sessionId }) => {
    try {
      await client.send("Network.enable", {}, sessionId);
      if (phase.endsWith("-unsupported-wasm")) {
        await client.send(
          "Runtime.evaluate",
          {
            expression: `{
            const unavailable = () => { throw new WebAssembly.CompileError('WebAssembly unavailable (controlled environment)'); };
            WebAssembly.compile = unavailable; WebAssembly.compileStreaming = unavailable;
            WebAssembly.instantiate = unavailable; WebAssembly.instantiateStreaming = unavailable;
          }`,
          },
          sessionId,
        );
      }
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
  const check = (name, evidence) => {
    report.checks.push({ name, evidence });
    console.log(JSON.stringify({ name, evidence }));
  };
  const ready = Page.loadEventFired();
  await Page.navigate({ url: `${origin}/resources/free-ai-voice-generator/` });
  await ready;
  await evaluate(`new Promise((resolve, reject) => {
    const start = Date.now(); const timer = setInterval(() => {
      if (document.querySelector('[data-bhktw="voice"]')?.options.length === 37) { clearInterval(timer); resolve(); }
      else if (Date.now()-start > 30000) { clearInterval(timer); reject(Error('Initialization timed out')); }
    }, 50);
  })`);
  await evaluate(`{
    window.pick = name => document.querySelector('[data-bhktw="'+name+'"]');
    window.choose = model => { pick('model').value = model; pick('model').dispatchEvent(new Event('change')); };
    window.waitFor = (test, timeout = 180000) => new Promise((resolve, reject) => {
      const start = Date.now(); const timer = setInterval(() => {
        if (test()) { clearInterval(timer); resolve(); }
        else if (Date.now()-start > timeout) { clearInterval(timer); reject(Error('Timed out: '+pick('status-msg').textContent)); }
      }, 20);
    });
    window.live = new Set(); window.maximum = 0; window.events = []; window.switchAt = null;
    const NativeWorker = window.Worker; window.NativeWorker = NativeWorker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args); live.add(this); maximum = Math.max(maximum, live.size);
        const send = this.postMessage.bind(this); const terminate = this.terminate.bind(this);
        this.terminate = () => { live.delete(this); events.push({type:'terminated', at:performance.now()}); terminate(); };
        this.postMessage = (message, ...rest) => {
          events.push({type:'send', messageType:message.type, id:message.id, options:message.options, at:performance.now()});
          send(message, ...rest);
          if (message.type === 'generate' && window.switchAt === 'kokoro') {
            setTimeout(() => { events.push({type:'switch', at:performance.now()}); choose('phonon'); window.switchAt = null; }, 100);
          }
        };
        this.addEventListener('message', ({data}) => {
          events.push({type:'receive', messageType:data.type, id:data.id, event:data.event, audioSamples:data.result?.audio?.length, result:data.result === true, device:data.value?.device, reason:data.value?.deviceReason, at:performance.now()});
          if (data.type === 'chunk' && window.switchAt === 'phonon') {
            events.push({type:'switch', at:performance.now()}); choose('kokoro'); window.switchAt = null;
          }
        });
      }
    };
  }`);
  const state = await evaluate(`(() => {
    if (pick('model').value !== 'phonon') throw Error('Fresh default is not Phonon');
    const configure = (name,value) => { pick(name).value=value; pick(name).dispatchEvent(new Event(name === 'speed' ? 'input' : 'change')); };
    pick('text').value='A preserved passage.';
    configure('voice','NIWIOv5vTi5eRMj8'); configure('speed','1.3');
    if (pick('speed-value').textContent !== '1.3×') throw Error('Phonon slider readout did not update');
    choose('kokoro'); configure('voice','af_bella'); configure('speed','1.25');
    if (pick('speed-value').textContent !== '1.25×') throw Error('Kokoro slider readout did not update');
    const result = {};
    for (const model of ['phonon','kokoro']) {
      choose(model); result[model] = {voice:pick('voice').value,speed:pick('speed').value,text:pick('text').value};
    }
    result.validations = [];
    for (const model of ['phonon','kokoro']) {
      choose(model);
      for (const text of ['   ','x'.repeat(50001)]) {
        pick('text').value=text; pick('generate').click();
        if (pick('generate').disabled) throw Error('Invalid input started a job');
        result.validations.push(pick('err').textContent);
      }
    }
    choose('phonon'); return result;
  })()`);
  assert.deepEqual(state.phonon, {
    voice: "NIWIOv5vTi5eRMj8",
    speed: "1.3",
    text: "A preserved passage.",
  });
  assert.deepEqual(state.kokoro, {
    voice: "af_bella",
    speed: "1.25",
    text: "A preserved passage.",
  });
  assert.deepEqual(state.validations, [
    "Paste some text first.",
    "Please use at most 50,000 characters.",
    "Paste some text first.",
    "Please use at most 50,000 characters.",
  ]);
  await evaluate(`{
    for (const model of ['phonon','kokoro']) {
      choose(model); pick('voice').value = model === 'phonon' ? 'NbpkqMVS3CJeq2j8' : 'af_heart';
      pick('voice').dispatchEvent(new Event('change'));
    }
    choose('phonon');
  }`);
  check("fresh default, independent settings and validation", state);
  const mappings = await evaluate(`(() => {
    const result = {};
    for (const model of ['phonon','kokoro']) {
      choose(model);
      const section = document.querySelector('[data-voice-samples="'+model+'"]');
      result[model] = {
        groups:[...pick('voice').children].map(group => ({label:group.label, voices:[...group.children].map(option => [option.value,option.text])})),
        previews:[...section.querySelectorAll('audio')].map(audio => ({name:audio.dataset.audioLabel,url:audio.src,group:audio.closest('.grid').previousElementSibling.textContent})),
        visible:!section.classList.contains('hidden')
      };
    }
    choose('phonon'); return result;
  })()`);
  for (const model of ["phonon", "kokoro"]) {
    assert.deepEqual(mappings[model].groups, VOICE_GROUPS[model]);
    assert.equal(mappings[model].visible, true);
    assert.deepEqual(
      mappings[model].previews,
      VOICE_GROUPS[model].flatMap((group) =>
        group.voices.map(([id, name]) => ({
          name,
          group: group.label,
          url: `https://static.buthonestly.io/${previewPath(model, id)}`,
        })),
      ),
    );
  }
  check("rendered mappings", mappings);
  phase = "previews";
  for (const model of ["phonon", "kokoro"]) {
    const decoded = [];
    for (const preview of mappings[model].previews) {
      const response = await fetch(preview.url, {
        signal: AbortSignal.timeout(60000),
      });
      assert.ok(response.ok, `Preview HTTP ${response.status}: ${preview.url}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const result = await evaluate(`(async () => {
        const player = [...document.querySelectorAll('[data-voice-samples] audio')].find(player => player.src === ${JSON.stringify(preview.url)});
        await new Promise((resolve,reject) => {
          const timeout = setTimeout(() => reject(Error('Preview media timeout')),30000);
          player.addEventListener('loadedmetadata',() => { clearTimeout(timeout); resolve(); },{once:true});
          player.addEventListener('error',() => { clearTimeout(timeout); reject(Error('Preview media error '+player.error.code)); },{once:true});
          player.load();
        });
        const bytes = Uint8Array.from(atob(${JSON.stringify(bytes.toString("base64"))}), char => char.charCodeAt(0)).buffer;
        const context = new AudioContext();
        try { const audio = await context.decodeAudioData(bytes); return {duration:audio.duration,mediaDuration:player.duration,channels:audio.numberOfChannels}; }
        finally { await context.close(); }
      })()`);
      result.bytes = bytes.length;
      result.hash = createHash("sha256").update(bytes).digest("hex");
      assert.ok(result.duration > 1);
      if (model === "phonon") {
        const entry = manifest.files.find((entry) =>
          preview.url.endsWith(entry.filename),
        );
        assert.ok(entry, `Missing manifest entry: ${preview.url}`);
        assert.equal(result.hash, entry.sha256);
      }
      decoded.push({ ...preview, ...result });
    }
    check(`${model} public preview decode`, decoded);
  }
  const text =
    "Some mornings, the coffee tastes better than usual, and I never quite know why.";
  const run = async (model, speed, label) => {
    phase = label;
    const result = await evaluate(`(async () => {
      choose(${JSON.stringify(model)});
      pick('speed').value = ${JSON.stringify(String(speed))}; pick('speed').dispatchEvent(new Event('change'));
      pick('text').value = ${JSON.stringify(text)};
      const statuses = []; const observer = new MutationObserver(() => statuses.push(pick('status-msg').textContent));
      observer.observe(pick('status-msg'), {childList:true,subtree:true,characterData:true});
      const started = performance.now(); pick('generate').click();
      await waitFor(() => !pick('generate').disabled);
      observer.disconnect();
      if (!pick('err').classList.contains('hidden')) throw Error(pick('err').textContent);
      if (pick('output').classList.contains('hidden')) throw Error('Completed output missing');
      const bytes = await (await fetch(pick('audio').src)).arrayBuffer();
      const view = new DataView(bytes);
      return {milliseconds:performance.now()-started,seconds:view.getUint32(40,true)/2/view.getUint32(24,true),sampleRate:view.getUint32(24,true),statuses,live:live.size,maximum,label:pick('audio').dataset.audioLabel,events};
    })()`);
    assert.equal(result.live, 0);
    assert.equal(result.maximum, 1);
    assert.equal(result.sampleRate, 24000);
    assert.ok(result.seconds > 1);
    check(label, result);
    return result;
  };
  for (const model of ["phonon", "kokoro"]) {
    phase = `${model}-unsupported-worker`;
    const unsupported = await evaluate(`(async () => {
      choose(${JSON.stringify(model)}); const WorkingWorker = window.Worker;
      window.Worker = class { constructor() { throw Error('Module workers unavailable (controlled environment)'); } };
      pick('text').value = ${JSON.stringify(text)}; pick('generate').click();
      await waitFor(() => !pick('generate').disabled); window.Worker = WorkingWorker;
      return {error:pick('err').textContent,hidden:pick('output').classList.contains('hidden'),src:pick('audio').getAttribute('src'),model:pick('model').value,live:live.size};
    })()`);
    assert.match(unsupported.error, /Module workers unavailable/);
    assert.equal(unsupported.hidden, true);
    assert.equal(unsupported.src, null);
    assert.equal(unsupported.model, model);
    assert.equal(unsupported.live, 0);
    check(phase, unsupported);
    phase = `${model}-unsupported-wasm`;
    const wasmFailure = await evaluate(`(async () => {
      pick('generate').click(); await waitFor(() => !pick('generate').disabled);
      return {error:pick('err').textContent,hidden:pick('output').classList.contains('hidden'),src:pick('audio').getAttribute('src'),model:pick('model').value,live:live.size};
    })()`);
    assert.match(wasmFailure.error, /WebAssembly|wasm/i);
    assert.equal(wasmFailure.hidden, true);
    assert.equal(wasmFailure.src, null);
    assert.equal(wasmFailure.model, model);
    assert.equal(wasmFailure.live, 0);
    check(phase, wasmFailure);
    const failedUrl = mappings[model].previews[0].url;
    await Network.setBlockedURLs({ urls: [failedUrl] });
    phase = `${model}-failed-preview`;
    const failedPreview = await evaluate(`(async () => {
      const player = document.querySelector('[data-voice-samples="${model}"] audio');
      const failed = new Promise((resolve,reject) => { player.addEventListener('error',()=>resolve(player.error.code),{once:true}); setTimeout(()=>reject(Error('Preview did not fail')),10000); });
      player.load(); player.play().catch(()=>{}); return await failed;
    })()`);
    assert.ok(failedPreview > 0);
    check(phase, { url: failedUrl, mediaErrorCode: failedPreview });
    const normal = await run(model, 1, `${model}-retry-failed-preview`);
    await Network.setBlockedURLs({ urls: [] });
    const warm = await run(model, 1, `${model}-warm`);
    const fast = await run(
      model,
      model === "phonon" ? 1.3 : 1.2,
      `${model}-fast`,
    );
    const slow = await run(
      model,
      model === "phonon" ? 0.7 : 0.8,
      `${model}-slow`,
    );
    assert.ok(fast.seconds < normal.seconds && normal.seconds < slow.seconds);
    assert.equal(warm.seconds, normal.seconds);
    if (model === "phonon") {
      assert.ok(warm.statuses.some((status) => status.includes("cached")));
      assert.ok(
        warm.statuses.some((status) => status.includes("Phonon ready — cpu")),
      );
    } else {
      assert.ok(
        warm.statuses.some((status) =>
          status.includes("Loading Kokoro CPU model"),
        ),
      );
      assert.ok(
        !warm.statuses.some((status) => status.includes("Downloading")),
      );
    }
    assert.ok(
      !report.requests.some(
        (request) =>
          request.phase === `${model}-warm` &&
          /model\.q8\.gguf|model_quantized\.onnx/.test(request.url),
      ),
      "Warm jobs should read cached weights without a model download",
    );
    check(`${model} speed direction`, {
      fast: fast.seconds,
      normal: normal.seconds,
      slow: slow.seconds,
    });
    phase = `${model}-timed-pauses`;
    const pauses = await evaluate(`(async () => {
      pick('speed').value = '1'; pick('speed').dispatchEvent(new Event('input'));
      pick('text').value = '[0.5s]First passage.[1s]Second passage.[0.5s]';
      pick('generate').click();
      if (!pick('output').classList.contains('hidden')) throw Error('Output available before completion');
      await waitFor(() => !pick('generate').disabled);
      if (!pick('err').classList.contains('hidden')) throw Error(pick('err').textContent);
      const response = await fetch(pick('audio').src); const bytes = await response.arrayBuffer();
      const view = new DataView(bytes); const rate = view.getUint32(24,true);
      const samples = new Int16Array(bytes,44); const edge = Math.round(rate*0.5);
      if (!samples.slice(0,edge).every(value => value === 0) || !samples.slice(-edge).every(value => value === 0)) throw Error('Missing edge silence');
      const middle = samples.slice(edge,-edge); let longest = 0; let current = 0;
      for (const sample of middle) { current = sample === 0 ? current+1 : 0; longest = Math.max(longest,current); }
      if (longest < rate) throw Error('Missing internal timed silence');
      if (!middle.some(value => value !== 0)) throw Error('Missing speech');
      const downloads = {};
      for (const format of ['mp3','wav']) {
        const button = pick('download-'+format); if (button.disabled) throw Error('Download disabled');
        const nativeClick = HTMLAnchorElement.prototype.click; let blobUrl;
        HTMLAnchorElement.prototype.click = function() { blobUrl = this.href; };
        let encoded;
        try { button.click(); if (!blobUrl) throw Error('Missing download URL'); encoded = await (await fetch(blobUrl)).arrayBuffer(); }
        finally { HTMLAnchorElement.prototype.click = nativeClick; }
        const byteLength = encoded.byteLength;
        const context = new AudioContext({sampleRate:rate});
        try { const decoded = await context.decodeAudioData(encoded); downloads[format] = {bytes:byteLength,seconds:decoded.duration,decodedSampleRate:decoded.sampleRate}; }
        finally { await context.close(); }
      }
      return {sampleRate:rate,seconds:samples.length/rate,internalSilenceSeconds:longest/rate,downloads,live:live.size};
    })()`);
    assert.equal(pauses.sampleRate, 24000);
    assert.equal(pauses.live, 0);
    for (const format of ["mp3", "wav"]) {
      assert.ok(pauses.downloads[format].bytes > 0);
      assert.equal(pauses.downloads[format].decodedSampleRate, 24000);
    }
    assert.ok(Math.abs(pauses.downloads.mp3.seconds - pauses.seconds) < 0.2);
    assert.ok(Math.abs(pauses.downloads.wav.seconds - pauses.seconds) < 0.01);
    check(phase, pauses);
    phase = `${model}-mid-generation-switch`;
    const switched = await evaluate(`(async () => {
      choose(${JSON.stringify(model)}); events = []; window.switchAt = ${JSON.stringify(model)};
      pick('text').value = ${JSON.stringify((text + " ").repeat(8))}; pick('generate').click();
      await waitFor(() => events.some(e => e.type === 'switch'));
      const during = {busy:pick('generate').disabled,hidden:pick('output').classList.contains('hidden'),src:pick('audio').getAttribute('src')};
      await waitFor(() => !pick('generate').disabled);
      return {during,events,live:live.size,maximum,model:pick('model').value,hidden:pick('output').classList.contains('hidden'),src:pick('audio').getAttribute('src'),mp3:pick('download-mp3').disabled,wav:pick('download-wav').disabled,status:pick('status-msg').textContent};
    })()`);
    assert.equal(switched.model, model === "phonon" ? "kokoro" : "phonon");
    assert.equal(switched.hidden, true);
    assert.equal(switched.src, null);
    assert.equal(switched.mp3, true);
    assert.equal(switched.wav, true);
    assert.equal(switched.live, 0);
    assert.equal(switched.maximum, 1);
    const sent = switched.events.find(
      (event) => event.type === "send" && event.messageType === "generate",
    );
    const switchEvent = switched.events.find(
      (event) => event.type === "switch",
    );
    assert.ok(sent && switchEvent && sent.at < switchEvent.at);
    if (model === "phonon") {
      assert.ok(
        switched.events.some(
          (event) =>
            event.messageType === "chunk" && event.at <= switchEvent.at,
        ),
      );
      assert.ok(
        switched.events.some(
          (event) => event.type === "send" && event.messageType === "cancel",
        ),
      );
    } else {
      const reply = switched.events.find(
        (event) =>
          event.type === "receive" &&
          event.id === sent.id &&
          event.audioSamples,
      );
      assert.ok(
        reply && reply.at > switchEvent.at,
        "Kokoro must switch before the real synthesis reply",
      );
    }
    check(phase, switched);
    await run(
      model === "phonon" ? "kokoro" : "phonon",
      1,
      `${model}-switch-new-generation`,
    );
  }
  assert.deepEqual(attachmentFailures, []);
  assert.ok(
    !report.requests.some(
      (request) => request.method === "POST" && !request.url.startsWith(origin),
    ),
  );
  assert.ok(
    !report.requests.some(
      (request) =>
        request.url.includes(encodeURIComponent(text)) ||
        request.postData?.includes(text),
    ),
  );
  check(
    "cache inventory",
    await evaluate(`(async () => {
    const result = {};
    for (const name of await caches.keys()) {
      const cache = await caches.open(name); result[name] = [];
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        result[name].push({url:request.url,bytes:(await response.arrayBuffer()).byteLength});
      }
    }
    return result;
  })()`),
  );
  check(
    "asset traffic by phase",
    Object.fromEntries(
      [...new Set(report.requests.map((request) => request.phase))].map(
        (phase) => [
          phase,
          report.requests
            .filter(
              (request) =>
                request.phase === phase &&
                /huggingface\.co|hf\.co|\.wasm/.test(request.url),
            )
            .map(({ url, bytes }) => ({ url, bytes })),
        ],
      ),
    ),
  );
  check("network and environment", {
    attachmentFailures,
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    fixtureSha256: createHash("sha256").update(text).digest("hex"),
    limitations: [
      "No Safari/iPhone test",
      "Controlled module-worker unavailability, not a physical unsupported device",
      "CPU-only run; earlier actual WebGPU evidence retained",
      "Audio durations are not perceptual listening",
      "Short-fixture wall times are not target-device benchmarks",
    ],
  });
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = error.stack;
  throw error;
} finally {
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
  await client?.close();
  await chrome.kill();
}
