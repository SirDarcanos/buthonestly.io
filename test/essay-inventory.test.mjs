import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  EssayInventoryError,
  getPublicationState,
  loadEssayInventory,
} from "../src/lib/essay-inventory.mjs";
import { buildLastmodMap } from "../src/lib/sitemap-lastmod.mjs";
import { publishDate } from "../src/lib/publish-time.mjs";

const frontmatter = (overrides = {}) => {
  const metadata = {
    title: "Fixture essay",
    date: "2026-09-15",
    excerpt: "A fixture excerpt.",
    newsletterIntro: "A fixture newsletter introduction.",
    cover: "cover.jpg",
    coverAlt: "A fixture cover.",
    categories: ["Programming"],
    tags: ["Testing"],
    ...overrides,
  };
  const lines = ["---"];
  for (const [key, value] of Object.entries(metadata)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`, ...value.map((item) => `  - ${item}`));
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  return `${lines.join("\n")}\n---\n\nFixture prose.\n`;
};

const fixtureDirectory = (testContext) => {
  const directory = mkdtempSync(path.join(tmpdir(), "essay-inventory-"));
  testContext.after(() => rmSync(directory, { recursive: true }));
  return directory;
};

const writeEssay = (directory, slug, extension, source = frontmatter()) => {
  const essayDirectory = path.join(directory, slug);
  mkdirSync(essayDirectory, { recursive: true });
  writeFileSync(path.join(essayDirectory, `${slug}.${extension}`), source);
};

test("sitemap freshness is projected from the published inventory", (testContext) => {
  const directory = fixtureDirectory(testContext);
  writeEssay(
    directory,
    "published",
    "mdx",
    frontmatter({ date: "2026-01-10", updated: "2026-01-12" }),
  );
  writeEssay(
    directory,
    "scheduled",
    "mdx",
    frontmatter({ date: "2027-01-10" }),
  );
  const inventory = loadEssayInventory({
    essaysDirectory: directory,
    now: new Date("2026-06-01T00:00:00.000Z"),
  });

  const lastmod = buildLastmodMap(inventory);

  assert.equal(
    lastmod.get("/published/").toISOString(),
    "2026-01-12T13:00:00.000Z",
  );
  assert.equal(
    lastmod.get("/section/programming/").toISOString(),
    "2026-01-12T13:00:00.000Z",
  );
  assert.equal(lastmod.has("/scheduled/"), false);
});

test("public hashes track reader-facing changes and ignore workflow metadata order", (testContext) => {
  const directory = fixtureDirectory(testContext);
  writeEssay(
    directory,
    "hash-example",
    "mdx",
    frontmatter({ cornerstone: false })
      .replace(
        "tags:",
        "downloads:\n  - file: guide.pdf\n    label: Guide\ntags:",
      )
      .replace(
        "Fixture prose.",
        'import figure from "./figure.jpg";\n\n<Figure src={figure} alt="Fixture" />',
      ),
  );
  const essayDirectory = path.join(directory, "hash-example");
  writeFileSync(path.join(essayDirectory, "cover.jpg"), "first cover");
  writeFileSync(path.join(essayDirectory, "figure.jpg"), "first figure");
  writeFileSync(path.join(essayDirectory, "guide.pdf"), "first download");
  const first = loadEssayInventory({ essaysDirectory: directory }).get(
    "hash-example",
  );

  const reordered = `---
newsletterIntro: A fixture newsletter introduction.
downloads:
  - label: Guide
    file: guide.pdf
tags:
  - Testing
categories:
  - Programming
coverAlt: A fixture cover.
cover: cover.jpg
excerpt: A fixture excerpt.
date: 2026-09-15
title: Fixture essay
cornerstone: true
---

import figure from "./figure.jpg";

<Figure src={figure} alt="Fixture" />
`;
  writeEssay(directory, "hash-example", "mdx", reordered);
  const equivalent = loadEssayInventory({ essaysDirectory: directory }).get(
    "hash-example",
  );

  assert.equal(equivalent.publicContentHash, first.publicContentHash);
  assert.equal(equivalent.narrationUrl, undefined);
  assert.equal(
    getPublicationState(equivalent, {
      at: new Date("2026-09-16T00:00:00.000Z"),
      productionContentHash: equivalent.publicContentHash,
    }),
    "live",
  );
  assert.equal(
    getPublicationState(equivalent, {
      at: new Date("2026-09-16T00:00:00.000Z"),
      productionContentHash: "stale-hash",
    }),
    "published",
  );

  for (const [filename, contents] of [
    ["cover.jpg", "changed cover"],
    ["figure.jpg", "changed figure"],
    ["guide.pdf", "changed download"],
  ]) {
    writeFileSync(path.join(essayDirectory, filename), contents);
    const changedAsset = loadEssayInventory({
      essaysDirectory: directory,
    }).get("hash-example");
    assert.notEqual(
      changedAsset.publicContentHash,
      equivalent.publicContentHash,
    );
    writeFileSync(
      path.join(essayDirectory, filename),
      filename === "cover.jpg"
        ? "first cover"
        : filename === "figure.jpg"
          ? "first figure"
          : "first download",
    );
  }

  writeEssay(
    directory,
    "hash-example",
    "mdx",
    reordered.replace(
      '<Figure src={figure} alt="Fixture" />',
      '<Figure src={figure} alt="Changed fixture" />',
    ),
  );
  const changed = loadEssayInventory({ essaysDirectory: directory }).get(
    "hash-example",
  );
  assert.notEqual(changed.publicContentHash, first.publicContentHash);
});

test("inventory normalizes metadata, freshness, taxonomy, and narration", (testContext) => {
  const directory = fixtureDirectory(testContext);
  const source = frontmatter({
    title: "  Normalized title  ",
    updated: "2026-09-20",
    categories: ["Programming", " Leadership "],
    tags: ["Testing", "Testing"],
  })
    .replace(
      "tags:",
      "downloads:\n  - file: ' guide.pdf '\n    label: ' Guide '\ntags:",
    )
    .replace("tags:", "audio: fixture narration.mp3\ntags:");
  writeEssay(directory, "normalized", "mdx", source);

  const essay = loadEssayInventory({ essaysDirectory: directory }).get(
    "normalized",
  );

  assert.equal(essay.title, "Normalized title");
  assert.equal(essay.newsletterIntro, "A fixture newsletter introduction.");
  assert.equal(essay.freshnessAt.toISOString(), "2026-09-20T13:00:00.000Z");
  assert.equal(essay.pathname, "/normalized/");
  assert.equal(essay.canonicalUrl, "https://buthonestly.io/normalized/");
  assert.deepEqual(essay.categories, [
    {
      name: "Programming",
      slug: "programming",
      pathname: "/section/programming/",
      canonicalUrl: "https://buthonestly.io/section/programming/",
    },
    {
      name: "Leadership",
      slug: "leadership",
      pathname: "/section/leadership/",
      canonicalUrl: "https://buthonestly.io/section/leadership/",
    },
  ]);
  assert.equal(essay.tags.length, 1);
  assert.deepEqual(essay.downloads, [{ file: "guide.pdf", label: "Guide" }]);
  assert.equal(
    essay.narrationUrl,
    "https://static.buthonestly.io/audio/fixture%20narration.mp3",
  );
});

test("inventory rejects taxonomy slugs shared by different names", (testContext) => {
  const directory = fixtureDirectory(testContext);
  writeEssay(
    directory,
    "cplusplus",
    "mdx",
    frontmatter({ categories: ["Programming"], tags: ["C++"] }),
  );
  writeEssay(
    directory,
    "csharp",
    "mdx",
    frontmatter({ categories: ["Programming"], tags: ["C#"] }),
  );

  assert.throws(
    () => loadEssayInventory({ essaysDirectory: directory }),
    (error) =>
      error instanceof EssayInventoryError &&
      error.diagnostics.some(
        ({ code, message }) =>
          code === "taxonomy-collision" &&
          message.includes("C++") &&
          message.includes("C#"),
      ),
  );
});

test("inventory rejects missing reader-facing metadata", (testContext) => {
  const directory = fixtureDirectory(testContext);
  writeEssay(
    directory,
    "invalid-metadata",
    "mdx",
    frontmatter({
      title: "",
      newsletterIntro: "",
      coverAlt: "",
      categories: [],
      sticky: "sometimes",
      audio: "audio/fixture.mp3",
      unexpected: "metadata",
    }),
  );

  assert.throws(
    () => loadEssayInventory({ essaysDirectory: directory }),
    (error) =>
      error instanceof EssayInventoryError &&
      [
        "title",
        "newsletterIntro",
        "coverAlt",
        "categories",
        "sticky",
        "audio",
        "unexpected",
      ].every((field) =>
        error.diagnostics.some((diagnostic) => diagnostic.field === field),
      ),
  );
});

test("inventory resolves publication boundaries and rejects impossible dates", (testContext) => {
  assert.equal(publishDate("2026-09-15T10:00:00Z"), null);
  assert.equal(
    publishDate(new Date("2026-09-15T10:00:00Z")).toISOString(),
    "2026-09-15T13:00:00.000Z",
  );

  const directory = fixtureDirectory(testContext);
  writeEssay(directory, "scheduled", "mdx");

  const inventory = loadEssayInventory({
    essaysDirectory: directory,
    now: new Date("2026-09-15T12:59:59.999Z"),
  });
  const essay = inventory.get("scheduled");

  assert.equal(essay.publicationDay, "2026-09-15");
  assert.equal(essay.publishedAt.toISOString(), "2026-09-15T13:00:00.000Z");
  assert.deepEqual(inventory.published, []);
  assert.deepEqual(inventory.scheduled, [essay]);
  assert.equal(
    getPublicationState(essay, {
      at: new Date("2026-09-15T13:00:00.000Z"),
    }),
    "published",
  );

  const invalidDirectory = fixtureDirectory(testContext);
  writeEssay(
    invalidDirectory,
    "invalid-date",
    "mdx",
    frontmatter({ date: "2026-02-30" }),
  );
  writeEssay(
    invalidDirectory,
    "invalid-timestamp",
    "mdx",
    frontmatter({ date: "2026-09-15T10:00:00Z" }),
  );
  writeEssay(
    invalidDirectory,
    "invalid-offset",
    "mdx",
    frontmatter({ date: "2026-09-15T10:00:00+03:00" }),
  );
  writeEssay(
    invalidDirectory,
    "invalid-updated",
    "mdx",
    frontmatter({ updated: "2026-09-20T13:00:00Z" }),
  );
  assert.throws(
    () => loadEssayInventory({ essaysDirectory: invalidDirectory }),
    (error) =>
      error instanceof EssayInventoryError &&
      error.diagnostics.filter(
        (diagnostic) => diagnostic.code === "invalid-date",
      ).length === 4,
  );
});

test("inventory accepts MDX as the sole essay source format", (testContext) => {
  const directory = fixtureDirectory(testContext);
  writeEssay(directory, "mdx-essay", "mdx");

  const inventory = loadEssayInventory({ essaysDirectory: directory });

  assert.deepEqual(
    inventory.essays.map(({ slug }) => slug),
    ["mdx-essay"],
  );

  writeEssay(directory, "markdown-essay", "md");
  assert.throws(
    () => loadEssayInventory({ essaysDirectory: directory }),
    (error) =>
      error instanceof EssayInventoryError &&
      error.diagnostics.some(
        (diagnostic) => diagnostic.code === "invalid-source-format",
      ),
  );
});
