import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

const run = (command, args) =>
  spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });

test("format verification rejects an unformatted fixture", (testContext) => {
  const temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), "format-fixture-"),
  );
  testContext.after(() => rmSync(temporaryDirectory, { recursive: true }));
  const ignorePath = path.join(temporaryDirectory, ".prettierignore");
  writeFileSync(ignorePath, "");

  const result = run("npx", [
    "prettier",
    "--check",
    "--ignore-path",
    ignorePath,
    "--parser",
    "babel",
    "test/fixtures/formatting/unformatted.fixture",
  ]);

  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /unformatted\.fixture/);
});

test("content verification rejects a missing local asset", () => {
  const result = run("node", [
    "scripts/check-links.mjs",
    "--essays-dir",
    "test/fixtures/content/essays",
  ]);

  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /missing-cover\.jpg/);
});

test("production build rejects an invalid Astro fixture", (testContext) => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "build-fixture-"));
  testContext.after(() => rmSync(temporaryDirectory, { recursive: true }));
  cpSync("test/fixtures/build", temporaryDirectory, {
    recursive: true,
  });

  const result = run("npx", ["astro", "build", "--root", temporaryDirectory]);

  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /does-not-exist/);
});
