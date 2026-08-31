import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createLighthouseStatePort,
  historicalContentHashes,
  isExpectedProductionVersionLive,
  planPostPublicationChecks,
  readPublicationMonitoringHandoffs,
  reportMarkdown,
  runPostPublicationChecks,
} from "../scripts/run-lighthouse-monitoring.mjs";

test("the workflow summary identifies the target, device, medians, and retained evidence", () => {
  const markdown = reportMarkdown(
    {
      advisory: true,
      skipped: false,
      routes: ["/example/"],
      devices: ["mobile"],
      results: [
        {
          route: "/example/",
          device: "mobile",
          status: "passed",
          result: {
            workload: "navigation",
            metrics: {
              lcpMs: 1200,
              cls: 0.04,
              scriptTransferBytes: 1000,
              mainThreadWorkMs: 300,
              firstPartyTransferBytes: 2200,
              thirdPartyTransferBytes: 400,
              performance: 0.91,
              accessibility: 0.98,
              bestPractices: 1,
              seo: 0.92,
            },
            runs: [
              { json: "one.json", html: "one.html" },
              { json: "two.json", html: "two.html" },
              { json: "three.json", html: "three.html" },
            ],
          },
        },
      ],
    },
    { evidenceUrl: "https://github.com/example/actions/runs/123#artifacts" },
  );

  assert.match(markdown, /Target: `\/example\/`/);
  assert.match(markdown, /Device: `mobile`/);
  assert.match(markdown, /Performance .* A11y \| BP \| SEO/);
  assert.match(markdown, /0\.910 .* 0\.980 \| 1\.000 \| 0\.920/);
  assert.match(
    markdown,
    /\[Download individual HTML and JSON reports\]\(https:\/\/github\.com\/example\/actions\/runs\/123#artifacts\)/,
  );
});

test("the workflow summary identifies advisory baseline evidence", () => {
  const markdown = reportMarkdown({
    advisory: true,
    skipped: false,
    routes: ["/"],
    devices: ["mobile", "desktop"],
    baselineProgress: [
      { device: "mobile", completed: 4, required: 4, status: "recorded" },
      { device: "desktop", completed: 1, required: 2, status: "duplicate" },
    ],
    results: [],
  });

  assert.match(
    markdown,
    /Advisory baseline evidence: `mobile` 4 of 4 \(recorded\); `desktop` 1 of 2 \(duplicate\)/,
  );
});

test("the workflow summary shows base and head absolute metrics with their delta", () => {
  const markdown = reportMarkdown({
    advisory: true,
    skipped: false,
    routes: ["/example/"],
    devices: ["mobile"],
    results: [
      {
        route: "/example/",
        device: "mobile",
        status: "passed",
        result: {
          workload: "navigation",
          metrics: { lcpMs: 1500, performance: 0.9 },
        },
        base: {
          status: "passed",
          result: {
            workload: "navigation",
            metrics: { lcpMs: 1200, performance: 0.95 },
          },
        },
        delta: { lcpMs: 300, performance: -0.05 },
      },
    ],
  });

  assert.match(markdown, /↳ base.*1,200.*0\.950/);
  assert.match(markdown, /↳ head − base.*300.*-0\.050/);
});

test("the workflow summary exposes a failed comparison baseline", () => {
  const markdown = reportMarkdown({
    advisory: true,
    skipped: false,
    routes: ["/example/"],
    devices: ["mobile"],
    results: [
      {
        route: "/example/",
        device: "mobile",
        status: "passed",
        result: { workload: "navigation", metrics: {} },
        base: {
          route: "/example/",
          device: "mobile",
          revision: "base",
          workload: "navigation",
          status: "audit-failed",
          error: "base route unavailable",
        },
      },
    ],
  });

  assert.match(
    markdown,
    /↳ base.*navigation.*audit-failed: base route unavailable/,
  );
});

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

test("the publication artifact carries exact monitoring handoffs", async (context) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "publication-handoff-read-"),
  );
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "handoff.json");
  await writeFile(
    filePath,
    JSON.stringify({
      version: 1,
      essays: [{ slug: "exact-essay", contentHash: "exact-hash" }],
    }),
  );

  assert.deepEqual(await readPublicationMonitoringHandoffs(filePath), [
    { slug: "exact-essay", contentHash: "exact-hash" },
  ]);
  assert.deepEqual(
    await readPublicationMonitoringHandoffs(
      path.join(directory, "missing.json"),
    ),
    [],
  );
});

test("stale production content cannot become a monitoring candidate", async () => {
  const essay = {
    slug: "exact-essay",
    canonicalUrl: "https://buthonestly.io/exact-essay/",
    publicContentHash: "expected-hash",
  };
  const responses = ["stale-hash", "expected-hash"];
  const fetch = async () =>
    new Response(
      `<article data-content-version="${responses.shift()}">Essay</article>`,
    );

  assert.equal(await isExpectedProductionVersionLive(essay, { fetch }), false);
  assert.equal(await isExpectedProductionVersionLive(essay, { fetch }), true);
});

test("post-publication planning accepts only the exact handed-off Essay hash", () => {
  const published = [
    {
      slug: "exact",
      publicContentHash: "exact-hash",
      publishedAt: new Date("2026-08-30T13:00:00.000Z"),
    },
    {
      slug: "not-handed-off",
      publicContentHash: "other-hash",
      publishedAt: new Date("2026-08-30T13:00:00.000Z"),
    },
  ];
  const plan = planPostPublicationChecks({
    published,
    handoffs: [
      { slug: "exact", contentHash: "exact-hash" },
      { slug: "not-handed-off", contentHash: "stale-hash" },
    ],
    monitoringState: {
      postPublicationBootstrapped: true,
      checkedContentHashes: {},
    },
    now: new Date("2026-08-30T13:20:00.000Z"),
  });

  assert.deepEqual(
    plan.candidates.map(({ slug }) => slug),
    ["exact"],
  );
});

test("one failed Live Essay check cannot interrupt later handoffs", async () => {
  const checked = [];
  const candidates = [
    { slug: "first", publicContentHash: "first-hash" },
    { slug: "second", publicContentHash: "second-hash" },
  ];

  await assert.rejects(
    runPostPublicationChecks({
      candidates,
      isLive: async () => true,
      run: async (essay) => {
        checked.push(essay.slug);
        if (essay.slug === "first") throw new Error("first audit failed");
        return { slug: essay.slug };
      },
    }),
    /first audit failed/,
  );

  assert.deepEqual(checked, ["first", "second"]);
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
    handoffs: published.map(({ slug, publicContentHash }) => ({
      slug,
      contentHash: publicContentHash,
    })),
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
    handoffs: published.map(({ slug, publicContentHash }) => ({
      slug,
      contentHash: publicContentHash,
    })),
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
