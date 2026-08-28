import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runNarrationCommand } from "../src/lib/narration-tool.mjs";

const exists = async (filePath) =>
  stat(filePath)
    .then(() => true)
    .catch(() => false);

test("Narration command help documents the complete staged workflow", () => {
  const repositoryRoot = path.resolve(import.meta.dirname, "..");
  const help = execFileSync(
    process.execPath,
    ["scripts/narration.mjs", "--help"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );

  assert.match(help, /prepare, prep/);
  assert.match(help, /synthesize, synth/);
  assert.match(help, /upload/);
  assert.match(help, /clean/);
  assert.match(
    help,
    /prepare -> review script -> synthesize -> listen -> upload/,
  );
  assert.match(help, /--refresh/);
  assert.match(help, /--yes/);
  assert.match(help, /default: Enceladus/);
  assert.match(help, /Prompts require typing "yes"/);
  assert.match(help, /never delete remote audio/);
});

test("the Narration tool completes and safely cleans its staged lifecycle", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "narration-lifecycle-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const essayDirectory = path.join(root, "src/content/essays/lifecycle");
  await mkdir(essayDirectory, { recursive: true });
  const sourcePath = path.join(essayDirectory, "lifecycle.mdx");
  await writeFile(
    sourcePath,
    "---\ntitle: Lifecycle Essay\n---\n\nFirst passage.\n\nSecond passage.",
  );

  const prepared = await runNarrationCommand({
    command: "prepare",
    target: "lifecycle",
    repositoryRoot: root,
    log: () => {},
  });
  const preparedScript = await readFile(prepared.transcriptPath, "utf8");
  await writeFile(
    prepared.transcriptPath,
    preparedScript.replace(
      "\nSecond passage.",
      "\n\n--- chunk 2 ---\nSecond passage reviewed for narration.",
    ),
  );
  const reviewedScript = await readFile(prepared.transcriptPath, "utf8");

  let synthesisCalls = 0;
  const provider = {
    preflight: async () => {},
    synthesize: async () => {
      synthesisCalls += 1;
      if (synthesisCalls === 2) throw new Error("temporary provider failure");
      return Buffer.from([synthesisCalls, 0]);
    },
  };
  const audio = {
    preflight: async () => {},
    encode: async ({ outputPath }) => writeFile(outputPath, "reviewed MP3"),
  };

  await assert.rejects(
    runNarrationCommand({
      command: "synthesize",
      target: "lifecycle",
      repositoryRoot: root,
      yes: true,
      provider,
      audio,
      log: () => {},
    }),
    /chunk 2.*temporary provider failure/i,
  );
  const synthesized = await runNarrationCommand({
    command: "synthesize",
    target: "lifecycle",
    repositoryRoot: root,
    yes: true,
    provider,
    audio,
    log: () => {},
  });
  assert.equal(synthesisCalls, 3);
  assert.equal(await exists(synthesized.outputPath), true);
  assert.equal(await exists(synthesized.manifestPath), true);

  const remoteCalls = [];
  const uploaded = await runNarrationCommand({
    command: "upload",
    target: "lifecycle",
    repositoryRoot: root,
    remote: {
      preflight: async () => remoteCalls.push("preflight"),
      upload: async () => remoteCalls.push("upload"),
      purge: async () => remoteCalls.push("purge"),
      verify: async () => remoteCalls.push("verify"),
    },
    log: () => {},
  });
  assert.deepEqual(remoteCalls, ["preflight", "upload", "purge", "verify"]);
  assert.match(await readFile(sourcePath, "utf8"), /^audio: lifecycle\.mp3$/m);
  assert.equal(uploaded.outputPath, synthesized.outputPath);

  const cleaned = await runNarrationCommand({
    command: "clean",
    target: "lifecycle",
    repositoryRoot: root,
    remote: {
      preflight: async () => remoteCalls.push("unexpected remote cleanup"),
    },
    log: () => {},
  });

  assert.equal(cleaned.command, "clean");
  assert.equal(await exists(synthesized.outputPath), false);
  assert.equal(await exists(synthesized.workDirectory), false);
  assert.equal(await readFile(prepared.transcriptPath, "utf8"), reviewedScript);
  assert.match(await readFile(sourcePath, "utf8"), /^audio: lifecycle\.mp3$/m);
  assert.deepEqual(remoteCalls, ["preflight", "upload", "purge", "verify"]);
});
