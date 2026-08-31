import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const trackedFiles = (...patterns) =>
  execFileSync("git", ["ls-files", ...patterns], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);

test("repository automation has exactly the approved workflows", () => {
  assert.deepEqual(trackedFiles(".github/workflows/*"), [
    ".github/workflows/ci.yml",
    ".github/workflows/lighthouse.yml",
    ".github/workflows/publication.yml",
    ".github/workflows/related.yml",
  ]);
});

test("Narration artifacts stay excluded from source control", () => {
  const artifacts = [
    "src/content/essays/example/example.mp3",
    "src/content/essays/example/example.audio.txt",
    "local/narration/example/provenance.json",
    "local/narration/example/synthesis-report.json",
    "local/narration/example/chunks/checkpoint.pcm",
  ];
  const ignored = execFileSync(
    "git",
    ["check-ignore", "--no-index", ...artifacts],
    { cwd: repositoryRoot, encoding: "utf8" },
  )
    .trim()
    .split("\n");

  assert.deepEqual(ignored, artifacts);
});

test("the repository contains no transitional publishing machinery", () => {
  const obsoletePaths = [
    ".github/workflows/lint-essays.yml",
    "scripts/build-email-assets.mjs",
    "scripts/build-og-image.mjs",
    "scripts/generate-redirects.mjs",
    "scripts/lint-essay.mjs",
    "src/content/Dashboard.base",
    "src/content/templates/code.md",
    "src/content/templates/figure.mdx",
    "src/content/templates/gallery.mdx",
    "src/content/templates/new-essay.mdx",
    "data/images-optimized.json",
    "data/indexnow-pinged.json",
    "data/link-graph.json",
    "data/newsletter-sent.json",
  ];

  assert.deepEqual(trackedFiles(...obsoletePaths), []);
  assert.deepEqual(trackedFiles("src/content/essays/**/*.md"), []);
  assert.deepEqual(trackedFiles("src/content/**/*.audio.txt"), []);
  assert.deepEqual(trackedFiles("public/_redirects"), ["public/_redirects"]);

  for (const file of trackedFiles(
    "src/content/**/*.md",
    "src/content/**/*.mdx",
    "src/content/**/*.base",
  )) {
    const content = readFileSync(path.join(repositoryRoot, file), "utf8");
    assert.doesNotMatch(
      content,
      /<%|\btp\.(?:system|file|date)|!\[\[|\[\[[^\]]|^>\s*\[!/m,
    );
  }

  const scripts = JSON.parse(
    readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
  ).scripts;
  for (const obsoleteScript of [
    "prebuild",
    "lint:essay",
    "og",
    "email-assets",
  ]) {
    assert.equal(scripts[obsoleteScript], undefined);
  }
});
