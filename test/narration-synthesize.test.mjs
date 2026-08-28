import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  runNarrationCommand,
  validateNarrationProvenance,
} from "../src/lib/narration-tool.mjs";
import {
  createFfmpegAdapter,
  createVertexTtsAdapter,
} from "../src/lib/narration-adapters.mjs";

const createRepository = async (context, slug = "fixture") => {
  const root = await mkdtemp(path.join(tmpdir(), "narration-synthesize-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "src/content/essays", slug);
  await mkdir(directory, { recursive: true });
  const sourcePath = path.join(directory, `${slug}.mdx`);
  await writeFile(
    sourcePath,
    `---\ntitle: A Reviewed Essay\n---\n\nFirst paragraph.\n\nSecond paragraph.`,
  );
  await runNarrationCommand({
    command: "prepare",
    target: slug,
    repositoryRoot: root,
    log: () => {},
  });
  return {
    root,
    sourcePath,
    transcriptPath: path.join(directory, `${slug}.audio.txt`),
  };
};

const createSynthesisAdapters = (calls, { ffmpegAvailable = true } = {}) => ({
  provider: {
    async preflight(settings) {
      calls.push(["provider.preflight", settings.model]);
    },
    async synthesize(text, settings) {
      calls.push(["provider.synthesize", text, settings.style, settings.pace]);
      return Buffer.from([calls.length, 0]);
    },
  },
  audio: {
    async preflight() {
      calls.push(["audio.preflight"]);
      if (!ffmpegAvailable) {
        throw new Error(
          "ffmpeg was not found. Install it with brew install ffmpeg on macOS or your Linux package manager.",
        );
      }
    },
    async encode({ pcm, outputPath, sampleRate, channels, bitrate }) {
      calls.push(["audio.encode", pcm.length, sampleRate, channels, bitrate]);
      await writeFile(outputPath, Buffer.from("mp3-output"));
    },
  },
});

test("synth and synthesize persist reviewed settings, confirm the paid operation, and write verified provenance", async (context) => {
  const { root, transcriptPath } = await createRepository(context);
  const calls = [];
  const messages = [];
  const confirmations = [];
  const adapters = createSynthesisAdapters(calls);

  const result = await runNarrationCommand({
    command: "synth",
    target: "fixture",
    repositoryRoot: root,
    settings: {
      voice: "Charon",
      style: "technical",
      pace: "measured",
      joinSilenceMs: 250,
    },
    provider: adapters.provider,
    audio: adapters.audio,
    confirm: async (message) => {
      confirmations.push(message);
      return true;
    },
    log: (message) => messages.push(message),
  });

  const transcript = await readFile(transcriptPath, "utf8");
  assert.match(transcript, /^# voice: Charon$/m);
  assert.match(transcript, /^# style: technical$/m);
  assert.match(transcript, /^# pace: measured$/m);
  assert.match(transcript, /^# model: gemini-2\.5-flash-tts$/m);
  assert.match(transcript, /^# join-silence-ms: 250$/m);
  assert.equal(confirmations.length, 1);
  assert.match(confirmations[0], /paid synthesis/i);
  assert.match(
    messages.join("\n"),
    /1 chunk.*Charon.*gemini-2\.5-flash-tts.*technical.*measured/is,
  );
  assert.deepEqual(
    calls.map(([name]) => name),
    [
      "provider.preflight",
      "audio.preflight",
      "provider.synthesize",
      "audio.encode",
    ],
  );
  assert.deepEqual(calls.at(-1), ["audio.encode", 2, 24000, 1, "96k"]);
  assert.equal(result.command, "synthesize");
  assert.equal(result.chunks, 1);
  assert.equal(await readFile(result.outputPath, "utf8"), "mp3-output");
  assert.equal(
    (
      await validateNarrationProvenance({
        target: "fixture",
        repositoryRoot: root,
      })
    ).outputPath,
    result.outputPath,
  );

  await writeFile(transcriptPath, `${transcript}\nA later editorial change.\n`);
  await assert.rejects(
    validateNarrationProvenance({ target: "fixture", repositoryRoot: root }),
    /does not match the reviewed narration script/i,
  );

  const aliasCalls = [];
  const aliasAdapters = createSynthesisAdapters(aliasCalls);
  await runNarrationCommand({
    command: "synthesize",
    target: "fixture",
    repositoryRoot: root,
    yes: true,
    provider: aliasAdapters.provider,
    audio: aliasAdapters.audio,
    log: () => {},
  });
  assert.equal(
    aliasCalls.some(([name]) => name === "provider.synthesize"),
    true,
  );
});

test("synthesis rejects invalid settings, malformed transcripts, declined confirmation, and missing ffmpeg before paid calls", async (context) => {
  const { root } = await createRepository(context);

  for (const settings of [
    { style: "reflectiv" },
    { pace: "conversationally" },
  ]) {
    const calls = [];
    const adapters = createSynthesisAdapters(calls);
    await assert.rejects(
      runNarrationCommand({
        command: "synthesize",
        target: "fixture",
        repositoryRoot: root,
        settings,
        yes: true,
        provider: adapters.provider,
        audio: adapters.audio,
        log: () => {},
      }),
      /Unknown (style|pace)/,
    );
    assert.equal(calls.length, 0);
  }

  const malformedTranscript = path.join(
    root,
    "src/content/essays/fixture/fixture.audio.txt",
  );
  const validTranscript = await readFile(malformedTranscript, "utf8");
  await writeFile(
    malformedTranscript,
    validTranscript.replace(
      "--- chunk 1 ---",
      "Silently omitted prose.\n\n--- chunk 1 ---",
    ),
  );
  const malformedCalls = [];
  const malformedAdapters = createSynthesisAdapters(malformedCalls);
  await assert.rejects(
    runNarrationCommand({
      command: "synthesize",
      target: "fixture",
      repositoryRoot: root,
      yes: true,
      provider: malformedAdapters.provider,
      audio: malformedAdapters.audio,
      log: () => {},
    }),
    /outside numbered chunks/i,
  );
  assert.equal(malformedCalls.length, 0);
  await writeFile(malformedTranscript, validTranscript);

  const missingCalls = [];
  const missingAdapters = createSynthesisAdapters(missingCalls, {
    ffmpegAvailable: false,
  });
  await assert.rejects(
    runNarrationCommand({
      command: "synth",
      target: "fixture",
      repositoryRoot: root,
      yes: true,
      provider: missingAdapters.provider,
      audio: missingAdapters.audio,
      log: () => {},
    }),
    /brew install ffmpeg.*Linux package manager/i,
  );
  assert.equal(
    missingCalls.some(([name]) => name === "provider.synthesize"),
    false,
  );

  const declinedCalls = [];
  const declinedAdapters = createSynthesisAdapters(declinedCalls);
  await assert.rejects(
    runNarrationCommand({
      command: "synthesize",
      target: "fixture",
      repositoryRoot: root,
      provider: declinedAdapters.provider,
      audio: declinedAdapters.audio,
      confirm: async () => false,
      log: () => {},
    }),
    /cancelled/i,
  );
  assert.equal(
    declinedCalls.some(([name]) => name === "provider.synthesize"),
    false,
  );
});

test("built and work-in-progress Essays with the same slug keep distinct provenance", async (context) => {
  const { root, sourcePath } = await createRepository(context, "shared");
  const draftDirectory = path.join(root, "src/content/drafts/shared");
  await mkdir(draftDirectory, { recursive: true });
  const draftPath = path.join(draftDirectory, "shared.mdx");
  await writeFile(draftPath, "---\ntitle: Draft version\n---\n\nDraft prose.");
  await runNarrationCommand({
    command: "prepare",
    target: draftPath,
    repositoryRoot: root,
    log: () => {},
  });

  const results = [];
  for (const target of [sourcePath, draftPath]) {
    const adapters = createSynthesisAdapters([]);
    results.push(
      await runNarrationCommand({
        command: "synthesize",
        target,
        repositoryRoot: root,
        yes: true,
        provider: adapters.provider,
        audio: adapters.audio,
        log: () => {},
      }),
    );
  }

  assert.notEqual(results[0].manifestPath, results[1].manifestPath);
  await Promise.all(
    [sourcePath, draftPath].map((target) =>
      validateNarrationProvenance({ target, repositoryRoot: root }),
    ),
  );
});

test("the Vertex adapter authenticates with the supported client and requests PCM sequentially", async () => {
  const requests = [];
  const authCalls = [];
  const adapter = createVertexTtsAdapter({
    auth: {
      async getProjectId() {
        authCalls.push("project");
        return "vertex-project";
      },
      async getRequestHeaders(url) {
        authCalls.push(url);
        return new Headers({ Authorization: "Bearer adc-token" });
      },
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "audio/L16;codec=pcm;rate=24000",
                    data: Buffer.from([1, 2, 3, 4]).toString("base64"),
                  },
                },
              ],
            },
          },
        ],
      });
    },
  });
  const settings = {
    voice: "Enceladus",
    style: "reflective",
    pace: "conversational",
    model: "gemini-2.5-flash-tts",
    region: "us-central1",
  };

  await adapter.preflight(settings);
  const pcm = await adapter.synthesize("Exact reviewed prose.", settings);

  assert.deepEqual(pcm, Buffer.from([1, 2, 3, 4]));
  assert.equal(authCalls[0], "project");
  assert.match(
    requests[0].url,
    /^https:\/\/us-central1-aiplatform\.googleapis\.com\/v1\/projects\/vertex-project\/locations\/us-central1\/publishers\/google\/models\/gemini-2\.5-flash-tts:generateContent$/,
  );
  assert.equal(
    new Headers(requests[0].options.headers).get("authorization"),
    "Bearer adc-token",
  );
  const payload = JSON.parse(requests[0].options.body);
  assert.deepEqual(payload.generationConfig.responseModalities, ["AUDIO"]);
  assert.equal(
    payload.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig
      .voiceName,
    "Enceladus",
  );
  assert.match(payload.contents[0].parts[0].text, /AUDIO PROFILE: Nico/);
  assert.match(payload.contents[0].parts[0].text, /Exact reviewed prose\.$/);

  const malformed = createVertexTtsAdapter({
    auth: {
      getProjectId: async () => "vertex-project",
      getRequestHeaders: async () => new Headers(),
    },
    fetch: async () =>
      Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "audio/mpeg",
                    data: Buffer.from([1, 2, 3]).toString("base64"),
                  },
                },
              ],
            },
          },
        ],
      }),
  });
  await malformed.preflight(settings);
  await assert.rejects(
    malformed.synthesize("Prose.", settings),
    /24 kHz mono 16-bit PCM/i,
  );
});

test("the ffmpeg adapter checks the MP3 encoder and encodes 24 kHz mono PCM at 96 kbps", async () => {
  const invocations = [];
  const spawnProcess = (command, args) => {
    invocations.push([command, args]);
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.end = () =>
      queueMicrotask(() => {
        if (args.includes("-encoders")) {
          child.stdout.emit(
            "data",
            " A....D libmp3lame MP3 (MPEG audio layer 3)",
          );
        }
        child.emit("close", 0);
      });
    return child;
  };
  const adapter = createFfmpegAdapter({ spawnProcess });

  await adapter.preflight();
  await adapter.encode({
    pcm: Buffer.from([0, 0]),
    outputPath: "/tmp/reviewed.mp3",
    sampleRate: 24000,
    channels: 1,
    bitrate: "96k",
  });

  assert.deepEqual(invocations[0], ["ffmpeg", ["-hide_banner", "-encoders"]]);
  assert.deepEqual(invocations[1], [
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "s16le",
      "-ar",
      "24000",
      "-ac",
      "1",
      "-i",
      "pipe:0",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "96k",
      "/tmp/reviewed.mp3",
    ],
  ]);
});
