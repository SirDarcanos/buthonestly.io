import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  SearchReportError,
  generateSearchReport,
} from "../scripts/search-report.mjs";
import { loadEssayInventory } from "../src/lib/essay-inventory.mjs";

const metrics = (clicks, impressions, position = 1) => ({
  clicks,
  impressions,
  ctr: impressions === 0 ? 0 : clicks / impressions,
  position,
});

const makeWorkspace = (testContext) => {
  const root = mkdtempSync(path.join(tmpdir(), "search-report-"));
  testContext.after(() => rmSync(root, { recursive: true, force: true }));

  const essaysDirectory = path.join(root, "essays");
  const essayDirectory = path.join(essaysDirectory, "fixture-essay");
  mkdirSync(essayDirectory, { recursive: true });
  writeFileSync(
    path.join(essayDirectory, "fixture-essay.mdx"),
    `---
title: Fixture Essay
date: 2025-01-01
excerpt: Fixture excerpt.
newsletterIntro: Fixture newsletter introduction.
cover: cover.jpg
coverAlt: Fixture cover.
categories:
  - Testing
tags:
  - Search
---

Fixture prose.
`,
  );

  const configurationPath = path.join(root, "configuration.json");
  writeFileSync(
    configurationPath,
    JSON.stringify({
      version: 1,
      property: "sc-domain:buthonestly.io",
      searchType: "web",
      essayCohorts: { "fixture-essay": "Editorial-focus essay" },
      brandQueries: [
        { rule: "site-name", values: ["but honestly"] },
        {
          rule: "domain",
          values: ["buthonestly.io", "https://www.buthonestly.io/"],
        },
        {
          rule: "author",
          values: ["nicola mustone", "nico mustone", "mustone", "nico"],
        },
        { rule: "essay-title-and-slug", essays: ["fixture-essay"] },
      ],
      redirects: [{ from: "/old-fixture/", to: "/fixture-essay/" }],
    }),
  );
  const redirectsPath = path.join(root, "_redirects");
  writeFileSync(redirectsPath, "/old-fixture/ /fixture-essay/ 301\n");

  return {
    root,
    essaysDirectory,
    configurationPath,
    redirectsPath,
    snapshotsDirectory: path.join(root, "snapshots"),
    reportsDirectory: path.join(root, "reports"),
  };
};

const writeSnapshot = (
  workspace,
  month,
  {
    status = "final",
    property = "sc-domain:buthonestly.io",
    searchType = "web",
    end,
    totals = metrics(10, 100, 5),
    pages = [
      { page: "https://buthonestly.io/fixture-essay/", ...metrics(6, 60, 5) },
      { page: "https://buthonestly.io/old-fixture/", ...metrics(2, 20, 7) },
      { page: "https://buthonestly.io/", ...metrics(1, 10, 2) },
    ],
    pageQuery = [
      {
        page: "https://buthonestly.io/fixture-essay/",
        query: "But, Honestly!",
        ...metrics(2, 10, 3),
      },
    ],
  } = {},
) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0))
    .toISOString()
    .slice(0, 10);
  const intervalEnd = end ?? lastDay;
  const directory = path.join(
    workspace.snapshotsDirectory,
    `${start}--${intervalEnd}`,
  );
  mkdirSync(directory, { recursive: true });
  const datasets = {
    totals: { filename: "totals.json", rowCount: 1 },
    pages: { filename: "pages.json", rowCount: pages.length },
    pageQuery: { filename: "page-query.json", rowCount: pageQuery.length },
  };
  writeFileSync(
    path.join(directory, "manifest.json"),
    JSON.stringify({
      property,
      searchType,
      requestedInterval: { start, end: intervalEnd },
      effectiveInterval: { start, end: intervalEnd },
      adjustments: [],
      pulledAt: "2026-03-15T12:00:00.000Z",
      requestedDataState: "all",
      status,
      firstIncompleteDate: status === "partial" ? intervalEnd : null,
      package: { name: "gsc-snapshot", version: "0.2.0" },
      datasets,
    }),
  );
  writeFileSync(
    path.join(directory, "totals.json"),
    JSON.stringify({ rows: [totals] }),
  );
  writeFileSync(
    path.join(directory, "pages.json"),
    JSON.stringify({ rows: pages }),
  );
  writeFileSync(
    path.join(directory, "page-query.json"),
    JSON.stringify({ rows: pageQuery }),
  );
  return directory;
};

const addRedirectedEssay = (
  workspace,
  { slug = "second-essay", oldPath = "/old-second/" } = {},
) => {
  const essayDirectory = path.join(workspace.essaysDirectory, slug);
  mkdirSync(essayDirectory, { recursive: true });
  writeFileSync(
    path.join(essayDirectory, `${slug}.mdx`),
    `---
title: Second Essay
date: 2025-01-01
excerpt: Second fixture excerpt.
newsletterIntro: Second fixture newsletter introduction.
cover: cover.jpg
coverAlt: Second fixture cover.
categories:
  - Testing
tags:
  - Search
---

Second fixture prose.
`,
  );
  updateConfiguration(workspace, (configuration) => ({
    ...configuration,
    essayCohorts: {
      ...configuration.essayCohorts,
      [slug]: "Editorial-focus essay",
    },
    redirects: [...configuration.redirects, { from: oldPath, to: `/${slug}/` }],
  }));
  writeFileSync(
    workspace.redirectsPath,
    `${readFileSync(workspace.redirectsPath, "utf8")}${oldPath} /${slug}/ 301\n`,
  );
};

const generate = (workspace, overrides = {}) =>
  generateSearchReport({
    month: "2026-02",
    generatedAt: new Date("2026-03-20T10:00:00.000Z"),
    ...workspace,
    ...overrides,
  });

const updateConfiguration = (workspace, update) => {
  const configuration = JSON.parse(
    readFileSync(workspace.configurationPath, "utf8"),
  );
  writeFileSync(
    workspace.configurationPath,
    JSON.stringify(update(configuration)),
  );
};

test("committed reporting configuration reviews every Essay, Brand rule, and redirect", () => {
  const configuration = JSON.parse(
    readFileSync("config/search-console-reporting.json", "utf8"),
  );
  const configuredEssays = Object.keys(configuration.essayCohorts);
  const inventory = loadEssayInventory();
  const brandValues = configuration.brandQueries.flatMap(
    ({ values = [] }) => values,
  );
  const redirects = readFileSync("public/_redirects", "utf8");

  assert.equal(configuration.version, 1);
  assert.equal(configuredEssays.length, 49);
  assert.equal(new Set(configuredEssays).size, 49);
  assert.deepEqual(
    configuredEssays.sort(),
    inventory.essays.map(({ slug }) => slug).sort(),
  );
  assert.equal(brandValues.includes("but honestly"), true);
  for (const alias of ["nicola mustone", "nico mustone", "mustone", "nico"]) {
    assert.equal(brandValues.includes(alias), true);
  }
  assert.equal(
    inventory.essays.every(
      ({ slug, title }) =>
        brandValues.includes(slug) && brandValues.includes(title),
    ),
    true,
  );
  assert.equal(configuration.redirects.length > 0, true);
  assert.equal(
    configuration.redirects.every(({ from, to }) => {
      const deployed = redirects
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/))
        .find(([source]) => source === from);
      return (
        deployed?.[2] === "301" &&
        new URL(deployed[1], "https://buthonestly.io").pathname === to
      );
    }),
    true,
  );
});

test("generates one canonical model and atomically publishes JSON and Markdown", (testContext) => {
  const workspace = makeWorkspace(testContext);
  writeSnapshot(workspace, "2026-01", {
    totals: metrics(5, 50, 8),
    pages: [
      { page: "https://buthonestly.io/fixture-essay/", ...metrics(2, 20, 6) },
      { page: "https://buthonestly.io/old-fixture/", ...metrics(1, 10, 8) },
    ],
    pageQuery: [
      {
        page: "https://buthonestly.io/old-fixture/",
        query: "but honestly",
        ...metrics(1, 5, 5),
      },
    ],
  });
  writeSnapshot(workspace, "2026-02");

  const result = generate(workspace);
  const json = JSON.parse(readFileSync(result.jsonPath, "utf8"));
  const markdown = readFileSync(result.markdownPath, "utf8");

  assert.equal(json.schemaVersion, 1);
  assert.equal(json.reportingMonth.current, "2026-02");
  assert.equal(json.reportingMonth.previous, "2026-01");
  assert.equal(json.generatedAt, "2026-03-20T10:00:00.000Z");
  assert.equal(json.inputs.current.package.name, "gsc-snapshot");
  assert.match(json.configuration.hash, /^[a-f0-9]{64}$/);
  assert.equal(json.configuration.essayCohortCount, 1);
  assert.deepEqual(json.propertyContext.clicks, {
    current: 10,
    previous: 5,
    absoluteChange: 5,
    relativeChange: 1,
  });
  assert.deepEqual(json.propertyContext.ctr, {
    current: 0.1,
    previous: 0.1,
    percentagePointChange: 0,
  });
  assert.equal(json.cohorts["Editorial-focus essay"].clicks.current, 8);
  assert.equal(
    json.fieldData.source,
    "Chrome UX Report (CrUX), separate from Search Console",
  );
  assert.match(json.fieldData.origin.status, /field data unavailable/);
  assert.match(
    markdown,
    /Source: \*\*Chrome UX Report \(CrUX\), separate from Search Console\*\*/,
  );
  assert.equal(json.queries.brand.clicks.current, 2);
  assert.equal(json.queries.brand.normalizedQueries[0].query, "but honestly");
  assert.match(markdown, /10 clicks.*5.*\+5/s);
  assert.match(markdown, new RegExp(json.configuration.hash));
  assert.equal(markdown, json.renderedMarkdown);
  assert.equal(
    existsSync(path.join(path.dirname(result.jsonPath), "report.md")),
    true,
  );
  assert.equal(lstatSync(path.dirname(result.jsonPath)).isSymbolicLink(), true);

  const firstVersion = readlinkSync(path.dirname(result.jsonPath));
  const replacement = generate(workspace, {
    generatedAt: new Date("2026-03-21T10:00:00.000Z"),
  });
  const secondVersion = readlinkSync(path.dirname(replacement.jsonPath));
  assert.notEqual(secondVersion, firstVersion);
  assert.equal(
    JSON.parse(readFileSync(replacement.jsonPath, "utf8")).generatedAt,
    "2026-03-21T10:00:00.000Z",
  );
  assert.equal(
    existsSync(path.join(workspace.reportsDirectory, firstVersion)),
    false,
  );
});

test("classifies normalized disclosed queries by exact Brand rules and reports coverage", (testContext) => {
  const workspace = makeWorkspace(testContext);
  writeSnapshot(workspace, "2026-01", {
    pages: [
      { page: "https://buthonestly.io/fixture-essay/", ...metrics(4, 40, 4) },
    ],
    pageQuery: [
      {
        page: "https://buthonestly.io/fixture-essay/",
        query: "but honestly",
        ...metrics(1, 10, 3),
      },
    ],
  });
  writeSnapshot(workspace, "2026-02", {
    pages: [
      { page: "https://buthonestly.io/fixture-essay/", ...metrics(10, 100, 4) },
    ],
    pageQuery: [
      {
        page: "https://buthonestly.io/fixture-essay/",
        query: "But, Honestly!",
        ...metrics(2, 20, 2),
      },
      {
        page: "https://buthonestly.io/fixture-essay/",
        query: "BUT.  HONESTLY",
        ...metrics(1, 10, 4),
      },
      {
        page: "https://buthonestly.io/fixture-essay/",
        query: "HTTPS://WWW.BUTHONESTLY.IO/",
        ...metrics(1, 10, 3),
      },
      {
        page: "https://buthonestly.io/fixture-essay/",
        query: "nico",
        ...metrics(1, 10, 5),
      },
      {
        page: "https://buthonestly.io/fixture-essay/",
        query: "Fixture Essay",
        ...metrics(0, 0, 0),
      },
      {
        page: "https://buthonestly.io/fixture-essay/",
        query: "Fixture Essay guide",
        ...metrics(0, 0, 0),
      },
      {
        page: "https://buthonestly.io/fixture-essay/",
        query: "nico mustone review",
        ...metrics(1, 10, 6),
      },
      {
        page: "https://buthonestly.io/fixture-essay/",
        query: "nico™",
        ...metrics(1, 10, 7),
      },
      {
        page: "https://buthonestly.io/fixture-essay/",
        query: "Best tools?",
        ...metrics(1, 10, 8),
      },
      {
        page: "https://buthonestly.io/fixture-essay/",
        query: "BEST TOOLS!",
        ...metrics(1, 10, 10),
      },
    ],
  });

  const { model } = generate(workspace);
  const siteName = model.queries.brand.normalizedQueries.find(
    ({ query }) => query === "but honestly",
  );
  const bestTools = model.queries.generic.normalizedQueries.find(
    ({ query }) => query === "best tools",
  );

  assert.deepEqual(siteName.rawVariants, ["BUT.  HONESTLY", "But, Honestly!"]);
  assert.equal(siteName.clicks, 3);
  assert.equal(siteName.impressions, 30);
  assert.equal(siteName.position, 8 / 3);
  assert.deepEqual(bestTools.rawVariants, ["BEST TOOLS!", "Best tools?"]);
  assert.equal(bestTools.impressions, 20);
  assert.equal(bestTools.position, 9);
  assert.deepEqual(model.queries.brand.position, {
    current: 3.2,
    previous: 3,
    absoluteChange: 0.20000000000000018,
  });
  assert.equal(model.queries.generic.position.current, 7.75);
  assert.equal(
    model.queries.brand.normalizedQueries.some(({ query }) => query === "nico"),
    true,
  );
  assert.equal(
    model.queries.brand.normalizedQueries.some(
      ({ query }) => query === "fixture essay",
    ),
    true,
  );
  assert.equal(
    model.queries.generic.normalizedQueries.some(
      ({ query }) => query === "fixture essay guide",
    ),
    true,
  );
  assert.equal(
    model.queries.generic.normalizedQueries.some(
      ({ query }) => query === "nico mustone review",
    ),
    true,
  );
  assert.equal(
    model.queries.generic.normalizedQueries.some(
      ({ query }) => query === "nico™",
    ),
    true,
  );
  assert.deepEqual(model.queries.coverage.clicks, {
    current: 0.9,
    previous: 0.25,
    currentNumerator: 9,
    currentDenominator: 10,
    previousNumerator: 1,
    previousDenominator: 4,
  });
  assert.deepEqual(model.queries.coverage.impressions, {
    current: 0.9,
    previous: 0.25,
    currentNumerator: 90,
    currentDenominator: 100,
    previousNumerator: 10,
    previousDenominator: 40,
  });
  assert.match(
    model.renderedMarkdown,
    /disclosed subset covers 90\.00%.*90\.00%/s,
  );
});

test("generates bounded page and disclosed-query review candidates with previous context", (testContext) => {
  const workspace = makeWorkspace(testContext);
  writeSnapshot(workspace, "2026-01", {
    pages: [
      { page: "https://buthonestly.io/fixture-essay/", ...metrics(7, 70, 9) },
    ],
    pageQuery: [
      {
        page: "https://buthonestly.io/fixture-essay/",
        query: "specific question",
        ...metrics(2, 20, 12),
      },
    ],
  });
  writeSnapshot(workspace, "2026-02", {
    pages: [
      { page: "https://buthonestly.io/fixture-essay/", ...metrics(0, 50, 8) },
      {
        page: "https://buthonestly.io/resources/free-ai-voice-generator/",
        ...metrics(1, 50, 30),
      },
      { page: "https://buthonestly.io/essays/", ...metrics(0, 50, 1) },
      { page: "https://buthonestly.io/about/", ...metrics(0, 50, 10) },
    ],
    pageQuery: [
      {
        page: "https://buthonestly.io/fixture-essay/",
        query: "Specific question!",
        ...metrics(1, 10, 4),
      },
      {
        page: "https://buthonestly.io/fixture-essay/",
        query: "position thirty",
        ...metrics(1, 10, 30),
      },
      {
        page: "https://buthonestly.io/fixture-essay/",
        query: "too few impressions",
        ...metrics(1, 9, 10),
      },
      {
        page: "https://buthonestly.io/fixture-essay/",
        query: "position too low",
        ...metrics(1, 10, 3.99),
      },
      {
        page: "https://buthonestly.io/fixture-essay/",
        query: "position too high",
        ...metrics(1, 10, 30.01),
      },
    ],
  });

  const { model } = generate(workspace);
  const pageCandidate = model.candidates.find(
    ({ type, page }) => type === "page" && page === "/fixture-essay/",
  );
  const queryCandidate = model.candidates.find(
    ({ type, normalizedQuery }) =>
      type === "query" && normalizedQuery === "specific question",
  );

  assert.deepEqual(
    pageCandidate.evidence.map(({ label }) => label),
    ["Visibility candidate", "Click-through candidate"],
  );
  assert.equal(pageCandidate.current.impressions, 50);
  assert.equal(pageCandidate.current.position, 8);
  assert.equal(pageCandidate.previous.impressions, 70);
  assert.equal(pageCandidate.previous.position, 9);
  assert.equal(queryCandidate.current.impressions, 10);
  assert.equal(queryCandidate.current.position, 4);
  assert.equal(queryCandidate.previous.impressions, 20);
  assert.deepEqual(queryCandidate.rawVariants, ["Specific question!"]);
  assert.deepEqual(queryCandidate.previousRawVariants, ["specific question"]);
  assert.equal(
    model.candidates.some(
      ({ normalizedQuery }) => normalizedQuery === "position thirty",
    ),
    true,
  );
  for (const excluded of [
    "too few impressions",
    "position too low",
    "position too high",
  ]) {
    assert.equal(
      model.candidates.some(
        ({ normalizedQuery }) => normalizedQuery === excluded,
      ),
      false,
    );
  }
  assert.equal(
    model.candidates.some(
      ({ type, page, evidence }) =>
        type === "page" &&
        page === "/resources/free-ai-voice-generator/" &&
        evidence.length === 1 &&
        evidence[0].label === "Visibility candidate",
    ),
    true,
  );
  assert.equal(
    model.candidates.some(
      ({ type, page, evidence }) =>
        type === "page" &&
        page === "/essays/" &&
        evidence.length === 1 &&
        evidence[0].label === "Click-through candidate",
    ),
    true,
  );
  assert.match(
    model.renderedMarkdown,
    /prompts for human review.*Editorial-focus essay.*Visibility candidate, Click-through candidate/s,
  );
});

test("applies page candidate thresholds inclusively", async (testContext) => {
  const cases = [
    ["impressions below 50", metrics(0, 49, 8), []],
    ["visibility position below 8", metrics(1, 50, 7.99), []],
    ["visibility position above 30", metrics(1, 50, 30.01), []],
    ["click-through position below 1", metrics(0, 50, 0.99), []],
    [
      "click-through position above 10",
      metrics(0, 50, 10.01),
      ["Visibility candidate"],
    ],
    ["click-through requires zero clicks", metrics(1, 50, 5), []],
  ];

  for (const [name, pageMetrics, expectedLabels] of cases) {
    await testContext.test(name, () => {
      const workspace = makeWorkspace(testContext);
      writeSnapshot(workspace, "2026-01", { pages: [], pageQuery: [] });
      writeSnapshot(workspace, "2026-02", {
        pages: [
          {
            page: "https://buthonestly.io/fixture-essay/",
            ...pageMetrics,
          },
        ],
        pageQuery: [],
      });

      const candidate = generate(workspace).model.candidates.find(
        ({ type }) => type === "page",
      );
      assert.deepEqual(
        candidate?.evidence.map(({ label }) => label) ?? [],
        expectedLabels,
      );
    });
  }
});

test("excludes Legacy-tail and Peripheral essays from review candidates", async (testContext) => {
  for (const cohort of ["Legacy-tail essay", "Peripheral essay"]) {
    await testContext.test(cohort, () => {
      const workspace = makeWorkspace(testContext);
      updateConfiguration(workspace, (configuration) => ({
        ...configuration,
        essayCohorts: { "fixture-essay": cohort },
      }));
      writeSnapshot(workspace, "2026-01", { pages: [], pageQuery: [] });
      writeSnapshot(workspace, "2026-02", {
        pages: [
          {
            page: "https://buthonestly.io/fixture-essay/",
            ...metrics(0, 50, 8),
          },
        ],
        pageQuery: [
          {
            page: "https://buthonestly.io/fixture-essay/",
            query: "generic candidate",
            ...metrics(1, 10, 4),
          },
        ],
      });

      assert.deepEqual(generate(workspace).model.candidates, []);
    });
  }
});

test("retains all candidates in JSON while Markdown sorts and caps each cohort", (testContext) => {
  const workspace = makeWorkspace(testContext);
  writeSnapshot(workspace, "2026-01", { pages: [], pageQuery: [] });
  const pageQuery = Array.from({ length: 21 }, (_, index) => ({
    page: "https://buthonestly.io/fixture-essay/",
    query: `generic query ${String(index + 1).padStart(2, "0")}`,
    ...metrics(1, index + 10, 10),
  }));
  writeSnapshot(workspace, "2026-02", {
    pages: [
      {
        page: "https://buthonestly.io/fixture-essay/",
        ...metrics(1, 1_000, 1),
      },
    ],
    pageQuery,
  });

  const { model } = generate(workspace);
  const candidateSection = model.renderedMarkdown
    .split("### Editorial-focus essay\n\n")[1]
    .split("\n### Resource")[0];

  assert.equal(model.candidates.length, 21);
  assert.equal(
    (candidateSection.match(/^\| \/fixture-essay\//gm) ?? []).length,
    20,
  );
  assert.equal(
    candidateSection.indexOf("generic query 21") <
      candidateSection.indexOf("generic query 20"),
    true,
  );
  assert.equal(candidateSection.includes("generic query 01"), false);
});

test("attributes safe URL variants and redirects to canonical Page cohorts", (testContext) => {
  const workspace = makeWorkspace(testContext);
  writeSnapshot(workspace, "2026-01", { pages: [], pageQuery: [] });
  writeSnapshot(workspace, "2026-02", {
    totals: metrics(12, 120, 4),
    pages: [
      {
        page: "HTTPS://BUTHONESTLY.IO:443/fixture-essay#read",
        ...metrics(2, 20, 4),
      },
      {
        page: "http://buthonestly.io:80/old-fixture/",
        ...metrics(3, 30, 8),
      },
      {
        page: "https://buthonestly.io/resources/free-ai-voice-generator/",
        ...metrics(1, 10, 6),
      },
      {
        page: "https://buthonestly.io/section/testing/",
        ...metrics(1, 10, 5),
      },
      { page: "https://buthonestly.io/essays/", ...metrics(1, 10, 5) },
      { page: "https://buthonestly.io/about/", ...metrics(1, 10, 2) },
    ],
    pageQuery: [
      {
        page: "https://buthonestly.io/old-fixture/",
        query: "but honestly",
        ...metrics(2, 20, 7),
      },
    ],
  });

  const { model } = generate(workspace);
  const page = model.pages.comparisons["/fixture-essay/"];

  assert.equal(page.cohort, "Editorial-focus essay");
  assert.equal(page.clicks.current, 5);
  assert.equal(page.impressions.current, 50);
  assert.equal(page.position.current, 6.4);
  assert.deepEqual(page.sourceUrls.current, [
    "HTTPS://BUTHONESTLY.IO:443/fixture-essay#read",
    "http://buthonestly.io:80/old-fixture/",
  ]);
  assert.equal(model.cohorts.Resource.clicks.current, 1);
  assert.equal(model.cohorts.Archive.clicks.current, 2);
  assert.equal(model.cohorts["Site page"].clicks.current, 1);
  assert.equal(model.queries.brand.clicks.current, 2);
});

test("reports old and canonical redirect-pair measurements without changing canonical totals", (testContext) => {
  const workspace = makeWorkspace(testContext);
  updateConfiguration(workspace, (configuration) => ({
    ...configuration,
    redirects: [
      ...configuration.redirects,
      { from: "/older-fixture/", to: "/fixture-essay/" },
    ],
  }));
  writeFileSync(
    workspace.redirectsPath,
    `${readFileSync(workspace.redirectsPath, "utf8")}/older-fixture/ /fixture-essay/ 301\n`,
  );
  writeSnapshot(workspace, "2026-01", {
    pages: [
      { page: "https://buthonestly.io/fixture-essay/", ...metrics(3, 30, 4) },
      { page: "https://buthonestly.io/old-fixture/", ...metrics(1, 10, 10) },
    ],
    pageQuery: [],
  });
  writeSnapshot(workspace, "2026-02", {
    pages: [
      { page: "https://buthonestly.io/fixture-essay/", ...metrics(6, 60, 3) },
      { page: "https://buthonestly.io/old-fixture/", ...metrics(2, 20, 9) },
      { page: "https://buthonestly.io/older-fixture/", ...metrics(1, 10, 6) },
    ],
    pageQuery: [],
  });

  const { model } = generate(workspace);
  const [pair] = model.migration.pairs;

  assert.equal(
    model.pages.comparisons["/fixture-essay/"].impressions.current,
    90,
  );
  assert.equal(pair.oldPath, "/old-fixture/");
  assert.equal(pair.canonicalPath, "/fixture-essay/");
  assert.deepEqual(pair.current.old, {
    clicks: 2,
    impressions: 20,
    ctr: 0.1,
    position: 9,
    sourceUrls: ["https://buthonestly.io/old-fixture/"],
  });
  assert.equal(pair.current.canonical.impressions, 60);
  assert.equal(pair.current.combined.impressions, 80);
  assert.equal(pair.current.oldUrlShare, 0.25);
  assert.equal(pair.previous.old.impressions, 10);
  assert.equal(model.migration.pairs[1].current.canonical.impressions, 60);
  assert.equal(model.migration.overall.current.old.impressions, 30);
  assert.equal(model.migration.overall.current.canonical.impressions, 60);
  assert.equal(model.migration.overall.current.combined.impressions, 90);
  assert.deepEqual(model.migration.essayOutliers.current[0].oldPaths, [
    "/old-fixture/",
    "/older-fixture/",
  ]);
  assert.equal(model.migration.essayOutliers.current[0].oldImpressions, 30);
  assert.match(
    model.renderedMarkdown,
    /\/old-fixture\/.*\/fixture-essay\/.*20.*60.*25\.00%/s,
  );
});

test("keeps zero-impression redirect pairs and applies Essay outlier boundaries", async (testContext) => {
  await testContext.test("zero-impression pair", () => {
    const workspace = makeWorkspace(testContext);
    writeSnapshot(workspace, "2026-01", { pages: [], pageQuery: [] });
    writeSnapshot(workspace, "2026-02", { pages: [], pageQuery: [] });

    const { model } = generate(workspace);

    assert.equal(model.migration.pairs[0].current.oldUrlShare, null);
    assert.equal(model.migration.pairs[0].current.combined.position, null);
    assert.deepEqual(model.migration.essayOutliers.current, []);
    assert.equal(model.migration.manualClosure.eligible, false);
  });

  await testContext.test("inclusive outlier boundaries", () => {
    const workspace = makeWorkspace(testContext);
    writeSnapshot(workspace, "2026-01", { pages: [], pageQuery: [] });
    writeSnapshot(workspace, "2026-02", {
      pages: [
        { page: "https://buthonestly.io/fixture-essay/", ...metrics(1, 15, 4) },
        { page: "https://buthonestly.io/old-fixture/", ...metrics(1, 5, 8) },
      ],
      pageQuery: [],
    });

    const { model } = generate(workspace);
    const [outlier] = model.migration.essayOutliers.current;

    assert.equal(outlier.canonicalPath, "/fixture-essay/");
    assert.equal(outlier.pairedImpressions, 20);
    assert.equal(outlier.oldUrlShare, 0.25);
    assert.equal(
      model.migration.thresholds.essayOutlierOldUrlShareMinimumInclusive,
      0.25,
    );
    assert.equal(
      model.migration.thresholds.essayOutlierPairedImpressionsMinimumInclusive,
      20,
    );
  });

  await testContext.test("values below either outlier boundary", () => {
    const workspace = makeWorkspace(testContext);
    writeSnapshot(workspace, "2026-01", { pages: [], pageQuery: [] });
    writeSnapshot(workspace, "2026-02", {
      pages: [
        { page: "https://buthonestly.io/fixture-essay/", ...metrics(1, 15, 4) },
        { page: "https://buthonestly.io/old-fixture/", ...metrics(1, 4, 8) },
      ],
      pageQuery: [],
    });
    assert.deepEqual(
      generate(workspace).model.migration.essayOutliers.current,
      [],
    );

    writeSnapshot(workspace, "2026-02", {
      pages: [
        { page: "https://buthonestly.io/fixture-essay/", ...metrics(1, 19, 4) },
        { page: "https://buthonestly.io/old-fixture/", ...metrics(1, 6, 8) },
      ],
      pageQuery: [],
    });
    assert.deepEqual(
      generate(workspace).model.migration.essayOutliers.current,
      [],
    );
  });
});

test("requires both Final reporting months to qualify for manual migration closure", async (testContext) => {
  await testContext.test("both months qualify", () => {
    const workspace = makeWorkspace(testContext);
    for (const month of ["2026-01", "2026-02"]) {
      writeSnapshot(workspace, month, {
        pages: [
          {
            page: "https://buthonestly.io/fixture-essay/",
            ...metrics(5, 96, 4),
          },
          { page: "https://buthonestly.io/old-fixture/", ...metrics(1, 4, 8) },
        ],
        pageQuery: [],
      });
    }

    const { model } = generate(workspace);

    assert.equal(model.migration.overall.current.oldUrlShare, 0.04);
    assert.equal(model.migration.overall.previous.oldUrlShare, 0.04);
    assert.equal(model.migration.manualClosure.eligible, true);
    assert.equal(
      model.migration.manualClosure.closesTrackingAutomatically,
      false,
    );
    assert.equal(model.migration.manualClosure.urlInspectionRequired, true);
    assert.match(
      model.renderedMarkdown,
      /eligible for manual closure.*does not close migration tracking automatically.*URL Inspection is still required/s,
    );
  });

  await testContext.test(
    "an Essay outlier blocks an otherwise qualifying month",
    () => {
      const workspace = makeWorkspace(testContext);
      addRedirectedEssay(workspace);
      writeSnapshot(workspace, "2026-01", {
        pages: [
          {
            page: "https://buthonestly.io/fixture-essay/",
            ...metrics(1, 100, 4),
          },
          {
            page: "https://buthonestly.io/second-essay/",
            ...metrics(1, 100, 4),
          },
        ],
        pageQuery: [],
      });
      writeSnapshot(workspace, "2026-02", {
        pages: [
          {
            page: "https://buthonestly.io/fixture-essay/",
            ...metrics(1, 15, 4),
          },
          { page: "https://buthonestly.io/old-fixture/", ...metrics(1, 5, 8) },
          {
            page: "https://buthonestly.io/second-essay/",
            ...metrics(1, 100, 4),
          },
        ],
        pageQuery: [],
      });

      const { model } = generate(workspace);
      const [current] = model.migration.manualClosure.months;

      assert.equal(current.oldUrlShare < 0.05, true);
      assert.equal(current.overallShareQualifies, true);
      assert.equal(current.noQualifyingEssayOutlier, false);
      assert.equal(current.qualifies, false);
      assert.equal(model.migration.manualClosure.eligible, false);
    },
  );

  await testContext.test("only one month qualifies", () => {
    const workspace = makeWorkspace(testContext);
    writeSnapshot(workspace, "2026-01", {
      pages: [
        { page: "https://buthonestly.io/fixture-essay/", ...metrics(5, 96, 4) },
        { page: "https://buthonestly.io/old-fixture/", ...metrics(1, 4, 8) },
      ],
      pageQuery: [],
    });
    writeSnapshot(workspace, "2026-02", {
      pages: [
        { page: "https://buthonestly.io/fixture-essay/", ...metrics(5, 95, 4) },
        { page: "https://buthonestly.io/old-fixture/", ...metrics(1, 5, 8) },
      ],
      pageQuery: [],
    });

    const { model } = generate(workspace);

    assert.deepEqual(
      model.migration.manualClosure.months.map(({ qualifies }) => qualifies),
      [false, true],
    );
    assert.equal(model.migration.manualClosure.eligible, false);
    assert.match(model.renderedMarkdown, /not eligible for manual closure/);
  });
});

test("keeps page-only denominators separate from property totals", (testContext) => {
  const workspace = makeWorkspace(testContext);
  writeSnapshot(workspace, "2026-01", {
    totals: metrics(10, 100, 4),
    pages: [
      { page: "https://buthonestly.io/fixture-essay/", ...metrics(4, 40, 5) },
      { page: "https://buthonestly.io/", ...metrics(1, 10, 2) },
    ],
    pageQuery: [],
  });
  writeSnapshot(workspace, "2026-02", {
    totals: metrics(20, 200, 3),
    pages: [
      { page: "https://buthonestly.io/fixture-essay/", ...metrics(6, 60, 4) },
      { page: "https://buthonestly.io/", ...metrics(2, 20, 1) },
    ],
    pageQuery: [],
  });

  const { model } = generate(workspace);

  assert.deepEqual(model.propertyContext.pageOnlyTotals.clicks, {
    current: 8,
    previous: 5,
    absoluteChange: 3,
    relativeChange: 0.6,
  });
  assert.deepEqual(model.cohorts["Editorial-focus essay"].shares.clicks, {
    current: 0.75,
    previous: 0.8,
    currentDenominator: 8,
    previousDenominator: 5,
  });
  assert.deepEqual(model.propertyContext.pageReconciliation.clicks.current, {
    absolute: 12,
    percentage: 0.6,
  });
  assert.match(model.renderedMarkdown, /Page-only totals: 8 clicks.*5/s);
  assert.match(
    model.renderedMarkdown,
    /Editorial-focus essay.*75\.00%.*80\.00%/s,
  );
  assert.match(model.renderedMarkdown, /\/fixture-essay\/.*6.*4.*60.*40/s);
  assert.match(model.renderedMarkdown, /60\.00%.*50\.00%/s);
});

test("rejects unsafe or unresolved page URLs without heuristic repair", async (testContext) => {
  const pages = [
    "https://buthonestly.io/fixture-essay/?source=test",
    "https://www.buthonestly.io/fixture-essay/",
    "https://buthonestly.io:8443/fixture-essay/",
    "https://buthonestly.io/missing/",
    "https://buthonestly.io//fixture-essay/",
    "https://buthonestly.io/missing/../fixture-essay/",
    "https://buthonestly.io/resources/not-a-route/",
    "https://buthonestly.io/essays/99/",
    "https://buthonestly.io/section/not-a-section/",
  ];

  for (const page of pages) {
    await testContext.test(page, () => {
      const workspace = makeWorkspace(testContext);
      writeSnapshot(workspace, "2026-01", { pages: [], pageQuery: [] });
      writeSnapshot(workspace, "2026-02", {
        pages: [{ page, ...metrics(1, 10, 2) }],
        pageQuery: [],
      });

      assert.throws(() => generate(workspace), SearchReportError);
      assert.equal(existsSync(workspace.reportsDirectory), false);
    });
  }
});

test("rejects unclassified Published Essays and ambiguous redirects", async (testContext) => {
  const cases = [
    [
      "unclassified Published Essay",
      (workspace) =>
        updateConfiguration(workspace, (configuration) => ({
          ...configuration,
          essayCohorts: {},
        })),
    ],
    [
      "ambiguous redirects",
      (workspace) =>
        updateConfiguration(workspace, (configuration) => ({
          ...configuration,
          redirects: [
            ...configuration.redirects,
            { from: "/old-fixture", to: "/fixture-essay/" },
          ],
        })),
    ],
    [
      "canonical redirect source",
      (workspace) => {
        writeFileSync(
          workspace.redirectsPath,
          `${readFileSync(workspace.redirectsPath, "utf8")}/fixture-essay/ /about/ 301\n`,
        );
        updateConfiguration(workspace, (configuration) => ({
          ...configuration,
          redirects: [
            ...configuration.redirects,
            { from: "/fixture-essay/", to: "/about/" },
          ],
        }));
      },
    ],
    [
      "conflicting deployed redirect",
      (workspace) => {
        writeFileSync(
          workspace.redirectsPath,
          `${readFileSync(workspace.redirectsPath, "utf8")}/old-fixture/ /about/ 301\n`,
        );
      },
    ],
    [
      "redirect chain",
      (workspace) => {
        writeFileSync(
          workspace.redirectsPath,
          `${readFileSync(workspace.redirectsPath, "utf8")}/older-fixture/ /old-fixture/ 301\n`,
        );
        updateConfiguration(workspace, (configuration) => ({
          ...configuration,
          redirects: [
            ...configuration.redirects,
            { from: "/older-fixture/", to: "/old-fixture/" },
          ],
        }));
      },
    ],
  ];

  for (const [name, arrange] of cases) {
    await testContext.test(name, () => {
      const workspace = makeWorkspace(testContext);
      arrange(workspace);
      writeSnapshot(workspace, "2026-01");
      writeSnapshot(workspace, "2026-02");

      assert.throws(() => generate(workspace), SearchReportError);
      assert.equal(existsSync(workspace.reportsDirectory), false);
    });
  }
});

test("uses null relative changes and CTR values for zero denominators", (testContext) => {
  const workspace = makeWorkspace(testContext);
  writeSnapshot(workspace, "2026-01", {
    totals: metrics(0, 0, 0),
    pages: [],
    pageQuery: [],
  });
  writeSnapshot(workspace, "2026-02", {
    totals: metrics(0, 0, 0),
    pages: [],
    pageQuery: [],
  });

  const { model } = generate(workspace);

  assert.equal(model.propertyContext.clicks.relativeChange, null);
  assert.deepEqual(model.propertyContext.ctr, {
    current: null,
    previous: null,
    percentagePointChange: null,
  });
});

test("rejects missing, partial, malformed, and identity-mismatched snapshots", async (testContext) => {
  const cases = [
    ["missing previous", () => {}],
    [
      "partial",
      (workspace) => writeSnapshot(workspace, "2026-01", { status: "partial" }),
    ],
    [
      "property mismatch",
      (workspace) =>
        writeSnapshot(workspace, "2026-01", {
          property: "sc-domain:other.example",
        }),
    ],
    [
      "search type mismatch",
      (workspace) =>
        writeSnapshot(workspace, "2026-01", { searchType: "image" }),
    ],
    [
      "malformed row",
      (workspace) =>
        writeSnapshot(workspace, "2026-01", {
          pages: [
            {
              page: "https://buthonestly.io/",
              clicks: -1,
              impressions: 2,
              ctr: 0,
              position: 1,
            },
          ],
        }),
    ],
    [
      "inconsistent CTR",
      (workspace) =>
        writeSnapshot(workspace, "2026-01", {
          totals: { clicks: 2, impressions: 10, ctr: 0.1, position: 1 },
        }),
    ],
    [
      "partial interval",
      (workspace) => writeSnapshot(workspace, "2026-01", { end: "2026-01-30" }),
    ],
  ];

  for (const [name, arrange] of cases) {
    await testContext.test(name, () => {
      const workspace = makeWorkspace(testContext);
      arrange(workspace);
      writeSnapshot(workspace, "2026-02");
      assert.throws(() => generate(workspace), SearchReportError);
      assert.equal(existsSync(workspace.reportsDirectory), false);
    });
  }
});

test("future-Essay page and query rows become attributed anomalies", (testContext) => {
  const workspace = makeWorkspace(testContext);
  const essayPath = path.join(
    workspace.essaysDirectory,
    "fixture-essay",
    "fixture-essay.mdx",
  );
  writeFileSync(
    essayPath,
    readFileSync(essayPath, "utf8").replace(
      "date: 2025-01-01",
      "date: 2027-01-01",
    ),
  );
  writeSnapshot(workspace, "2026-01");
  writeSnapshot(workspace, "2026-02");

  const { model } = generate(workspace);

  assert.equal(model.queries.brand.clicks.current, 0);
  assert.equal(
    model.anomalies.some(
      ({ reportingMonth, dataset }) =>
        reportingMonth === "2026-02" && dataset === "pages",
    ),
    true,
  );
  assert.equal(
    model.anomalies.some(
      ({ reportingMonth, dataset }) =>
        reportingMonth === "2026-02" && dataset === "page-query",
    ),
    true,
  );
});

test("validation failure preserves both prior artifacts", (testContext) => {
  const workspace = makeWorkspace(testContext);
  writeSnapshot(workspace, "2026-01");
  writeSnapshot(workspace, "2026-02");
  const first = generate(workspace);
  const oldJson = readFileSync(first.jsonPath, "utf8");
  const oldMarkdown = readFileSync(first.markdownPath, "utf8");
  writeFileSync(
    path.join(
      workspace.snapshotsDirectory,
      "2026-02-01--2026-02-28",
      "pages.json",
    ),
    "not json",
  );

  assert.throws(() => generate(workspace), SearchReportError);
  assert.equal(readFileSync(first.jsonPath, "utf8"), oldJson);
  assert.equal(readFileSync(first.markdownPath, "utf8"), oldMarkdown);
});
