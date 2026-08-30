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

const generate = (workspace, overrides = {}) =>
  generateSearchReport({
    month: "2026-02",
    generatedAt: new Date("2026-03-20T10:00:00.000Z"),
    ...workspace,
    ...overrides,
  });

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
  assert.equal(brandValues.includes("nico mustone"), true);
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
