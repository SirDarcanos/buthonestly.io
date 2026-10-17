import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const readWorkflow = (name) =>
  readFileSync(
    new URL(`../.github/workflows/${name}.yml`, import.meta.url),
    "utf8",
  );
const ci = readWorkflow("ci");
const pr = readWorkflow("lighthouse-pull-request");

const cacheStep = (workflow, action) =>
  workflow.split("\n      - ").find((step) => step.includes(action));

const restorePrefix = (step) => step.match(/restore-keys: \|\n\s+(.+)/)?.[1];

test("CI and Lighthouse restore only compatible trusted main image assets", () => {
  const producerRestore = cacheStep(ci, "actions/cache/restore@v5");
  const consumerRestores = pr
    .split("\n      - ")
    .filter((step) => step.includes("actions/cache/restore@v5"));
  assert.equal(consumerRestores.length, 2);
  for (const step of [producerRestore, ...consumerRestores]) {
    assert.ok(step);
    assert.match(step, /path: node_modules\/\.astro\/assets\n/);
    assert.match(
      restorePrefix(step),
      /^\$\{\{ runner.os \}\}-\$\{\{ runner.arch \}\}-astro-assets-v3-main-\$\{\{ steps\.(image_toolchain|head_image_toolchain|base_image_toolchain)\.outputs.key \}\}-$/,
    );
    assert.equal(
      step.split("restore-keys: |\n")[1].trim().split("\n").length,
      1,
    );
  }
  assert.match(producerRestore, /key:.*\$\{\{ github.sha \}\}/);
  assert.match(producerRestore, /if: steps.image_toolchain.outputs.key != ''/);
  for (const revision of ["head", "base"]) {
    const restore = cacheStep(
      pr,
      `name: Restore ${revision} Astro image assets`,
    );
    assert.match(
      restore,
      /key:.*\$\{\{ github.event.pull_request.base.sha \}\}/,
    );
    assert.match(
      restore,
      new RegExp(
        `if: steps.pull_request_plan.outputs.selected == 'true' && steps.${revision}_image_toolchain.outputs.key != ''`,
      ),
    );
    assert.equal(
      restorePrefix(producerRestore).replace(
        "image_toolchain",
        `${revision}_image_toolchain`,
      ),
      restorePrefix(restore),
    );
  }
  assert.match(ci, /run: node scripts\/image-cache-key.mjs \./);
  assert.match(pr, /run: node scripts\/image-cache-key.mjs \.lighthouse-base/);
  assert.doesNotMatch(
    ci + pr,
    /hashFiles\('package-lock.json', 'astro.config.mjs'\)/,
  );
  const baseRestore = pr.indexOf("name: Restore base Astro image assets");
  const stage = pr.indexOf(
    "name: Stage base image cache before restoring head",
  );
  const headRestore = pr.indexOf("name: Restore head Astro image assets");
  const headBuild = pr.indexOf("name: Build head revision");
  assert.ok(
    baseRestore < stage && stage < headRestore && headRestore < headBuild,
  );
});

test("only successful main CI saves shared assets, never PR runs", () => {
  const save = cacheStep(ci, "actions/cache/save@v5");
  assert.ok(save);
  assert.match(
    save,
    /if: github.event_name == 'push' && github.ref == 'refs\/heads\/main' && steps.image_toolchain.outputs.key != '' && steps.image_cache.outputs.cache-hit != 'true'\n/,
  );
  assert.doesNotMatch(save, /always\(\)|continue-on-error/);
  assert.ok(ci.indexOf("name: Build production site") < ci.indexOf(save));
  assert.match(save, /path: node_modules\/\.astro\/assets\n/);
  assert.match(
    save,
    /key: \$\{\{ steps.image_cache.outputs.cache-primary-key \}\}/,
  );
  for (const workflow of [ci, pr]) {
    assert.doesNotMatch(
      workflow,
      /uses: actions\/cache@|pull_request_target|workflow_run|secrets\./,
    );
    assert.match(workflow, /permissions:\n  contents: read/);
  }
  assert.doesNotMatch(pr, /actions\/cache\/save@/);
});

test("PR diagnostics retain provenance and fresh-build transformation counts", () => {
  assert.match(
    pr,
    /HEAD_IMAGE_CACHE_KEY: \$\{\{ steps.image_cache.outputs.cache-matched-key \}\}/,
  );
  assert.match(
    pr,
    /BASE_IMAGE_CACHE_KEY: \$\{\{ steps.base_image_cache.outputs.cache-matched-key \}\}/,
  );
  assert.match(
    pr,
    /Transfer size and restore duration are in the cache restore logs/,
  );
  assert.equal((pr.match(/shell: bash/g) ?? []).length, 2);
  for (const revision of ["head", "base"]) {
    assert.match(
      pr,
      new RegExp(`tee "\\$RUNNER_TEMP/lighthouse-${revision}-build.log"`),
    );
  }
  assert.match(pr, /generated=\$\(grep -c '\(before: .*kB, after: .*kB\)'/);
  assert.match(pr, /reused cache entry/);
  assert.match(pr, /revalidated cache entry/);
  assert.match(pr, /\$\{\{ runner.temp \}\}\/lighthouse-\*-build.log/);
});

test("the base restore is staged without mixing incompatible head assets", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "image-cache-stage-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const assets = path.join(directory, "node_modules/.astro/assets");
  mkdirSync(assets, { recursive: true });
  writeFileSync(path.join(assets, "base.webp"), "base toolchain");
  const script = cacheStep(
    pr,
    "name: Stage base image cache before restoring head",
  )
    .split("        run: |\n")[1]
    .replace(/^          /gm, "");
  const run = () =>
    spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], {
      cwd: directory,
      encoding: "utf8",
    });
  let result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(
      path.join(
        directory,
        ".lighthouse-base/node_modules/.astro/assets/base.webp",
      ),
      "utf8",
    ),
    "base toolchain",
  );
  result = run();
  assert.equal(result.status, 0, result.stderr);
  mkdirSync(assets, { recursive: true });
  writeFileSync(path.join(assets, "head.webp"), "head toolchain");
  assert.equal(
    readFileSync(path.join(assets, "head.webp"), "utf8"),
    "head toolchain",
  );
  assert.throws(() => readFileSync(path.join(assets, "base.webp")), {
    code: "ENOENT",
  });
});

test("the workflow summary counts transforms and handles missing build logs", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "image-cache-summary-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const summary = path.join(directory, "summary.md");
  writeFileSync(
    path.join(directory, "lighthouse-head-build.log"),
    [
      "image.webp (before: 12kB, after: 2kB)",
      "image.avif (reused cache entry)",
      "other.avif (reused cache entry)",
      "image.png (revalidated cache entry)",
    ].join("\n") + "\n",
  );
  const step = cacheStep(pr, "name: Report image cache outcome");
  const script = step.split("        run: |\n")[1].replace(/^          /gm, "");
  const result = spawnSync(
    "bash",
    ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", script],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        RUNNER_TEMP: directory,
        GITHUB_STEP_SUMMARY: summary,
        HEAD_IMAGE_CACHE_KEY: "head-toolchain-sha",
        HEAD_IMAGE_CACHE_HIT: "false",
        BASE_IMAGE_CACHE_KEY: "base-toolchain-sha",
        BASE_IMAGE_CACHE_HIT: "true",
      },
    },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const output = readFileSync(summary, "utf8");
  assert.match(
    output,
    /Head trusted main image-cache key: `head-toolchain-sha`/,
  );
  assert.match(
    output,
    /Base trusted main image-cache key: `base-toolchain-sha`/,
  );
  assert.match(
    output,
    /head image transforms: 1 generated, 2 reused, 1 revalidated/,
  );
  assert.match(output, /base build log unavailable/);
});
