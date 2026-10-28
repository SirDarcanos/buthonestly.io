import assert from "node:assert/strict";
import test from "node:test";
import * as generator from "../src/lib/voice-generator.mjs";

test("Phonon drains all PCM chunks in order without applying the Kokoro splitter", async () => {
  assert.equal(typeof generator.generateSpeech, "function");
  const text = "A long sentence ".repeat(180);
  const end = deferred();
  let completed = false;
  const runtime = {
    sampleRate: 22050,
    async *stream(actual, options) {
      assert.equal(actual, text);
      assert.equal(options.voice, "NbpkqMVS3CJeq2j8");
      yield new Float32Array([0.1, 0.2]);
      await end.promise;
      yield new Float32Array([0.3]);
    },
  };
  const job = generator
    .generateSpeech(runtime, {
      model: "phonon",
      text,
      voice: "NbpkqMVS3CJeq2j8",
      speed: 0,
    })
    .then((result) => {
      completed = true;
      return result;
    });
  await Promise.resolve();
  assert.equal(completed, false);
  end.resolve();
  const result = await job;
  assert.deepEqual(result.audio, new Float32Array([0.1, 0.2, 0.3]));
  assert.equal(result.sampleRate, 22050);
});

test("a failed Phonon stream cannot return partial audio and validation rejects empty/oversized text", async () => {
  assert.equal(typeof generator.generateSpeech, "function");
  const runtime = {
    sampleRate: 24000,
    async *stream() {
      yield new Float32Array([1]);
      throw new Error("failed boundary");
    },
  };
  await assert.rejects(
    generator.generateSpeech(runtime, { model: "phonon", text: "Hello" }),
    /failed boundary/,
  );
  for (const text of ["  ", "a".repeat(50001)])
    await assert.rejects(
      generator.generateSpeech(runtime, { model: "phonon", text }),
      /text|character/i,
    );
});

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

test("a session defaults to Phonon and restores independent voice and speed settings", () => {
  assert.equal(typeof generator.createVoiceSession, "function");
  const session = generator.createVoiceSession();
  assert.equal(session.model, "phonon");
  session.configure({ voice: "NIWIOv5vTi5eRMj8", speed: 0.2 });
  session.select("kokoro");
  assert.deepEqual(session.settings, { voice: "af_heart", speed: 1 });
  session.configure({ voice: "bm_george", speed: 1.2 });
  session.select("phonon");
  assert.deepEqual(session.settings, { voice: "NIWIOv5vTi5eRMj8", speed: 0.2 });
  assert.throws(() => session.configure({ voice: "af_heart" }), /voice/i);
  session.select("kokoro");
  assert.deepEqual(session.settings, { voice: "bm_george", speed: 1.2 });
});

test("switching during load rejects stale results, suppresses progress and serializes jobs", async () => {
  assert.equal(typeof generator.createVoiceSession, "function");
  const session = generator.createVoiceSession();
  const loading = deferred();
  let disposed = 0;
  let generated = 0;
  let updates = 0;
  const run = session.run({
    load: async (_, notify) => {
      await loading.promise;
      notify("old");
      return { dispose: () => disposed++ };
    },
    synthesize: async () => {
      generated++;
    },
    onStatus: () => updates++,
  });
  session.select("kokoro");
  await assert.rejects(session.run({}), /already running/i);
  loading.resolve();
  await assert.rejects(run, { name: "AbortError" });
  assert.equal(disposed, 1);
  assert.equal(generated, 0);
  assert.equal(updates, 0);
  assert.equal(session.busy, false);
});

test("a switch during disposal or a failing old load cannot publish into the new model", async () => {
  const session = generator.createVoiceSession();
  const disposing = deferred();
  const disposalStarted = deferred();
  const job = session.run({
    load: async () => ({
      dispose: async () => {
        disposalStarted.resolve();
        await disposing.promise;
      },
    }),
    synthesize: async () => "old",
  });
  await disposalStarted.promise;
  session.select("kokoro");
  disposing.resolve();
  await assert.rejects(job, { name: "AbortError" });
  const loading = deferred();
  const failed = session.run({
    load: async () => {
      await loading.promise;
      throw new Error("old load error");
    },
  });
  session.select("phonon");
  loading.resolve();
  await assert.rejects(failed, { name: "AbortError" });
});

test("generation errors release resources and permit retry; stale generation never publishes", async () => {
  assert.equal(typeof generator.createVoiceSession, "function");
  const session = generator.createVoiceSession();
  let disposed = 0;
  const load = async () => ({ dispose: () => disposed++ });
  await assert.rejects(
    session.run({
      load,
      synthesize: async () => {
        throw new Error("retry me");
      },
    }),
    /retry me/,
  );
  const generating = deferred();
  const job = session.run({
    load,
    synthesize: async () => {
      await generating.promise;
      return "old audio";
    },
  });
  await Promise.resolve();
  session.select("kokoro");
  generating.resolve();
  await assert.rejects(job, { name: "AbortError" });
  assert.equal(
    await session.run({ load, synthesize: async () => "complete audio" }),
    "complete audio",
  );
  assert.equal(disposed, 3);
});
