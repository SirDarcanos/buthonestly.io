import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createLighthouseStatePort,
  historicalContentHashes,
  planPostPublicationChecks,
} from "../scripts/run-lighthouse-monitoring.mjs";

test("Lighthouse state initializes and is written deterministically", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "lighthouse-state-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "state.json");
  const state = createLighthouseStatePort({
    filePath,
    now: () => new Date("2026-08-01T00:00:00.000Z"),
  });

  const initial = await state.load();
  assert.equal(initial.version, 1);
  assert.equal(initial.postPublicationBootstrapped, false);
  await state.save({
    ...initial,
    outcomes: { "mobile:/z/": {}, "desktop:/a/": {} },
    checkedContentHashes: { zebra: ["z"], alpha: ["a"] },
  });
  const authored = await readFile(filePath, "utf8");
  assert.ok(authored.indexOf('"alpha"') < authored.indexOf('"zebra"'));
  assert.ok(
    authored.indexOf('"desktop:/a/"') < authored.indexOf('"mobile:/z/"'),
  );
  assert.deepEqual(await state.load(), JSON.parse(authored));
});

test("the first publication handoff bootstraps historical hashes without auditing them", () => {
  const published = [
    {
      slug: "historical",
      publicContentHash: "historical-hash",
      publishedAt: new Date("2026-07-01T13:00:00.000Z"),
    },
    {
      slug: "corrected",
      publicContentHash: "corrected-hash",
      publishedAt: new Date("2026-07-02T13:00:00.000Z"),
    },
    {
      slug: "newly-live",
      publicContentHash: "new-hash",
      publishedAt: new Date("2026-08-30T13:00:00.000Z"),
    },
  ];
  const plan = planPostPublicationChecks({
    published,
    monitoringState: {
      postPublicationBootstrapped: false,
      checkedContentHashes: {},
    },
    changedFiles: [
      "src/content/essays/corrected/corrected.mdx",
      "docs/operations.md",
    ],
    runStartedAt: "2026-08-30T13:15:00.000Z",
    now: new Date("2026-08-30T13:20:00.000Z"),
  });

  assert.deepEqual(
    plan.bootstrapCandidates.map(({ slug }) => slug),
    ["historical"],
  );
  assert.deepEqual(
    plan.candidates.map(({ slug }) => slug),
    ["corrected", "newly-live"],
  );
});

test("after bootstrap every unseen Live Essay hash remains eligible", () => {
  const published = [
    {
      slug: "historical",
      publicContentHash: "historical-hash",
      publishedAt: new Date("2026-07-01T13:00:00.000Z"),
    },
    {
      slug: "corrected",
      publicContentHash: "corrected-hash-two",
      publishedAt: new Date("2026-07-02T13:00:00.000Z"),
    },
  ];
  const plan = planPostPublicationChecks({
    published,
    monitoringState: {
      postPublicationBootstrapped: true,
      checkedContentHashes: { historical: ["historical-hash"] },
    },
    now: new Date("2026-09-01T00:00:00.000Z"),
  });

  assert.deepEqual(plan.bootstrapCandidates, []);
  assert.deepEqual(
    plan.candidates.map(({ slug }) => slug),
    ["corrected"],
  );
});

test("bootstrap records the activation cohort without auditing historical Essays", () => {
  assert.deepEqual(
    historicalContentHashes([
      { slug: "first", publicContentHash: "first-hash" },
      { slug: "second", publicContentHash: "second-hash" },
    ]),
    { first: ["first-hash"], second: ["second-hash"] },
  );
});
