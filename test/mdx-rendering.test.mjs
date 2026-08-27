import assert from "node:assert/strict";
import { copyFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const fixtureRoot = path.join(repositoryRoot, "test/fixtures/mdx-rendering");

const readBuiltPage = (route) =>
  readFileSync(path.join(fixtureRoot, "dist", route, "index.html"), "utf8");

test("MDX renders ordinary Markdown and the semantic content modules", (context) => {
  const configPath = path.join(fixtureRoot, "astro.config.mjs");
  context.after(() => {
    rmSync(configPath, { force: true });
    rmSync(path.join(fixtureRoot, ".astro"), { recursive: true, force: true });
    rmSync(path.join(fixtureRoot, "dist"), { recursive: true, force: true });
  });
  copyFileSync(path.join(fixtureRoot, "astro.config.fixture"), configPath);

  const result = spawnSync("npx", ["astro", "build", "--root", fixtureRoot], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);

  const ordinary = readBuiltPage("ordinary");
  assert.match(ordinary, /Ordinary prose survives MDX/);
  assert.match(
    ordinary,
    /href="https:\/\/example\.com\/reference"[^>]*title="nofollow"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/,
  );
  assert.doesNotMatch(ordinary, /rel="[^"]*nofollow/);

  const rich = readBuiltPage("rich");
  assert.match(rich, /<picture>/);
  assert.match(rich, /<figcaption[^>]*>.*Photo credit.*<\/figcaption>/s);
  assert.match(rich, /class="content-gallery[^\"]*md:grid-cols-2/);
  assert.match(rich, /class="content-gallery[^\"]*md:grid-cols-3/);
  assert.match(rich, /class="content-gallery[^\"]*md:grid-cols-4/);
  assert.ok(
    rich.indexOf('alt="The first fixture"') <
      rich.indexOf('alt="The second fixture"'),
  );
  assert.match(rich, /<summary[^>]*>Quick Summary<\/summary>/);
  assert.match(rich, /AI-generated summary based on the text of the article/);
  assert.match(rich, /class="callout callout-tip"/);
  assert.match(rich, /class="callout callout-information"/);
  assert.match(rich, /class="callout callout-disclaimer"/);
  assert.match(
    rich,
    /href="https:\/\/example\.com\/cover-credit"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/,
  );
  assert.match(
    rich,
    /<blockquote>.*Useful words.*<cite[^>]*>.*Ada Example.*<\/cite>.*<\/blockquote>/s,
  );
  assert.match(
    rich,
    /href="https:\/\/example\.com\/source"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/,
  );
});
