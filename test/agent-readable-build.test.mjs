import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { loadEssayInventory } from "../src/lib/essay-inventory.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const siteUrl = "https://buthonestly.io";
const authoredPages = [
  "/about/",
  "/resources/",
  "/resources/free-ai-voice-generator/",
  "/artificial-intelligence-tools/",
  "/privacy/",
  "/terms-conditions/",
];

const markdownUrl = (pathname) => `${siteUrl}${pathname.replace(/\/$/, "")}.md`;

const fileForUrl = (url) =>
  path.join(repositoryRoot, "dist", new URL(url).pathname.replace(/^\//, ""));

const withoutFencedCode = (markdown) =>
  markdown.replace(/^(`{3,}|~{3,}).*?^\1\s*$/gms, "");

test("the production agent index leads to every editorial Markdown alternative", () => {
  const build = spawnSync("npm", ["run", "build"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(build.status, 0, build.stdout + build.stderr);

  const inventory = loadEssayInventory();
  const expectedUrls = new Set([
    ...inventory.published.map(({ pathname }) => markdownUrl(pathname)),
    ...authoredPages.map(markdownUrl),
  ]);
  const scheduledUrls = inventory.scheduled.map(({ pathname }) =>
    markdownUrl(pathname),
  );
  const index = readFileSync(
    path.join(repositoryRoot, "dist", "llms.txt"),
    "utf8",
  );
  const advertisedUrls = new Set(
    [...index.matchAll(/\]\((https:\/\/buthonestly\.io\/[^)]+\.md)\)/g)].map(
      ([, url]) => url,
    ),
  );

  assert.deepEqual(advertisedUrls, expectedUrls);
  assert.doesNotMatch(index, /there are no Markdown versions/i);

  for (const url of advertisedUrls) {
    const file = fileForUrl(url);
    assert.equal(existsSync(file), true, `${url} was advertised but not built`);
    const markdown = readFileSync(file, "utf8");
    assert.match(markdown, /^---\ncanonical:/);
    assert.doesNotMatch(markdown, /^title:/m);
    assert.match(
      markdown,
      new RegExp(
        `canonical: ${JSON.stringify(url.replace(/\.md$/, "/")).replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        )}`,
      ),
    );
    assert.equal(
      (withoutFencedCode(markdown).match(/^# /gm) ?? []).length,
      1,
      `${url} must contain one document title`,
    );
    assert.match(markdown, /^# .+\n\n\S/m);
    assert.doesNotMatch(
      withoutFencedCode(markdown),
      /^(?:> )*(?:[-+*]|\d+\.) {2,}\S/m,
    );
    assert.doesNotMatch(
      markdown,
      /data-agent-|data-pagefind|newsletterIntro|contentHash|<script|<form/i,
    );
  }

  for (const url of scheduledUrls) {
    assert.equal(advertisedUrls.has(url), false);
    assert.equal(existsSync(fileForUrl(url)), false);
  }

  for (const pathname of ["/", "/essays/", "/section/", "/topic/", "/404/"]) {
    assert.equal(
      existsSync(
        path.join(
          repositoryRoot,
          "dist",
          `${pathname.replace(/^\//, "").replace(/\/$/, "")}.md`,
        ),
      ),
      false,
    );
  }

  const headers = readFileSync(
    path.join(repositoryRoot, "dist", "_headers"),
    "utf8",
  );
  assert.match(
    headers,
    /\/\*\.md\s+Content-Type: text\/markdown; charset=utf-8/,
  );
  assert.equal(
    existsSync(path.join(repositoryRoot, "dist", "pagefind")),
    false,
  );
});
