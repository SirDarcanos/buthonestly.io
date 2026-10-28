import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "chrome-launcher";
import CDP from "chrome-remote-interface";
import {
  PREVIEW_TEXT,
  previewEntries,
  previewManifest,
  validateFileMapping,
} from "./lib/phonon-previews.mjs";

function inspectAudio(path) {
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", path],
      { encoding: "utf8" },
    ),
  );
  assert.equal(probe.streams.length, 1);
  const stream = probe.streams[0];
  assert.equal(stream.codec_name, "mp3");
  assert.equal(stream.channels, 1);
  assert.equal(Number(stream.sample_rate), 24000);
  assert.equal(Number(stream.bit_rate), 128000);
  const duration = Number(probe.format.duration);
  assert.ok(Number.isFinite(duration) && duration > 0);
  execFileSync(
    "ffmpeg",
    ["-v", "error", "-xerror", "-i", path, "-f", "null", "-"],
    { stdio: "pipe" },
  );
  return {
    codec: stream.codec_name,
    sampleRate: Number(stream.sample_rate),
    channels: stream.channels,
    bitrate: Number(stream.bit_rate),
    duration,
  };
}

export async function validatePreviews(directory) {
  const manifest = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  );
  const expected = previewManifest(manifest.environment, manifest.files);
  for (const key of [
    "model",
    "modelRevision",
    "catalogue",
    "catalogueRevision",
    "runtime",
    "text",
    "generation",
    "encoding",
  ])
    assert.deepEqual(manifest[key], expected[key]);
  validateFileMapping(
    manifest,
    (await readdir(directory)).filter((name) => name.endsWith(".mp3")),
  );
  for (const file of manifest.files) {
    const path = join(directory, file.filename);
    const bytes = await readFile(path);
    assert.ok(bytes.length > 0);
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
    assert.deepEqual(inspectAudio(path), file.audio);
    assert.equal(file.backend.device, "cpu");
    assert.equal(file.backend.threads, 1);
  }
  return {
    files: manifest.files.length,
    regular: 25,
    characters: 12,
    codec: "mp3",
    sampleRate: 24000,
    bitrate: 128000,
    channels: 1,
    decode: "passed",
    listening: manifest.listening,
  };
}

async function generate(directory) {
  for (const command of ["ffprobe", "ffmpeg"])
    execFileSync(command, ["-version"], { stdio: "pipe" });
  const origin = process.env.VOICE_PREVIEW_ORIGIN || "http://localhost:4321";
  const url = new URL(origin);
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Use a local development server, never the production site",
  );
  await mkdir(directory, { recursive: false });
  const chrome = await launch({
    chromeFlags: ["--headless=new", "--disable-gpu", "--no-sandbox"],
    port: 0,
  });
  let client;
  try {
    client = await CDP({ port: chrome.port });
    const { Page, Runtime, Browser } = client;
    await Promise.all([Page.enable(), Runtime.enable()]);
    await Browser.setDownloadBehavior({ behavior: "deny" });
    const evaluate = async (expression) => {
      const result = await Runtime.evaluate({
        expression,
        awaitPromise: true,
        returnByValue: true,
        timeout: 600000,
      });
      if (result.exceptionDetails)
        throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const ready = Page.loadEventFired();
    await Page.navigate({
      url: `${url.origin}/resources/free-ai-voice-generator/`,
    });
    await ready;
    await evaluate(`new Promise((resolve, reject) => {
      const started = Date.now(); const timer = setInterval(() => {
        if (document.querySelector('[data-bhktw="voice"]')?.options.length === 37) { clearInterval(timer); resolve(); }
        else if (Date.now() - started > 30000) { clearInterval(timer); reject(new Error('Generator initialization timeout')); }
      }, 100);
    })`);
    await evaluate(`{
      const NativeWorker = window.Worker;
      window.__previewBackends = [];
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', ({data}) => {
            if (data.type === 'result' && data.value?.device)
              window.__previewBackends.push({ device: data.value.device, reason: data.value.deviceReason, threads: data.value.threads });
          });
        }
      };
      window.__previewBlobs = [];
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => { window.__previewBlobs.push(blob); return create(blob); };
    }`);
    const manifest = previewManifest(
      {
        generatedAt: new Date().toISOString(),
        node: process.version,
        platform: `${process.platform}/${process.arch}`,
        chrome: await Browser.getVersion(),
        ffmpeg: execFileSync("ffmpeg", ["-version"], {
          encoding: "utf8",
        }).split("\n")[0],
        generator: "scripts/generate-phonon-previews.mjs",
      },
      [],
    );
    for (const entry of previewEntries()) {
      const result = await evaluate(`(async () => {
        const pick = name => document.querySelector('[data-bhktw="'+name+'"]');
        if (pick('model').value !== 'phonon') throw new Error('Expected Phonon');
        if (Number(pick('speed').value) !== 0) throw new Error('Expected normal speed');
        window.__previewBlobs = []; window.__previewBackends = [];
        pick('voice').value = ${JSON.stringify(entry.id)};
        if (pick('voice').value !== ${JSON.stringify(entry.id)}) throw new Error('Unknown voice');
        pick('voice').dispatchEvent(new Event('change'));
        pick('text').value = ${JSON.stringify(PREVIEW_TEXT)};
        pick('generate').click();
        await new Promise((resolve, reject) => {
          const started = Date.now(); const timer = setInterval(() => {
            if (!pick('generate').disabled) { clearInterval(timer); resolve(); }
            else if (Date.now() - started > 540000) { clearInterval(timer); reject(new Error('Synthesis timeout')); }
          }, 100);
        });
        if (!pick('err').classList.contains('hidden')) throw new Error(pick('err').textContent);
        if (pick('download-mp3').disabled) throw new Error('No completed MP3');
        pick('download-mp3').click();
        const blob = window.__previewBlobs.find(blob => blob.type === 'audio/mpeg');
        if (!blob) throw new Error('MP3 blob missing');
        const buffer = new Uint8Array(await blob.arrayBuffer());
        let binary = ''; for (const byte of buffer) binary += String.fromCharCode(byte);
        const backend = window.__previewBackends.at(-1);
        window.__previewBlobs = [];
        return { base64: btoa(binary), backend };
      })()`);
      assert.equal(result.backend?.device, "cpu");
      assert.equal(result.backend.threads, 1);
      const bytes = Buffer.from(result.base64, "base64");
      const path = join(directory, entry.filename);
      await writeFile(path, bytes, { flag: "wx" });
      const audio = inspectAudio(path);
      manifest.files.push({
        ...entry,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        backend: result.backend,
        audio,
      });
      await writeFile(
        join(directory, "manifest.partial.json"),
        JSON.stringify(manifest, null, 2) + "\n",
      );
      console.log(
        `${manifest.files.length}/37 ${entry.name}: ${audio.duration.toFixed(2)}s, ${bytes.length} bytes`,
      );
    }
    await rename(
      join(directory, "manifest.partial.json"),
      join(directory, "manifest.json"),
    );
    const validation = await validatePreviews(directory);
    await writeFile(
      join(directory, "validation.json"),
      JSON.stringify(validation, null, 2) + "\n",
    );
    console.log(JSON.stringify({ directory, validation }, null, 2));
  } finally {
    await client?.close();
    await chrome.kill();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  const validate = args[0] === "--validate";
  assert.equal(
    args.length,
    validate ? 2 : 1,
    "Usage: pnpm exec node scripts/generate-phonon-previews.mjs [--validate] <explicit-output-directory>",
  );
  const directory = resolve(args[validate ? 1 : 0]);
  if (validate)
    console.log(JSON.stringify(await validatePreviews(directory), null, 2));
  else await generate(directory);
}
