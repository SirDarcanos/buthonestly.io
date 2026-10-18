import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";

async function steps(name) {
  const workflow = parse(
    await readFile(
      new URL(`../.github/workflows/${name}.yml`, import.meta.url),
      "utf8",
    ),
  );
  return Object.values(workflow.jobs).flatMap((job) => job.steps);
}

test("all workflows install pnpm before requesting its package cache", async () => {
  for (const name of [
    "ci",
    "lighthouse",
    "lighthouse-pull-request",
    "publication",
    "related",
  ]) {
    const workflow = await steps(name);
    const setup = workflow.findIndex(
      (step) => step.uses === "pnpm/action-setup@v4",
    );
    const cache = workflow.findIndex((step) => step.with?.cache === "pnpm");
    assert.ok(setup >= 0 && setup < cache, name);
    assert.ok(
      workflow.some((step) =>
        step.run?.includes("pnpm install --frozen-lockfile"),
      ),
      name,
    );
  }
});

async function sandbox(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "pnpm-workflow-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const manager of ["pnpm", "npm"]) {
    await writeFile(
      path.join(root, manager),
      '#!/bin/sh\nprintf "%s %s\\n" "$(basename "$0")" "$*" >> "$COMMAND_LOG"\nexit "${INSTALL_EXIT:-0}"\n',
      { mode: 0o755 },
    );
  }
  return root;
}

const run = (script, root, extra = {}) =>
  spawnSync("bash", ["-e", "-c", script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${root}:${process.env.PATH}`,
      COMMAND_LOG: path.join(root, "commands"),
      ...extra,
    },
  });

test("Lighthouse installs old npm bases and migrated pnpm bases with their own lockfiles", async (t) => {
  const root = await sandbox(t);
  const workflow = await steps("lighthouse-pull-request");
  const script = workflow.find(
    (step) => step.name === "Install base revision dependencies",
  ).run;
  assert.equal(run(script, root).status, 0);
  await writeFile(
    path.join(root, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n",
  );
  assert.equal(run(script, root).status, 0);
  assert.equal(
    await readFile(path.join(root, "commands"), "utf8"),
    "npm ci\npnpm install --frozen-lockfile\n",
  );
});

test("workflow-only embedding installation restores the manifest on success and failure", async (t) => {
  const root = await sandbox(t);
  const workflow = await steps("related");
  const script = workflow.find(
    (step) => step.name === "Install the workflow-only embedding runtime",
  ).run;
  const manifest = '{"name":"fixture","private":true}\n';
  await writeFile(path.join(root, "package.json"), manifest);
  await writeFile(
    path.join(root, "pnpm"),
    '#!/bin/sh\nprintf "changed" > package.json\nexit "${INSTALL_EXIT:-0}"\n',
    { mode: 0o755 },
  );
  for (const status of [0, 1]) {
    const result = run(script, root, { INSTALL_EXIT: String(status) });
    assert.equal(result.status, status, result.stderr);
    assert.equal(
      await readFile(path.join(root, "package.json"), "utf8"),
      manifest,
    );
  }
});
