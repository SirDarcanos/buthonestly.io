import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEssayInventory } from "../src/lib/essay-inventory.mjs";

const REQUIRED_DATASETS = ["totals", "pages", "pageQuery"];
const DATASET_FILENAMES = {
  totals: "totals.json",
  pages: "pages.json",
  pageQuery: "page-query.json",
};
const COHORTS = [
  "Editorial-focus essay",
  "Legacy-tail essay",
  "Peripheral essay",
  "Resource",
  "Archive",
  "Site page",
];
const SITE_PATHS = new Set([
  "/",
  "/about/",
  "/artificial-intelligence-tools/",
  "/privacy/",
  "/terms-conditions/",
]);

export class SearchReportError extends Error {
  constructor(message) {
    super(message);
    this.name = "SearchReportError";
  }
}

const fail = (message) => {
  throw new SearchReportError(message);
};

const readJson = (filename) => {
  try {
    return JSON.parse(readFileSync(filename, "utf8"));
  } catch (error) {
    fail(`Cannot read valid JSON from ${filename}: ${error.message}`);
  }
};

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
};

const configurationHash = (configuration) =>
  createHash("sha256")
    .update(JSON.stringify(stableValue(configuration)))
    .digest("hex");

const monthInterval = (month) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    fail("--month must be an explicit calendar month in YYYY-MM format");
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, monthNumber, 0))
    .toISOString()
    .slice(0, 10);
  return { start: `${month}-01`, end };
};

const precedingMonth = (month) => {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 2, 1)).toISOString().slice(0, 7);
};

const validateMetric = (value, name, filename, index) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(`${filename} row ${index + 1} has invalid ${name}`);
  }
};

const validateRows = (dataset, rows, filename) => {
  if (!Array.isArray(rows)) fail(`${filename} must contain a rows array`);
  rows.forEach((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      fail(`${filename} row ${index + 1} is malformed`);
    }
    for (const metric of ["clicks", "impressions", "ctr", "position"]) {
      validateMetric(row[metric], metric, filename, index);
    }
    if (
      !Number.isInteger(row.clicks) ||
      !Number.isInteger(row.impressions) ||
      row.clicks > row.impressions
    ) {
      fail(`${filename} row ${index + 1} has impossible counts`);
    }
    const calculatedCtr =
      row.impressions === 0 ? 0 : row.clicks / row.impressions;
    if (Math.abs(row.ctr - calculatedCtr) > 1e-9) {
      fail(`${filename} row ${index + 1} has inconsistent ctr`);
    }
    if (["pages", "pageQuery"].includes(dataset)) {
      if (typeof row.page !== "string" || !row.page.trim()) {
        fail(`${filename} row ${index + 1} has invalid page`);
      }
    }
    if (
      dataset === "pageQuery" &&
      (typeof row.query !== "string" || !row.query.trim())
    ) {
      fail(`${filename} row ${index + 1} has invalid query`);
    }
  });
};

const loadSnapshot = (snapshotsDirectory, month) => {
  const interval = monthInterval(month);
  const directory = path.join(
    snapshotsDirectory,
    `${interval.start}--${interval.end}`,
  );
  if (!existsSync(directory)) {
    fail(`Missing exact Final reporting month snapshot for ${month}`);
  }
  const manifestPath = path.join(directory, "manifest.json");
  const manifest = readJson(manifestPath);
  if (
    manifest.status !== "final" ||
    manifest.firstIncompleteDate !== null ||
    manifest.requestedInterval?.start !== interval.start ||
    manifest.requestedInterval?.end !== interval.end ||
    manifest.effectiveInterval?.start !== interval.start ||
    manifest.effectiveInterval?.end !== interval.end
  ) {
    fail(`${month} is not an exact Final reporting month`);
  }
  if (!manifest.package?.name || !manifest.package?.version) {
    fail(`${manifestPath} has malformed package provenance`);
  }

  const datasets = {};
  for (const dataset of REQUIRED_DATASETS) {
    const provenance = manifest.datasets?.[dataset];
    if (
      !provenance ||
      provenance.filename !== DATASET_FILENAMES[dataset] ||
      !Number.isInteger(provenance.rowCount) ||
      provenance.rowCount < 0
    ) {
      fail(`${manifestPath} has malformed ${dataset} provenance`);
    }
    const filename = path.join(directory, provenance.filename);
    if (!existsSync(filename)) fail(`Missing required dataset ${filename}`);
    const parsed = readJson(filename);
    validateRows(dataset, parsed.rows, filename);
    if (parsed.rows.length !== provenance.rowCount) {
      fail(`${filename} row count does not match its manifest`);
    }
    datasets[dataset] = parsed.rows;
  }
  if (datasets.totals.length !== 1) {
    fail(
      `${path.join(directory, manifest.datasets.totals.filename)} must contain one row`,
    );
  }
  return { month, interval, directory, manifest, datasets };
};

const normalizePath = (value) => {
  let pathname = value;
  try {
    const url = new URL(value, "https://buthonestly.io");
    if (url.hostname.toLowerCase() !== "buthonestly.io") {
      fail(`Unfamiliar page host: ${url.hostname}`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      fail(`Unsupported page protocol: ${url.protocol}`);
    }
    if (url.search) fail(`Unresolved first-party page URL: ${value}`);
    pathname = url.pathname;
  } catch (error) {
    if (error instanceof SearchReportError) throw error;
    fail(`Malformed page URL: ${value}`);
  }
  pathname = pathname.replace(/\/{2,}/g, "/");
  if (!pathname.endsWith("/") && !path.extname(pathname)) pathname += "/";
  return pathname;
};

const redirectLines = (filename) => {
  const redirects = new Set();
  for (const line of readFileSync(filename, "utf8").split(/\r?\n/)) {
    const [from, to, status] = line.trim().split(/\s+/);
    if (!from || from.startsWith("#") || !to || status !== "301") continue;
    try {
      const target = new URL(to, "https://buthonestly.io");
      if (target.hostname !== "buthonestly.io") continue;
      redirects.add(
        `${normalizePath(from)}\t${normalizePath(target.toString())}`,
      );
    } catch {}
  }
  return redirects;
};

const normalizeQuery = (query) =>
  query
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/\bwww\./g, "")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const validateConfiguration = (configuration, inventory, redirectsPath) => {
  if (!Number.isInteger(configuration.version) || configuration.version < 1) {
    fail("Reporting configuration requires a positive integer version");
  }
  const configuredSlugs = Object.keys(configuration.essayCohorts ?? {}).sort();
  const inventorySlugs = inventory.essays.map(({ slug }) => slug).sort();
  if (JSON.stringify(configuredSlugs) !== JSON.stringify(inventorySlugs)) {
    fail(
      "Reporting configuration must classify every and only inventoried Essay",
    );
  }
  for (const [slug, cohort] of Object.entries(configuration.essayCohorts)) {
    if (!COHORTS.slice(0, 3).includes(cohort)) {
      fail(`Essay ${slug} has invalid Page cohort ${cohort}`);
    }
  }

  const aliases = new Map();
  const addAlias = (value, rule) => {
    const normalized = normalizeQuery(value);
    if (!normalized) fail(`Brand-query rule ${rule} has an empty value`);
    const existing = aliases.get(normalized);
    if (existing && existing !== rule) {
      fail(`Ambiguous Brand-query value: ${value}`);
    }
    aliases.set(normalized, rule);
  };
  if (!Array.isArray(configuration.brandQueries)) {
    fail("Reporting configuration requires Brand-query rules");
  }
  for (const entry of configuration.brandQueries) {
    if (!entry?.rule) fail("Brand-query rule requires a name");
    for (const value of entry.values ?? []) addAlias(value, entry.rule);
    for (const slug of entry.essays ?? []) {
      const essay = inventory.get(slug);
      if (!essay) fail(`Brand-query rule refers to unknown Essay ${slug}`);
      addAlias(essay.slug, entry.rule);
      addAlias(essay.title, entry.rule);
    }
  }

  if (!Array.isArray(configuration.redirects)) {
    fail("Reporting configuration requires explicit redirect mappings");
  }
  const redirects = new Map();
  const targets = new Set(inventory.essays.map(({ pathname }) => pathname));
  const deployedRedirects = redirectLines(redirectsPath);
  for (const redirect of configuration.redirects) {
    const from = normalizePath(redirect.from);
    const to = normalizePath(redirect.to);
    if (from === to || redirects.has(from)) {
      fail(`Invalid or ambiguous redirect mapping from ${from}`);
    }
    if (
      !targets.has(to) &&
      !SITE_PATHS.has(to) &&
      !/^\/(section|topic)\//.test(to)
    ) {
      fail(`Redirect target is not a known canonical route: ${to}`);
    }
    if (!deployedRedirects.has(`${from}\t${to}`)) {
      fail(
        `Configured redirect is absent from ${redirectsPath}: ${redirect.from}`,
      );
    }
    redirects.set(from, to);
  }
  return { aliases, redirects };
};

const emptyAggregate = () => ({
  clicks: 0,
  impressions: 0,
  positionNumerator: 0,
  sourceUrls: new Set(),
});

const addMetrics = (aggregate, row, sourceUrl) => {
  aggregate.clicks += row.clicks;
  aggregate.impressions += row.impressions;
  aggregate.positionNumerator += row.position * row.impressions;
  if (sourceUrl) aggregate.sourceUrls.add(sourceUrl);
};

const finishAggregate = (aggregate) => ({
  clicks: aggregate.clicks,
  impressions: aggregate.impressions,
  ctr:
    aggregate.impressions === 0
      ? null
      : aggregate.clicks / aggregate.impressions,
  position:
    aggregate.impressions === 0
      ? null
      : aggregate.positionNumerator / aggregate.impressions,
  ...(aggregate.sourceUrls.size
    ? { sourceUrls: [...aggregate.sourceUrls].sort() }
    : {}),
});

const classifyPath = (pathname, essayByPath) => {
  const essay = essayByPath.get(pathname);
  if (essay) return { cohort: essay.cohort, essay };
  if (pathname === "/resources/" || pathname.startsWith("/resources/")) {
    return { cohort: "Resource" };
  }
  if (
    pathname === "/essays/" ||
    pathname === "/section/" ||
    pathname.startsWith("/section/") ||
    pathname === "/topic/" ||
    pathname.startsWith("/topic/")
  ) {
    return { cohort: "Archive" };
  }
  if (SITE_PATHS.has(pathname)) return { cohort: "Site page" };
  fail(`Unresolved first-party page URL: ${pathname}`);
};

const aggregateSnapshot = (
  snapshot,
  inventory,
  configuration,
  validatedConfiguration,
) => {
  const monthEnd = new Date(`${snapshot.interval.end}T23:59:59.999Z`);
  const essayByPath = new Map(
    inventory.essays.map((essay) => [
      essay.pathname,
      { ...essay, cohort: configuration.essayCohorts[essay.slug] },
    ]),
  );
  const pages = new Map();
  const cohorts = new Map(COHORTS.map((cohort) => [cohort, emptyAggregate()]));
  const anomalies = [];
  for (const row of snapshot.datasets.pages) {
    const sourcePath = normalizePath(row.page);
    const canonicalPath =
      validatedConfiguration.redirects.get(sourcePath) ?? sourcePath;
    const classification = classifyPath(canonicalPath, essayByPath);
    if (classification.essay?.publishedAt > monthEnd) {
      anomalies.push({
        type: "early-exposure",
        reportingMonth: snapshot.month,
        dataset: "pages",
        page: canonicalPath,
        sourceUrl: row.page,
        clicks: row.clicks,
        impressions: row.impressions,
      });
      continue;
    }
    if (!pages.has(canonicalPath)) pages.set(canonicalPath, emptyAggregate());
    addMetrics(pages.get(canonicalPath), row, row.page);
    addMetrics(cohorts.get(classification.cohort), row);
  }

  const brandQueries = new Map();
  const generic = emptyAggregate();
  const brand = emptyAggregate();
  for (const row of snapshot.datasets.pageQuery) {
    const sourcePath = normalizePath(row.page);
    const canonicalPath =
      validatedConfiguration.redirects.get(sourcePath) ?? sourcePath;
    const classification = classifyPath(canonicalPath, essayByPath);
    if (classification.essay?.publishedAt > monthEnd) {
      anomalies.push({
        type: "early-exposure",
        reportingMonth: snapshot.month,
        dataset: "page-query",
        page: canonicalPath,
        sourceUrl: row.page,
        query: row.query,
        clicks: row.clicks,
        impressions: row.impressions,
      });
      continue;
    }
    const normalized = normalizeQuery(row.query);
    const rule = validatedConfiguration.aliases.get(normalized);
    if (!rule) {
      addMetrics(generic, row);
      continue;
    }
    addMetrics(brand, row);
    if (!brandQueries.has(normalized)) {
      brandQueries.set(normalized, {
        aggregate: emptyAggregate(),
        rawVariants: new Set(),
        rule,
      });
    }
    const query = brandQueries.get(normalized);
    addMetrics(query.aggregate, row);
    query.rawVariants.add(row.query);
  }

  return {
    property: finishAggregate({
      ...emptyAggregate(),
      clicks: snapshot.datasets.totals[0].clicks,
      impressions: snapshot.datasets.totals[0].impressions,
      positionNumerator:
        snapshot.datasets.totals[0].position *
        snapshot.datasets.totals[0].impressions,
    }),
    pages: Object.fromEntries(
      [...pages.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([pathname, aggregate]) => [pathname, finishAggregate(aggregate)]),
    ),
    cohorts: Object.fromEntries(
      [...cohorts.entries()].map(([cohort, aggregate]) => [
        cohort,
        finishAggregate(aggregate),
      ]),
    ),
    queries: {
      brand: finishAggregate(brand),
      generic: finishAggregate(generic),
      normalizedQueries: [...brandQueries.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([query, value]) => ({
          query,
          rawVariants: [...value.rawVariants].sort(),
          matchedRule: value.rule,
          ...finishAggregate(value.aggregate),
        })),
    },
    anomalies,
  };
};

const relativeChange = (current, previous) =>
  previous === 0 ? null : (current - previous) / previous;

const compare = (current, previous) => ({
  current,
  previous,
  absoluteChange: current - previous,
  relativeChange: relativeChange(current, previous),
});

const compareCtr = (current, previous) => ({
  current,
  previous,
  percentagePointChange:
    current === null || previous === null ? null : current - previous,
});

const compareMetrics = (current, previous) => ({
  clicks: compare(current.clicks, previous.clicks),
  impressions: compare(current.impressions, previous.impressions),
  ctr: compareCtr(current.ctr, previous.ctr),
});

const inputProvenance = (snapshot, root) => ({
  path: path.relative(root, snapshot.directory),
  interval: snapshot.interval,
  status: snapshot.manifest.status,
  property: snapshot.manifest.property,
  searchType: snapshot.manifest.searchType,
  pulledAt: snapshot.manifest.pulledAt,
  package: {
    name: snapshot.manifest.package.name,
    version: snapshot.manifest.package.version,
  },
  datasets: Object.fromEntries(
    REQUIRED_DATASETS.map((dataset) => [
      dataset,
      {
        path: path.relative(
          root,
          path.join(
            snapshot.directory,
            snapshot.manifest.datasets[dataset].filename,
          ),
        ),
        rowCount: snapshot.manifest.datasets[dataset].rowCount,
      },
    ]),
  ),
});

const fmtNumber = (value) => value.toLocaleString("en-US");
const fmtPercent = (value) =>
  value === null ? "n/a" : `${(value * 100).toFixed(2)}%`;
const fmtChange = (value) => `${value >= 0 ? "+" : ""}${fmtNumber(value)}`;

const renderMarkdown = (model) => {
  const property = model.propertyContext;
  const editorial = model.primaryMeasurements.editorialFocus;
  const brand = model.primaryMeasurements.disclosedBrandQueries;
  const lines = [
    `# Search Console aggregate report: ${model.reportingMonth.current}`,
    "",
    "## Provenance and data quality",
    "",
    `Generated ${model.generatedAt} from Final reporting months ${model.reportingMonth.previous} and ${model.reportingMonth.current}.`,
    `Configuration v${model.configuration.version}: \`${model.configuration.hash}\``,
    "",
    "## Primary measurements",
    "",
    `- Editorial-focus essays: ${fmtNumber(editorial.clicks.current)} clicks (${fmtChange(editorial.clicks.absoluteChange)}), ${fmtNumber(editorial.impressions.current)} impressions (${fmtChange(editorial.impressions.absoluteChange)}), ${fmtPercent(editorial.ctr.current)} CTR.`,
    `- Disclosed Brand queries: ${fmtNumber(brand.clicks.current)} clicks (${fmtChange(brand.clicks.absoluteChange)}), ${fmtNumber(brand.impressions.current)} impressions (${fmtChange(brand.impressions.absoluteChange)}).`,
    "",
    "## Property context and page reconciliation",
    "",
    `Property totals: ${fmtNumber(property.clicks.current)} clicks, previously ${fmtNumber(property.clicks.previous)} (${fmtChange(property.clicks.absoluteChange)}); ${fmtNumber(property.impressions.current)} impressions, previously ${fmtNumber(property.impressions.previous)} (${fmtChange(property.impressions.absoluteChange)}). CTR is ${fmtPercent(property.ctr.current)} (${property.ctr.percentagePointChange === null ? "n/a" : `${(property.ctr.percentagePointChange * 100).toFixed(2)} percentage points`}).`,
    `Page-only gap: ${fmtNumber(property.pageReconciliation.clicks.current.absolute)} clicks and ${fmtNumber(property.pageReconciliation.impressions.current.absolute)} impressions.`,
    "",
    "## Page-cohort comparison",
    "",
    "| Page cohort | Clicks | Previous | Impressions | Previous | CTR |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const cohort of COHORTS) {
    const value = model.cohorts[cohort];
    lines.push(
      `| ${cohort} | ${fmtNumber(value.clicks.current)} | ${fmtNumber(value.clicks.previous)} | ${fmtNumber(value.impressions.current)} | ${fmtNumber(value.impressions.previous)} | ${fmtPercent(value.ctr.current)} |`,
    );
  }
  lines.push(
    "",
    "## Migration consolidation",
    "",
    `${model.migration.configuredRedirectCount} explicit redirect mappings were applied.`,
    "",
    "## Search review candidates",
    "",
    "Search review candidates are outside schema version 1's first runnable slice.",
    "",
    "## Disclosed Brand and generic query analysis",
    "",
    `Brand: ${fmtNumber(brand.clicks.current)} clicks from ${model.queries.brand.normalizedQueries.length} normalized queries. Generic disclosed subset: ${fmtNumber(model.queries.generic.clicks.current)} clicks and ${fmtNumber(model.queries.generic.impressions.current)} impressions.`,
    "",
    "## Anomalies and methodological notes",
    "",
    ...(model.anomalies.length
      ? model.anomalies.map((anomaly) => `- ${anomaly.type}: ${anomaly.page}`)
      : ["- No early-exposure anomalies."]),
    "- Query measurements describe only the disclosed page-query subset.",
    "- Relative changes are null when the previous value is zero.",
    "",
  );
  return lines.join("\n");
};

const reconciliation = (property, pageTotal) => {
  const absolute = property - pageTotal;
  return {
    absolute,
    percentage: property === 0 ? null : absolute / property,
  };
};

const publishArtifacts = (directory, model, markdown) => {
  const parent = path.dirname(directory);
  const reportName = path.basename(directory);
  const identifier = randomUUID();
  const versionName = `.${reportName}-${identifier}`;
  const versionDirectory = path.join(parent, versionName);
  const temporaryLink = path.join(parent, `.${reportName}-link-${identifier}`);
  mkdirSync(parent, { recursive: true });
  mkdirSync(versionDirectory);
  let previousVersion;
  let published = false;
  try {
    writeFileSync(
      path.join(versionDirectory, "aggregate.json"),
      `${JSON.stringify(model, null, 2)}\n`,
    );
    writeFileSync(path.join(versionDirectory, "report.md"), markdown);
    symlinkSync(versionName, temporaryLink, "dir");
    if (existsSync(directory)) {
      if (!lstatSync(directory).isSymbolicLink()) {
        fail(`Cannot atomically replace non-symbolic report path ${directory}`);
      }
      previousVersion = readlinkSync(directory);
    }
    renameSync(temporaryLink, directory);
    published = true;
  } catch (error) {
    if (!published) {
      rmSync(temporaryLink, { force: true });
      rmSync(versionDirectory, { recursive: true, force: true });
    }
    if (error instanceof SearchReportError) throw error;
    fail(`Could not atomically publish report artifacts: ${error.message}`);
  }
  if (previousVersion?.startsWith(`.${reportName}-`)) {
    try {
      rmSync(path.join(parent, previousVersion), {
        recursive: true,
        force: true,
      });
    } catch {}
  }
};

export function generateSearchReport({
  month,
  generatedAt = new Date(),
  snapshotsDirectory = ".pi/search-console",
  reportsDirectory = path.join(snapshotsDirectory, "reports"),
  configurationPath = "config/search-console-reporting.json",
  essaysDirectory = "src/content/essays",
  redirectsPath = "public/_redirects",
  root = process.cwd(),
} = {}) {
  monthInterval(month);
  const previousMonth = precedingMonth(month);
  const current = loadSnapshot(snapshotsDirectory, month);
  const previous = loadSnapshot(snapshotsDirectory, previousMonth);
  if (
    current.interval.start <= previous.interval.end &&
    previous.interval.start <= current.interval.end
  ) {
    fail("Final reporting month snapshots overlap");
  }

  const configuration = readJson(configurationPath);
  const inventory = loadEssayInventory({ essaysDirectory });
  const validatedConfiguration = validateConfiguration(
    configuration,
    inventory,
    redirectsPath,
  );
  for (const snapshot of [current, previous]) {
    if (snapshot.manifest.property !== configuration.property) {
      fail(`${snapshot.month} snapshot property does not match configuration`);
    }
    if (snapshot.manifest.searchType !== configuration.searchType) {
      fail(
        `${snapshot.month} snapshot search type does not match configuration`,
      );
    }
  }
  if (
    current.manifest.property !== previous.manifest.property ||
    current.manifest.searchType !== previous.manifest.searchType
  ) {
    fail("Compared snapshots have mismatched identities");
  }

  const currentData = aggregateSnapshot(
    current,
    inventory,
    configuration,
    validatedConfiguration,
  );
  const previousData = aggregateSnapshot(
    previous,
    inventory,
    configuration,
    validatedConfiguration,
  );
  const pageTotals = (data) =>
    Object.values(data.cohorts).reduce(
      (total, cohort) => ({
        clicks: total.clicks + cohort.clicks,
        impressions: total.impressions + cohort.impressions,
      }),
      { clicks: 0, impressions: 0 },
    );
  const currentPageTotals = pageTotals(currentData);
  const previousPageTotals = pageTotals(previousData);
  const cohorts = Object.fromEntries(
    COHORTS.map((cohort) => [
      cohort,
      {
        ...compareMetrics(
          currentData.cohorts[cohort],
          previousData.cohorts[cohort],
        ),
        shares: {
          clicks: {
            current:
              currentPageTotals.clicks === 0
                ? null
                : currentData.cohorts[cohort].clicks / currentPageTotals.clicks,
            previous:
              previousPageTotals.clicks === 0
                ? null
                : previousData.cohorts[cohort].clicks /
                  previousPageTotals.clicks,
            currentDenominator: currentPageTotals.clicks,
            previousDenominator: previousPageTotals.clicks,
          },
          impressions: {
            current:
              currentPageTotals.impressions === 0
                ? null
                : currentData.cohorts[cohort].impressions /
                  currentPageTotals.impressions,
            previous:
              previousPageTotals.impressions === 0
                ? null
                : previousData.cohorts[cohort].impressions /
                  previousPageTotals.impressions,
            currentDenominator: currentPageTotals.impressions,
            previousDenominator: previousPageTotals.impressions,
          },
        },
      },
    ]),
  );

  const propertyContext = {
    ...compareMetrics(currentData.property, previousData.property),
    pageReconciliation: {
      clicks: {
        current: reconciliation(
          currentData.property.clicks,
          currentPageTotals.clicks,
        ),
        previous: reconciliation(
          previousData.property.clicks,
          previousPageTotals.clicks,
        ),
      },
      impressions: {
        current: reconciliation(
          currentData.property.impressions,
          currentPageTotals.impressions,
        ),
        previous: reconciliation(
          previousData.property.impressions,
          previousPageTotals.impressions,
        ),
      },
    },
  };
  const brandComparison = compareMetrics(
    currentData.queries.brand,
    previousData.queries.brand,
  );
  const model = {
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    reportingMonth: { current: month, previous: previousMonth },
    inputs: {
      current: inputProvenance(current, root),
      previous: inputProvenance(previous, root),
    },
    configuration: {
      path: path.relative(root, configurationPath),
      version: configuration.version,
      hash: configurationHash(configuration),
      essayCohortCount: Object.keys(configuration.essayCohorts).length,
      brandRuleCount: configuration.brandQueries.length,
      redirectCount: configuration.redirects.length,
    },
    dataQuality: {
      currentStatus: current.manifest.status,
      previousStatus: previous.manifest.status,
      queryRowsAreDisclosedSubset: true,
    },
    primaryMeasurements: {
      editorialFocus: cohorts["Editorial-focus essay"],
      disclosedBrandQueries: brandComparison,
    },
    propertyContext,
    cohorts,
    pages: {
      current: currentData.pages,
      previous: previousData.pages,
    },
    migration: {
      configuredRedirectCount: configuration.redirects.length,
    },
    queries: {
      brand: {
        ...brandComparison,
        normalizedQueries: currentData.queries.normalizedQueries,
        previousNormalizedQueries: previousData.queries.normalizedQueries,
      },
      generic: compareMetrics(
        currentData.queries.generic,
        previousData.queries.generic,
      ),
    },
    candidates: [],
    anomalies: [...previousData.anomalies, ...currentData.anomalies],
  };
  const markdown = renderMarkdown(model);
  model.renderedMarkdown = markdown;
  const outputDirectory = path.join(reportsDirectory, month);
  publishArtifacts(outputDirectory, model, markdown);
  return {
    model,
    jsonPath: path.join(outputDirectory, "aggregate.json"),
    markdownPath: path.join(outputDirectory, "report.md"),
  };
}

const parseArguments = (arguments_) => {
  if (
    arguments_.length !== 2 ||
    arguments_[0] !== "--month" ||
    !arguments_[1]
  ) {
    fail("Usage: npm run search-report -- --month YYYY-MM");
  }
  return arguments_[1];
};

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const month = parseArguments(process.argv.slice(2));
    const result = generateSearchReport({ month });
    process.stdout.write(
      `Wrote ${result.jsonPath} and ${result.markdownPath}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
