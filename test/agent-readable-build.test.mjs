import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { createWindow } from "@mixmark-io/domino";
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

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("the production build exposes homepage and agent-readable navigation", () => {
  const build = spawnSync("npm", ["run", "build"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(build.status, 0, build.stdout + build.stderr);

  const inventory = loadEssayInventory();
  const publishedEssays = [...inventory.published].sort(
    (a, b) =>
      b.publishedAt.valueOf() - a.publishedAt.valueOf() ||
      a.slug.localeCompare(b.slug),
  );
  const [leadEssay, ...remainingEssays] = publishedEssays;
  const homepage = createWindow(
    readFileSync(path.join(repositoryRoot, "dist", "index.html"), "utf8"),
  ).document;
  const lead = homepage.querySelector("#highlight");
  assert.ok(lead);
  const leadCoverLink = lead.querySelector("picture").closest("a");
  const leadTitleLink = lead.querySelector("h2 a");
  const leadExcerpt = lead.querySelector(".lead");
  const leadSectionLink = lead.querySelector(".label a");
  const recent = homepage.querySelector('[aria-labelledby="recent-essays"]');
  assert.ok(recent);
  const recentEssays = Array.from(recent.querySelectorAll("article"));
  const archiveLink = recent.querySelector('a[href="/essays/"]');

  assert.equal(
    homepage.querySelector("h1").textContent.trim(),
    "Latest essays",
  );
  assert.equal(leadCoverLink.getAttribute("href"), leadEssay.pathname);
  assert.equal(
    leadCoverLink.getAttribute("data-track"),
    "Homepage lead essay click",
  );
  assert.equal(
    leadCoverLink.getAttribute("aria-label"),
    `Read ${leadEssay.title}`,
  );
  assert.equal(leadTitleLink.getAttribute("href"), leadEssay.pathname);
  assert.equal(
    leadTitleLink.getAttribute("data-track"),
    "Homepage lead essay click",
  );
  assert.equal(leadExcerpt.closest("a"), null);
  assert.equal(
    leadSectionLink.getAttribute("href"),
    `/section/${leadEssay.categories[0].slug}/`,
  );
  assert.equal(leadSectionLink.hasAttribute("data-track"), false);
  assert.equal(
    recent.querySelector("h2").textContent.trim(),
    "More recent essays",
  );
  assert.equal(recentEssays.length, 6);

  for (const [index, article] of recentEssays.entries()) {
    const essay = remainingEssays[index];
    const titleLink = article.querySelector("h3 a");
    const sectionLink = article.querySelector(".label a");
    const excerpt = article.querySelector(".excerpt");
    assert.equal(titleLink.textContent.trim(), essay.title);
    assert.equal(titleLink.getAttribute("href"), essay.pathname);
    assert.equal(
      titleLink.getAttribute("data-track"),
      "Homepage recent essay click",
    );
    assert.equal(
      sectionLink.getAttribute("href"),
      `/section/${essay.categories[0].slug}/`,
    );
    assert.equal(sectionLink.hasAttribute("data-track"), false);
    assert.equal(excerpt.closest("a"), null);
  }

  assert.equal(archiveLink.textContent.trim(), "Browse all essays →");
  assert.equal(
    archiveLink.getAttribute("data-track"),
    "Homepage essay archive click",
  );

  const bestReadSlugs = [
    "gaming-made-me-better-leader",
    "psychological-safety-in-teams-people-first-leadership",
    "how-to-choose-a-software-license-for-your-next-project",
    "write-in-markdown",
    "do-you-trust-your-instincts-making-smart-wordpress-choices",
    "woocommerce-attributes-vs-variations",
  ];
  const bestReads = homepage.querySelector('[aria-labelledby="best-reads"]');
  assert.ok(bestReads);
  assert.equal(bestReads.previousElementSibling, recent);
  assert.equal(
    bestReads.nextElementSibling.querySelector("h2").textContent.trim(),
    "Downloads & Tools",
  );
  assert.equal(bestReads.querySelector("h2").textContent.trim(), "Best reads");
  assert.equal(
    bestReads.querySelector("header p").textContent.trim(),
    "Enduring essays and practical guides worth starting with.",
  );
  assert.doesNotMatch(bestReads.textContent, /cornerstone/i);

  const bestReadCards = Array.from(bestReads.querySelectorAll("article"));
  assert.equal(bestReadCards.length, bestReadSlugs.length);
  assert.deepEqual(
    inventory.published
      .filter(({ cornerstone }) => cornerstone)
      .map(({ slug }) => slug)
      .sort(),
    [...bestReadSlugs].sort(),
  );

  for (const [index, article] of bestReadCards.entries()) {
    const essay = inventory.get(bestReadSlugs[index]);
    const titleLink = article.querySelector("h3 a");
    const sectionLink = article.querySelector(".label a");
    const excerpt = article.querySelector(".excerpt");
    const cta = Array.from(article.querySelectorAll("a")).find(
      (link) => link.textContent.trim() === "Read essay →",
    );

    assert.equal(article.closest("a"), null);
    assert.equal(titleLink.textContent.trim(), essay.title);
    assert.equal(titleLink.getAttribute("href"), essay.pathname);
    assert.equal(
      titleLink.getAttribute("data-track"),
      "Homepage best read click",
    );
    assert.equal(
      sectionLink.getAttribute("href"),
      `/section/${essay.categories[0].slug}/`,
    );
    assert.equal(sectionLink.hasAttribute("data-track"), false);
    assert.equal(excerpt.textContent.trim(), essay.excerpt);
    assert.equal(excerpt.closest("a"), null);
    assert.equal(cta.getAttribute("href"), essay.pathname);
    assert.equal(cta.getAttribute("aria-label"), `Read ${essay.title}`);
    assert.equal(cta.getAttribute("data-track"), "Homepage best read click");
  }

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
    assert.doesNotMatch(markdown, /\t/);
    assert.doesNotMatch(
      withoutFencedCode(markdown),
      /^(?:> )*(?:[-+*]|\d+\.) {2,}\S/m,
    );
    assert.doesNotMatch(
      markdown,
      /data-agent-|data-pagefind|newsletterIntro|contentHash|<script|<form/i,
    );
  }

  const coverEssay = inventory.get("vibe-writing-line-between-human-machine");
  const coverMarkdown = readFileSync(
    fileForUrl(markdownUrl(coverEssay.pathname)),
    "utf8",
  );
  assert.match(
    coverMarkdown,
    new RegExp(
      `!\\[${escapeRegExp(coverEssay.coverAlt)}\\]\\(https://buthonestly\\.io/_astro/`,
    ),
  );
  assert.match(
    coverMarkdown,
    /\[Suzy Hazelwood\]\(https:\/\/www\.pexels\.com\/@suzyhazelwood\/\)/,
  );

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
