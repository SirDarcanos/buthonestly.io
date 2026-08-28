import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createGoogleAuthenticationAdapter } from "../src/lib/google-authentication.mjs";
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

test("synthesis checkpoints chunks, resumes failures, and selectively invalidates edited prose", async (context) => {
  const { root, transcriptPath } = await createRepository(context);
  const transcript = await readFile(transcriptPath, "utf8");
  await writeFile(
    transcriptPath,
    transcript.replace(
      "\nSecond paragraph.",
      "\n\n--- chunk 2 ---\nSecond paragraph.",
    ),
  );

  const firstRequests = [];
  await assert.rejects(
    runNarrationCommand({
      command: "synthesize",
      target: "fixture",
      repositoryRoot: root,
      yes: true,
      provider: {
        preflight: async () => {},
        synthesize: async (text) => {
          firstRequests.push(text);
          if (firstRequests.length === 2) throw new Error("connection reset");
          return Buffer.from([1, 0]);
        },
      },
      audio: { preflight: async () => {}, encode: async () => {} },
      log: () => {},
    }),
    /chunk 2.*connection reset/i,
  );

  const workDirectory = path.join(
    root,
    "local/narration",
    (await readdir(path.join(root, "local/narration")))[0],
  );
  assert.equal(
    (await readdir(path.join(workDirectory, "chunks"))).filter((name) =>
      name.endsWith(".pcm"),
    ).length,
    1,
  );

  const resumedRequests = [];
  const adapters = createSynthesisAdapters([]);
  adapters.provider.synthesize = async (text) => {
    resumedRequests.push(text);
    return Buffer.from([2, 0]);
  };
  await runNarrationCommand({
    command: "synthesize",
    target: "fixture",
    repositoryRoot: root,
    yes: true,
    provider: adapters.provider,
    audio: adapters.audio,
    log: () => {},
  });
  assert.equal(resumedRequests.length, 1);
  assert.match(resumedRequests[0], /^Second paragraph\./);

  const reviewed = await readFile(transcriptPath, "utf8");
  await writeFile(
    transcriptPath,
    reviewed.replace("Second paragraph.", "A revised second paragraph."),
  );
  const editedRequests = [];
  adapters.provider.synthesize = async (text) => {
    editedRequests.push(text);
    return Buffer.from([3, 0]);
  };
  await runNarrationCommand({
    command: "synthesize",
    target: "fixture",
    repositoryRoot: root,
    yes: true,
    provider: adapters.provider,
    audio: adapters.audio,
    log: () => {},
  });
  assert.equal(editedRequests.length, 1);
  assert.match(editedRequests[0], /^A revised second paragraph\./);

  const changedSettingRequests = [];
  adapters.provider.synthesize = async (text) => {
    changedSettingRequests.push(text);
    return Buffer.from([4, 0]);
  };
  await runNarrationCommand({
    command: "synthesize",
    target: "fixture",
    repositoryRoot: root,
    settings: { region: "global" },
    yes: true,
    provider: adapters.provider,
    audio: adapters.audio,
    log: () => {},
  });
  assert.equal(changedSettingRequests.length, 2);
});

test("synthesis warns on narratable source drift and reports advisory pace outliers", async (context) => {
  const { root, sourcePath, transcriptPath } = await createRepository(context);
  const transcript = await readFile(transcriptPath, "utf8");
  const firstWords = Array.from({ length: 12 }, (_, index) => `first${index}`);
  const secondWords = Array.from(
    { length: 24 },
    (_, index) => `second${index}`,
  );
  await writeFile(
    transcriptPath,
    `${transcript.slice(0, transcript.indexOf("--- chunk 1 ---"))}--- chunk 1 ---\n${firstWords.join(" ")}\n\n--- chunk 2 ---\n${secondWords.join(" ")}\n`,
  );
  await writeFile(
    sourcePath,
    "---\ntitle: A Reviewed Essay\n---\n\nChanged narratable prose.",
  );

  const messages = [];
  const adapter = createSynthesisAdapters([]);
  adapter.provider.synthesize = async () => Buffer.alloc(24000 * 2 * 6);
  const result = await runNarrationCommand({
    command: "synthesize",
    target: "fixture",
    repositoryRoot: root,
    yes: true,
    provider: adapter.provider,
    audio: adapter.audio,
    log: (message) => messages.push(message),
  });

  assert.match(
    messages.join("\n"),
    /warning.*Essay source.*reviewed narration script/i,
  );
  assert.equal(result.diagnostics.totalDurationSeconds, 12.2);
  assert.equal(result.diagnostics.medianWordsPerMinute, 180);
  assert.deepEqual(
    result.diagnostics.outliers.map(({ chunk, timestamp, wordsPerMinute }) => ({
      chunk,
      timestamp,
      wordsPerMinute,
    })),
    [
      { chunk: 1, timestamp: "00:00.000", wordsPerMinute: 120 },
      { chunk: 2, timestamp: "00:06.200", wordsPerMinute: 240 },
    ],
  );
  assert.match(messages.join("\n"), /pace outlier.*chunk 1.*00:00\.000/i);
  assert.equal(
    JSON.parse(await readFile(result.reportPath, "utf8")).structuralStatus,
    "passed",
  );
});

test("structurally invalid PCM blocks assembly and identifies the failed stage", async (context) => {
  const { root } = await createRepository(context);
  let encoded = false;

  await assert.rejects(
    runNarrationCommand({
      command: "synthesize",
      target: "fixture",
      repositoryRoot: root,
      yes: true,
      provider: {
        preflight: async () => {},
        synthesize: async () => Buffer.from([1]),
      },
      audio: {
        preflight: async () => {},
        encode: async () => {
          encoded = true;
        },
      },
      log: () => {},
    }),
    /chunk 1.*16-bit PCM/i,
  );
  assert.equal(encoded, false);
});

test("failed MP3 encoding preserves the previously verified narration", async (context) => {
  const { root } = await createRepository(context);
  const firstAdapters = createSynthesisAdapters([]);
  const first = await runNarrationCommand({
    command: "synthesize",
    target: "fixture",
    repositoryRoot: root,
    yes: true,
    provider: firstAdapters.provider,
    audio: firstAdapters.audio,
    log: () => {},
  });
  const verifiedMp3 = await readFile(first.outputPath);
  const verifiedManifest = await readFile(first.manifestPath);

  await assert.rejects(
    runNarrationCommand({
      command: "synthesize",
      target: "fixture",
      repositoryRoot: root,
      yes: true,
      provider: firstAdapters.provider,
      audio: {
        preflight: async () => {},
        encode: async ({ outputPath }) => {
          await writeFile(outputPath, "damaged partial output");
          throw new Error("encoder crashed");
        },
      },
      log: () => {},
    }),
    /MP3 encoding.*encoder crashed/i,
  );

  assert.deepEqual(await readFile(first.outputPath), verifiedMp3);
  assert.deepEqual(await readFile(first.manifestPath), verifiedManifest);
  await validateNarrationProvenance({
    target: "fixture",
    repositoryRoot: root,
  });
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

test("the Google authentication adapter forces token refresh for ADC clients without refreshAccessToken", async () => {
  const credentials = {
    access_token: "stale-token",
    refresh_token: "refresh-token",
    expiry_date: Date.now() + 60_000,
  };
  const setCredentialsCalls = [];
  const client = {
    credentials,
    setCredentials(updated) {
      setCredentialsCalls.push(updated);
      this.credentials = updated;
    },
    async getRequestHeaders() {
      return new Headers({
        Authorization:
          this.credentials.expiry_date === 0
            ? "Bearer fresh-token"
            : "Bearer stale-token",
      });
    },
  };
  const adapter = createGoogleAuthenticationAdapter({
    createGoogleAuth: () => ({
      getClient: async () => client,
      getProjectId: async () => "project",
    }),
  });

  assert.equal(
    (
      await adapter.getRequestHeaders("https://vertex", { forceRefresh: false })
    ).get("authorization"),
    "Bearer stale-token",
  );
  assert.equal(
    (
      await adapter.getRequestHeaders("https://vertex", { forceRefresh: true })
    ).get("authorization"),
    "Bearer fresh-token",
  );
  assert.deepEqual(setCredentialsCalls, [{ ...credentials, expiry_date: 0 }]);
});

test("the Vertex adapter retries transient failures, refreshes authorization once, and rejects permanent failures", async () => {
  const settings = {
    voice: "Enceladus",
    style: "reflective",
    pace: "conversational",
    model: "gemini-2.5-flash-tts",
    region: "us-central1",
  };
  const pcmResponse = () =>
    Response.json({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "audio/L16;codec=pcm;rate=24000",
                  data: Buffer.from([1, 0]).toString("base64"),
                },
              },
            ],
          },
        },
      ],
    });

  const transientStatuses = [new TypeError("network down"), 429, 503];
  for (const transient of transientStatuses) {
    const sleeps = [];
    let attempts = 0;
    const adapter = createVertexTtsAdapter({
      auth: {
        getProjectId: async () => "project",
        getRequestHeaders: async () => ({}),
      },
      fetch: async () => {
        attempts += 1;
        if (attempts < 3) {
          if (transient instanceof Error) throw transient;
          return Response.json(
            { error: { message: "transient" } },
            { status: transient },
          );
        }
        return pcmResponse();
      },
      sleep: async (milliseconds) => sleeps.push(milliseconds),
    });
    await adapter.preflight(settings);
    assert.deepEqual(
      await adapter.synthesize("Text.", settings),
      Buffer.from([1, 0]),
    );
    assert.equal(attempts, 3);
    assert.deepEqual(sleeps, [1500, 3000]);
  }

  const refreshes = [];
  let authAttempts = 0;
  const authAdapter = createVertexTtsAdapter({
    auth: {
      getProjectId: async () => "project",
      getRequestHeaders: async (_url, options) => {
        refreshes.push(options.forceRefresh);
        return {};
      },
    },
    fetch: async () => {
      authAttempts += 1;
      return authAttempts === 1
        ? Response.json({ error: { message: "expired" } }, { status: 401 })
        : pcmResponse();
    },
    sleep: async () => {},
  });
  await authAdapter.preflight(settings);
  await authAdapter.synthesize("Text.", settings);
  assert.deepEqual(refreshes, [false, false, true]);

  for (const status of [400, 404]) {
    let attempts = 0;
    const adapter = createVertexTtsAdapter({
      auth: {
        getProjectId: async () => "project",
        getRequestHeaders: async () => ({}),
      },
      fetch: async () => {
        attempts += 1;
        return Response.json({ error: { message: "permanent" } }, { status });
      },
      sleep: async () => {},
    });
    await adapter.preflight(settings);
    await assert.rejects(adapter.synthesize("Text.", settings), /permanent/);
    assert.equal(attempts, 1);
  }

  let refreshAttempts = 0;
  const failedRefreshAdapter = createVertexTtsAdapter({
    auth: {
      getProjectId: async () => "project",
      getRequestHeaders: async (_url, { forceRefresh }) => {
        if (forceRefresh) {
          refreshAttempts += 1;
          throw new Error("refresh failed");
        }
        return {};
      },
    },
    fetch: async () =>
      Response.json({ error: { message: "expired" } }, { status: 401 }),
    sleep: async () => {},
  });
  await failedRefreshAdapter.preflight(settings);
  await assert.rejects(
    failedRefreshAdapter.synthesize("Text.", settings),
    /refresh failed/,
  );
  assert.equal(refreshAttempts, 1);

  let deniedAttempts = 0;
  const deniedAdapter = createVertexTtsAdapter({
    auth: {
      getProjectId: async () => "project",
      getRequestHeaders: async () => ({}),
    },
    fetch: async () => {
      deniedAttempts += 1;
      return Response.json({ error: { message: "denied" } }, { status: 403 });
    },
    sleep: async () => {},
  });
  await deniedAdapter.preflight(settings);
  await assert.rejects(deniedAdapter.synthesize("Text.", settings), /denied/);
  assert.equal(deniedAttempts, 2);
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
