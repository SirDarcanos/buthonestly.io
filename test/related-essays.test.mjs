import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildSemanticState,
  selectRelatedEssays,
  writeGeneratedFile,
} from "../src/lib/related-essays.mjs";

const essay = (slug, overrides = {}) => ({
  slug,
  title: `Essay ${slug}`,
  excerpt: `Excerpt ${slug}`,
  body: `Body ${slug}`,
  categories: [],
  tags: [],
  ...overrides,
});

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const vectorFor = (text) => [text.length / 100, 1];

test("semantic generation embeds published and scheduled essays once per input", async () => {
  const inventory = {
    essays: [essay("published"), essay("scheduled")],
    published: [essay("published")],
    scheduled: [essay("scheduled")],
  };
  const embeddedBatches = [];
  const embed = async (texts) => {
    embeddedBatches.push(texts);
    return texts.map(vectorFor);
  };

  const first = await buildSemanticState({
    inventory,
    cache: {},
    embed,
    embeddingVersion: "fixture-v1",
  });
  const second = await buildSemanticState({
    inventory,
    cache: first.cache,
    embed,
    embeddingVersion: "fixture-v1",
  });

  assert.deepEqual(Object.keys(first.cache), ["published", "scheduled"]);
  assert.deepEqual(Object.keys(first.related), ["published", "scheduled"]);
  assert.equal(embeddedBatches.length, 1);
  assert.equal(embeddedBatches[0].length, 2);
  assert.deepEqual(second, first);

  const changedInventory = {
    ...inventory,
    essays: [essay("published"), essay("scheduled", { body: "Changed body" })],
  };
  await buildSemanticState({
    inventory: changedInventory,
    cache: second.cache,
    embed,
    embeddingVersion: "fixture-v1",
  });

  assert.equal(embeddedBatches.length, 2);
  assert.equal(embeddedBatches[1].length, 1);
  assert.match(embeddedBatches[1][0], /Changed body/);

  const longBody = `${"x".repeat(4500)} ending`;
  const longInventory = {
    essays: [essay("long", { body: longBody })],
  };
  const longState = await buildSemanticState({
    inventory: longInventory,
    cache: {},
    embed,
    embeddingVersion: "fixture-v1",
  });
  await buildSemanticState({
    inventory: {
      essays: [essay("long", { body: `${longBody} changed` })],
    },
    cache: longState.cache,
    embed,
    embeddingVersion: "fixture-v1",
  });
  assert.equal(embeddedBatches.length, 4);

  await buildSemanticState({
    inventory,
    cache: second.cache,
    embed,
    embeddingVersion: "fixture-v2",
  });
  assert.equal(embeddedBatches.length, 5);
  assert.equal(embeddedBatches[4].length, 2);
});

test("semantic generation fails when stale essays cannot be embedded", async () => {
  await assert.rejects(
    buildSemanticState({
      inventory: { essays: [essay("source")] },
      cache: {},
      embed: async () => null,
      embeddingVersion: "fixture-v1",
    }),
    /did not return a vector/,
  );
});

test("semantic rankings favor tags, retain every candidate, and break ties deterministically", async () => {
  const candidates = Array.from({ length: 8 }, (_, index) =>
    essay(`candidate-${index}`),
  );
  candidates[0].categories = [{ name: "Shared" }];
  candidates[1].tags = [{ name: "Shared" }];
  const inventory = {
    essays: [
      essay("source", {
        categories: [{ name: "Shared" }],
        tags: [{ name: "Shared" }],
      }),
      ...candidates.reverse(),
    ],
  };

  const state = await buildSemanticState({
    inventory,
    cache: {},
    embed: async (texts) => texts.map(() => [1, 0]),
    embeddingVersion: "fixture-v1",
  });

  assert.equal(state.related.source.length, 8);
  assert.equal(state.related.source[0], "candidate-1");
  assert.equal(state.related.source[1], "candidate-0");
  assert.deepEqual(state.related.source.slice(2), [
    "candidate-2",
    "candidate-3",
    "candidate-4",
    "candidate-5",
    "candidate-6",
    "candidate-7",
  ]);
});

test("visible recommendations filter unpublished rankings and use the same taxonomy weighting", () => {
  const source = essay("source", {
    categories: ["Shared"],
    tags: ["Shared"],
    date: "2026-01-01T13:00:00.000Z",
  });
  const scheduled = essay("scheduled", {
    date: "2027-01-01T13:00:00.000Z",
  });
  const categoryMatch = essay("category-match", {
    categories: ["Shared"],
    date: "2025-01-01T13:00:00.000Z",
  });
  const tagMatch = essay("tag-match", {
    tags: ["Shared"],
    date: "2024-01-01T13:00:00.000Z",
  });
  const recent = essay("recent", {
    date: "2026-02-01T13:00:00.000Z",
  });

  const selected = selectRelatedEssays({
    source,
    essays: [source, scheduled, categoryMatch, tagMatch, recent],
    rankedSlugs: ["scheduled", "recent"],
    publishedSlugs: new Set([
      "source",
      "category-match",
      "tag-match",
      "recent",
    ]),
    size: 3,
  });

  assert.deepEqual(
    selected.map(({ slug }) => slug),
    ["recent", "tag-match", "category-match"],
  );
});

test("semantic workflow runs for essay changes and manually without a schedule", () => {
  const workflow = readFileSync(
    path.join(repositoryRoot, ".github/workflows/related.yml"),
    "utf8",
  );

  assert.match(workflow, /push:/);
  assert.match(workflow, /src\/content\/essays\/\*\*/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*schedule:/m);
  assert.match(workflow, /npm install --no-save @huggingface\/transformers/);
  assert.match(workflow, /package-lock\.json/);
  assert.match(workflow, /\.github\/workflows\/related\.yml/);
  assert.match(workflow, /src\/lib\/essay-inventory\.mjs/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(
    workflow,
    /REPOSITORY_DEPLOY_KEY: \$\{\{ secrets\.REPOSITORY_DEPLOY_KEY \}\}/,
  );
  assert.match(
    workflow,
    /node scripts\/checkpoint-generated-state\.mjs related/,
  );
  assert.doesNotMatch(workflow, /GIT_SSH_COMMAND|ssh-key:|git pull --rebase/);
  assert.match(workflow, /cancel-in-progress: true/);
});

test("generated files remain untouched when semantic state is unchanged", async (testContext) => {
  const directory = mkdtempSync(path.join(tmpdir(), "related-state-"));
  testContext.after(() => rmSync(directory, { recursive: true }));
  const filePath = path.join(directory, "related.json");
  const contents = '{"source":["candidate"]}\n';

  assert.equal(await writeGeneratedFile(filePath, contents), true);
  const firstModified = statSync(filePath).mtimeNs;
  assert.equal(await writeGeneratedFile(filePath, contents), false);

  assert.equal(statSync(filePath).mtimeNs, firstModified);
  assert.equal(readFileSync(filePath, "utf8"), contents);
});
