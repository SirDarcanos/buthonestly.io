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

const frontmatter = (overrides = {}) => {
  const metadata = {
    title: "Fixture essay",
    date: "2026-09-15",
    excerpt: "A fixture excerpt.",
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
    "md",
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
    "md",
    frontmatter({ audioVoice: "Enceladus", cornerstone: false }).replace(
      "tags:",
      "downloads:\n  - file: guide.pdf\n    label: Guide\ntags:",
    ),
  );
  const first = loadEssayInventory({ essaysDirectory: directory }).get(
    "hash-example",
  );

  const reordered = `---
audioVoice: Other voice
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

Fixture prose.
`;
  writeEssay(directory, "hash-example", "md", reordered);
  const equivalent = loadEssayInventory({ essaysDirectory: directory }).get(
    "hash-example",
  );

  assert.equal(equivalent.publicContentHash, first.publicContentHash);
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

  writeEssay(
    directory,
    "hash-example",
    "md",
    reordered.replace("Fixture prose.", "Changed public prose."),
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
    .replace(
      "Fixture prose.",
      "Fixture prose.\n\n![[fixture.mp3]]\n\n`![[documentation.mp3]]`",
    );
  writeEssay(directory, "normalized", "mdx", source);

  const essay = loadEssayInventory({ essaysDirectory: directory }).get(
    "normalized",
  );

  assert.equal(essay.title, "Normalized title");
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
    "https://static.buthonestly.io/audio/fixture.mp3",
  );
});

test("inventory rejects missing reader-facing metadata", (testContext) => {
  const directory = fixtureDirectory(testContext);
  writeEssay(
    directory,
    "invalid-metadata",
    "md",
    frontmatter({
      title: "",
      coverAlt: "",
      categories: [],
      sticky: "sometimes",
    }),
  );

  assert.throws(
    () => loadEssayInventory({ essaysDirectory: directory }),
    (error) =>
      error instanceof EssayInventoryError &&
      ["title", "coverAlt", "categories", "sticky"].every((field) =>
        error.diagnostics.some((diagnostic) => diagnostic.field === field),
      ),
  );
});

test("inventory resolves publication boundaries and rejects impossible dates", (testContext) => {
  const directory = fixtureDirectory(testContext);
  writeEssay(directory, "scheduled", "md");

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
    "md",
    frontmatter({ date: "2026-02-30" }),
  );
  writeEssay(
    invalidDirectory,
    "invalid-timestamp",
    "md",
    frontmatter({ date: "2026-02-30T10:00:00Z" }),
  );
  assert.throws(
    () => loadEssayInventory({ essaysDirectory: invalidDirectory }),
    (error) =>
      error instanceof EssayInventoryError &&
      error.diagnostics.filter(
        (diagnostic) => diagnostic.code === "invalid-date",
      ).length === 2,
  );
});

test("inventory discovers Markdown and MDX and rejects duplicate slugs", (testContext) => {
  const directory = fixtureDirectory(testContext);
  writeEssay(directory, "markdown-essay", "md");
  writeEssay(directory, "mdx-essay", "mdx");

  const inventory = loadEssayInventory({ essaysDirectory: directory });

  assert.deepEqual(
    inventory.essays.map(({ slug, sourceFormat }) => ({ slug, sourceFormat })),
    [
      { slug: "markdown-essay", sourceFormat: "markdown" },
      { slug: "mdx-essay", sourceFormat: "mdx" },
    ],
  );

  writeEssay(directory, "markdown-essay", "mdx");
  assert.throws(
    () => loadEssayInventory({ essaysDirectory: directory }),
    (error) =>
      error instanceof EssayInventoryError &&
      error.diagnostics.some(
        (diagnostic) => diagnostic.code === "duplicate-slug",
      ),
  );
});
