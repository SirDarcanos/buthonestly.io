import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { launch } from "chrome-launcher";
import CDP from "chrome-remote-interface";
import { LAMEJS_URL } from "../src/lib/voice-generator.mjs";

const origin = process.env.VOICE_SMOKE_ORIGIN || "http://localhost:4321";
const directory = process.env.VOICE_EXPORT_OUTPUT || "/tmp/voice-export";
await mkdir(directory, { recursive: true });
const chrome = await launch({
  chromeFlags: ["--headless=new", "--disable-gpu", "--no-sandbox"],
  port: 0,
});
const report = { status: "running", checks: [] };
let client;
try {
  client = await CDP({ port: chrome.port });
  const { Page, Runtime, Network } = client;
  await Promise.all([Page.enable(), Runtime.enable(), Network.enable()]);
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
  const generate = async () =>
    evaluate(`(async () => {
      pick('text').value = 'Some mornings the coffee tastes better than usual.';
      pick('generate').click();
      if (!pick('output').classList.contains('hidden')) throw Error('Early output');
      await waitFor(() => !pick('generate').disabled);
      return {model:pick('model').value,hidden:pick('output').classList.contains('hidden'),src:pick('audio').getAttribute('src'),wavDisabled:pick('download-wav').disabled,mp3Disabled:pick('download-mp3').disabled,error:pick('err').classList.contains('hidden') ? null : pick('err').textContent,status:pick('status-msg').textContent,live:live.size,maximum,frames};
    })()`);
  const decodeDownload = async (format) =>
    evaluate(`(async () => {
      let url; const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function() { url = this.href; };
      try { pick('download-${format}').click(); }
      finally { HTMLAnchorElement.prototype.click = click; }
      if (!url) throw Error('No download URL');
      const bytes = await (await fetch(url)).arrayBuffer();
      const byteLength = bytes.byteLength;
      const rate = ${format === "wav" ? "new DataView(bytes).getUint32(24,true)" : "null"};
      const context = new AudioContext({sampleRate:24000});
      try { const decoded = await context.decodeAudioData(bytes); return {bytes:byteLength,seconds:decoded.duration,wavSampleRate:rate}; }
      finally { await context.close(); }
    })()`);
  for (const model of ["phonon", "kokoro"]) {
    for (const failure of ["blocked", "throws", "switches-and-throws"]) {
      const name = `${model}-${failure}`;
      try {
        await Network.setBlockedURLs({
          urls: failure === "blocked" ? [LAMEJS_URL] : [],
        });
        const loaded = Page.loadEventFired();
        await Page.navigate({
          url: `${origin}/resources/free-ai-voice-generator/`,
        });
        await loaded;
        await evaluate(`(async () => {
          window.pick = name => document.querySelector('[data-bhktw="'+name+'"]');
          window.waitFor = test => new Promise((resolve,reject) => {
            const start = Date.now(); const timer = setInterval(() => {
              if (test()) { clearInterval(timer); resolve(); }
              else if (Date.now()-start > 180000) { clearInterval(timer); reject(Error('Timed out: '+pick('status-msg')?.textContent)); }
            },50);
          });
          await waitFor(() => pick('voice')?.options.length === 37);
          pick('model').value = '${model}'; pick('model').dispatchEvent(new Event('change'));
          window.live = new Set(); window.maximum = 0; window.frames = 0;
          const NativeWorker = window.Worker;
          window.Worker = class extends NativeWorker {
            constructor(...args) {
              super(...args); live.add(this); maximum = Math.max(maximum,live.size);
              const terminate = this.terminate.bind(this);
              this.terminate = () => { live.delete(this); terminate(); };
              this.addEventListener('message',({data}) => { if (data.type === 'chunk' || data.result?.audio) frames++; });
            }
          };
          if ('${failure}' !== 'blocked') window.lamejs = {Mp3Encoder:class {
            constructor() {
              if ('${failure}' === 'switches-and-throws') {
                pick('model').value = '${model === "phonon" ? "kokoro" : "phonon"}';
                pick('model').dispatchEvent(new Event('change'));
              }
              throw Error('Controlled MP3 encoder failure');
            }
          }};
        })()`);
        const fallback = await generate();
        assert.ok(fallback.frames > 0, "Real synthesis must precede export");
        assert.equal(fallback.live, 0);
        assert.equal(fallback.maximum, 1);
        if (failure === "switches-and-throws") {
          assert.equal(
            fallback.model,
            model === "phonon" ? "kokoro" : "phonon",
          );
          assert.equal(fallback.hidden, true);
          assert.equal(fallback.src, null);
          assert.equal(fallback.wavDisabled, true);
          assert.equal(fallback.mp3Disabled, true);
          assert.equal(fallback.error, null);
          assert.match(fallback.status, /Model changed/);
          report.checks.push({ name, status: "passed", fallback });
          continue;
        }
        assert.equal(fallback.model, model);
        assert.equal(
          fallback.hidden,
          false,
          "Completed WAV must remain available",
        );
        assert.equal(fallback.wavDisabled, false);
        assert.equal(fallback.mp3Disabled, true);
        assert.ok(fallback.src?.startsWith("blob:"));
        assert.match(fallback.error, /MP3 export failed/);
        assert.doesNotMatch(fallback.error, /needs WebAssembly|module workers/);
        assert.match(fallback.status, /WAV.*ready/);
        const wav = await decodeDownload("wav");
        assert.ok(wav.bytes > 44 && wav.seconds > 1);
        assert.equal(wav.wavSampleRate, 24000);
        await Network.setBlockedURLs({ urls: [] });
        await evaluate("window.lamejs = undefined");
        const retry = await generate();
        assert.equal(retry.hidden, false);
        assert.equal(retry.wavDisabled, false);
        assert.equal(retry.mp3Disabled, false);
        assert.equal(retry.error, null);
        assert.equal(retry.live, 0);
        const mp3 = await decodeDownload("mp3");
        assert.ok(mp3.bytes > 0 && mp3.seconds > 1);
        report.checks.push({
          name,
          status: "passed",
          fallback,
          wav,
          retry,
          mp3,
        });
      } catch (error) {
        report.checks.push({ name, status: "failed", error: error.stack });
      }
      console.log(JSON.stringify(report.checks.at(-1)));
    }
  }
  report.status = report.checks.every((check) => check.status === "passed")
    ? "passed"
    : "failed";
} catch (error) {
  report.status = "failed";
  report.error = error.stack;
} finally {
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
  await client?.close();
  await chrome.kill();
}
if (report.status !== "passed") process.exitCode = 1;
