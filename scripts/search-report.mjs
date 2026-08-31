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
import {
  collectCruxFieldData,
  createCruxPort,
} from "../src/lib/crux-field-data.mjs";

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
const RESOURCE_PATHS = new Set([
  "/resources/",
  "/resources/free-ai-voice-generator/",
]);
const MIGRATION_THRESHOLDS = {
  overallOldUrlShareMaximumExclusive: 0.05,
  essayOutlierOldUrlShareMinimumInclusive: 0.25,
  essayOutlierPairedImpressionsMinimumInclusive: 20,
};
const CANDIDATE_COHORTS = [
  "Editorial-focus essay",
  "Resource",
  "Archive",
  "Site page",
];
const CANDIDATE_THRESHOLDS = {
  visibility: {
    minimumImpressions: 50,
    minimumPositionInclusive: 8,
    maximumPositionInclusive: 30,
  },
  clickThrough: {
    minimumImpressions: 50,
    minimumPositionInclusive: 1,
    maximumPositionInclusive: 10,
    clicks: 0,
  },
  disclosedQuery: {
    minimumImpressions: 10,
    minimumPositionInclusive: 4,
    maximumPositionInclusive: 30,
  },
};

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

const parsePath = (value) => {
  let pathname = value;
  try {
    const absolute = value.match(/^[a-z][a-z\d+.-]*:\/\/[^/?#]*([^?#]*)/i);
    const rawPathname = absolute ? absolute[1] || "/" : value.split(/[?#]/)[0];
    const url = new URL(value, "https://buthonestly.io");
    if (url.hostname !== "buthonestly.io") {
      fail(`Unfamiliar page host: ${url.hostname}`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      fail(`Unsupported page protocol: ${url.protocol}`);
    }
    if (url.port || url.username || url.password) {
      fail(`Unresolved first-party page URL: ${value}`);
    }
    if (url.search || url.pathname !== rawPathname) {
      fail(`Unresolved first-party page URL: ${value}`);
    }
    pathname = url.pathname;
  } catch (error) {
    if (error instanceof SearchReportError) throw error;
    fail(`Malformed page URL: ${value}`);
  }
  return pathname;
};

const normalizeConfiguredPath = (value) => {
  const pathname = parsePath(value);
  return !pathname.endsWith("/") && !path.extname(pathname)
    ? `${pathname}/`
    : pathname;
};

const redirectLines = (filename) => {
  const redirects = new Map();
  for (const line of readFileSync(filename, "utf8").split(/\r?\n/)) {
    const [from, to, status] = line.trim().split(/\s+/);
    if (!from || from.startsWith("#") || !to || status !== "301") continue;
    try {
      const target = new URL(to, "https://buthonestly.io");
      if (target.hostname !== "buthonestly.io") continue;
      const sourcePath = normalizeConfiguredPath(from);
      const targetPath = normalizeConfiguredPath(target.toString());
      const existingTarget = redirects.get(sourcePath);
      if (existingTarget && existingTarget !== targetPath) {
        fail(`Conflicting deployed redirect mapping from ${sourcePath}`);
      }
      redirects.set(sourcePath, targetPath);
    } catch (error) {
      if (error instanceof SearchReportError) throw error;
    }
  }
  return redirects;
};

const normalizeQuery = (query) =>
  query
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/\bwww\./g, "")
    .replace(/[\p{P}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const addPaginatedRoutes = (routes, base, itemCount, pageSize) => {
  routes.set(base, "Archive");
  for (
    let pageNumber = 2;
    pageNumber <= Math.ceil(itemCount / pageSize);
    pageNumber++
  ) {
    routes.set(`${base}${pageNumber}/`, "Archive");
  }
};

const buildCanonicalRoutes = (inventory, essayCohorts) => {
  const routes = new Map();
  for (const pathname of SITE_PATHS) routes.set(pathname, "Site page");
  for (const pathname of RESOURCE_PATHS) routes.set(pathname, "Resource");
  for (const essay of inventory.essays) {
    routes.set(essay.pathname, essayCohorts[essay.slug]);
  }

  addPaginatedRoutes(routes, "/essays/", inventory.essays.length, 12);
  routes.set("/section/", "Archive");
  routes.set("/topic/", "Archive");

  const categories = new Map();
  const tags = new Map();
  for (const essay of inventory.essays) {
    for (const category of essay.categories) {
      if (!categories.has(category.slug)) categories.set(category.slug, []);
      if (!essay.sticky) categories.get(category.slug).push(essay);
    }
    for (const tag of essay.tags) {
      if (!tags.has(tag.slug)) tags.set(tag.slug, []);
      tags.get(tag.slug).push(essay);
    }
  }
  for (const [slug, essays] of categories) {
    addPaginatedRoutes(routes, `/section/${slug}/`, essays.length, 8);
  }
  for (const [slug, essays] of tags) {
    addPaginatedRoutes(routes, `/topic/${slug}/`, essays.length, 8);
  }
  return routes;
};

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
  const canonicalRoutes = buildCanonicalRoutes(
    inventory,
    configuration.essayCohorts,
  );
  const redirects = new Map();
  const deployedRedirects = redirectLines(redirectsPath);
  for (const redirect of configuration.redirects) {
    const from = normalizeConfiguredPath(redirect.from);
    const to = normalizeConfiguredPath(redirect.to);
    if (from === to || redirects.has(from) || canonicalRoutes.has(from)) {
      fail(`Invalid or ambiguous redirect mapping from ${from}`);
    }
    if (!canonicalRoutes.has(to)) {
      fail(`Redirect target is not a known canonical route: ${to}`);
    }
    if (deployedRedirects.get(from) !== to) {
      fail(
        `Configured redirect is absent from ${redirectsPath}: ${redirect.from}`,
      );
    }
    redirects.set(from, to);
  }
  for (const [from, to] of redirects) {
    if (redirects.has(to)) {
      fail(`Invalid redirect chain from ${from} through ${to}`);
    }
  }
  return { aliases, redirects, canonicalRoutes };
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

const sourcePath = (value, canonicalRoutes, redirects) => {
  const pathname = parsePath(value);
  if (canonicalRoutes.has(pathname) || redirects.has(pathname)) return pathname;
  if (!pathname.endsWith("/") && !path.extname(pathname)) {
    const trailingSlashVariant = `${pathname}/`;
    if (
      canonicalRoutes.has(trailingSlashVariant) ||
      redirects.has(trailingSlashVariant)
    ) {
      return trailingSlashVariant;
    }
  }
  return pathname;
};

const classifyPath = (pathname, essayByPath, canonicalRoutes) => {
  const cohort = canonicalRoutes.get(pathname);
  if (!cohort) fail(`Unresolved first-party page URL: ${pathname}`);
  return { cohort, essay: essayByPath.get(pathname) };
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
  const pageCohorts = new Map();
  const cohorts = new Map(COHORTS.map((cohort) => [cohort, emptyAggregate()]));
  const migrationSources = new Map(
    [
      ...validatedConfiguration.redirects.keys(),
      ...validatedConfiguration.redirects.values(),
    ].map((pathname) => [pathname, emptyAggregate()]),
  );
  const anomalies = [];
  for (const row of snapshot.datasets.pages) {
    const resolvedSourcePath = sourcePath(
      row.page,
      validatedConfiguration.canonicalRoutes,
      validatedConfiguration.redirects,
    );
    const canonicalPath =
      validatedConfiguration.redirects.get(resolvedSourcePath) ??
      resolvedSourcePath;
    const classification = classifyPath(
      canonicalPath,
      essayByPath,
      validatedConfiguration.canonicalRoutes,
    );
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
    pageCohorts.set(canonicalPath, classification.cohort);
    addMetrics(pages.get(canonicalPath), row, row.page);
    addMetrics(cohorts.get(classification.cohort), row);
    if (migrationSources.has(resolvedSourcePath)) {
      addMetrics(migrationSources.get(resolvedSourcePath), row, row.page);
    }
  }

  const brandQueries = new Map();
  const genericQueries = new Map();
  const genericPageQueries = new Map();
  const generic = emptyAggregate();
  const brand = emptyAggregate();
  const addQuery = (queries, normalized, row, rule) => {
    if (!queries.has(normalized)) {
      queries.set(normalized, {
        aggregate: emptyAggregate(),
        rawVariants: new Set(),
        ...(rule ? { rule } : {}),
      });
    }
    const query = queries.get(normalized);
    addMetrics(query.aggregate, row);
    query.rawVariants.add(row.query);
  };
  for (const row of snapshot.datasets.pageQuery) {
    const resolvedSourcePath = sourcePath(
      row.page,
      validatedConfiguration.canonicalRoutes,
      validatedConfiguration.redirects,
    );
    const canonicalPath =
      validatedConfiguration.redirects.get(resolvedSourcePath) ??
      resolvedSourcePath;
    const classification = classifyPath(
      canonicalPath,
      essayByPath,
      validatedConfiguration.canonicalRoutes,
    );
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
      addQuery(genericQueries, normalized, row);
      const pageQueryKey = `${canonicalPath}\0${normalized}`;
      if (!genericPageQueries.has(pageQueryKey)) {
        genericPageQueries.set(pageQueryKey, {
          page: canonicalPath,
          cohort: classification.cohort,
          query: normalized,
          rawVariants: new Set(),
          aggregate: emptyAggregate(),
        });
      }
      const pageQuery = genericPageQueries.get(pageQueryKey);
      addMetrics(pageQuery.aggregate, row);
      pageQuery.rawVariants.add(row.query);
      continue;
    }
    addMetrics(brand, row);
    addQuery(brandQueries, normalized, row, rule);
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
        .map(([pathname, aggregate]) => [
          pathname,
          {
            cohort: pageCohorts.get(pathname),
            ...finishAggregate(aggregate),
          },
        ]),
    ),
    cohorts: Object.fromEntries(
      [...cohorts.entries()].map(([cohort, aggregate]) => [
        cohort,
        finishAggregate(aggregate),
      ]),
    ),
    migrationSources: Object.fromEntries(
      [...migrationSources.entries()].map(([pathname, aggregate]) => [
        pathname,
        finishAggregate(aggregate),
      ]),
    ),
    queries: {
      brand: finishAggregate(brand),
      generic: finishAggregate(generic),
      brandNormalizedQueries: [...brandQueries.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([query, value]) => ({
          query,
          rawVariants: [...value.rawVariants].sort(),
          matchedRule: value.rule,
          ...finishAggregate(value.aggregate),
        })),
      genericNormalizedQueries: [...genericQueries.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([query, value]) => ({
          query,
          rawVariants: [...value.rawVariants].sort(),
          ...finishAggregate(value.aggregate),
        })),
      genericPageQueries: [...genericPageQueries.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => ({
          key,
          page: value.page,
          cohort: value.cohort,
          query: value.query,
          rawVariants: [...value.rawVariants].sort(),
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

const comparePosition = (current, previous) => ({
  current,
  previous,
  absoluteChange:
    current === null || previous === null ? null : current - previous,
});

const compareQueryMetrics = (current, previous) => ({
  ...compareMetrics(current, previous),
  position: comparePosition(current.position, previous.position),
});

const queryCoverage = (
  current,
  previous,
  currentDenominator,
  previousDenominator,
) => ({
  current: currentDenominator === 0 ? null : current / currentDenominator,
  previous: previousDenominator === 0 ? null : previous / previousDenominator,
  currentNumerator: current,
  currentDenominator,
  previousNumerator: previous,
  previousDenominator,
});

const combineAggregates = (...aggregates) => {
  const combined = emptyAggregate();
  for (const aggregate of aggregates) {
    combined.clicks += aggregate.clicks;
    combined.impressions += aggregate.impressions;
    combined.positionNumerator +=
      (aggregate.position ?? 0) * aggregate.impressions;
    for (const sourceUrl of aggregate.sourceUrls ?? []) {
      combined.sourceUrls.add(sourceUrl);
    }
  }
  return finishAggregate(combined);
};

const redirectPairMeasurement = (old, canonical) => {
  const combined = combineAggregates(old, canonical);
  return {
    old,
    canonical,
    combined,
    oldUrlShare:
      combined.impressions === 0
        ? null
        : old.impressions / combined.impressions,
  };
};

const migrationPeriod = (data, redirects, canonicalRoutes) => {
  const oldPaths = [...redirects.keys()];
  const canonicalPaths = [...new Set(redirects.values())];
  const old = combineAggregates(
    ...oldPaths.map((pathname) => data.migrationSources[pathname]),
  );
  const canonical = combineAggregates(
    ...canonicalPaths.map((pathname) => data.migrationSources[pathname]),
  );
  const overall = redirectPairMeasurement(old, canonical);
  const oldPathsByCanonical = new Map();
  for (const [oldPath, canonicalPath] of redirects) {
    const paths = oldPathsByCanonical.get(canonicalPath) ?? [];
    paths.push(oldPath);
    oldPathsByCanonical.set(canonicalPath, paths);
  }
  const essayOutliers = [];
  for (const [canonicalPath, pairedOldPaths] of oldPathsByCanonical) {
    const cohort = canonicalRoutes.get(canonicalPath);
    if (!COHORTS.slice(0, 3).includes(cohort)) continue;
    const measurement = redirectPairMeasurement(
      combineAggregates(
        ...pairedOldPaths.map((pathname) => data.migrationSources[pathname]),
      ),
      data.migrationSources[canonicalPath],
    );
    if (
      measurement.combined.impressions >=
        MIGRATION_THRESHOLDS.essayOutlierPairedImpressionsMinimumInclusive &&
      measurement.oldUrlShare >=
        MIGRATION_THRESHOLDS.essayOutlierOldUrlShareMinimumInclusive
    ) {
      essayOutliers.push({
        canonicalPath,
        cohort,
        oldPaths: pairedOldPaths,
        oldImpressions: measurement.old.impressions,
        canonicalImpressions: measurement.canonical.impressions,
        pairedImpressions: measurement.combined.impressions,
        oldUrlShare: measurement.oldUrlShare,
      });
    }
  }
  return { overall, essayOutliers };
};

const migrationMonthDecision = (reportingMonth, period) => {
  const overallShareQualifies =
    period.overall.oldUrlShare !== null &&
    period.overall.oldUrlShare <
      MIGRATION_THRESHOLDS.overallOldUrlShareMaximumExclusive;
  const noQualifyingEssayOutlier = period.essayOutliers.length === 0;
  return {
    reportingMonth,
    oldUrlShare: period.overall.oldUrlShare,
    pairedImpressions: period.overall.combined.impressions,
    overallShareQualifies,
    qualifyingEssayOutlierCount: period.essayOutliers.length,
    noQualifyingEssayOutlier,
    qualifies: overallShareQualifies && noQualifyingEssayOutlier,
  };
};

const pageCandidateEvidence = (page) => {
  const evidence = [];
  const visibility = CANDIDATE_THRESHOLDS.visibility;
  if (
    page.impressions >= visibility.minimumImpressions &&
    page.position >= visibility.minimumPositionInclusive &&
    page.position <= visibility.maximumPositionInclusive
  ) {
    evidence.push({ label: "Visibility candidate", ...visibility });
  }
  const clickThrough = CANDIDATE_THRESHOLDS.clickThrough;
  if (
    page.impressions >= clickThrough.minimumImpressions &&
    page.position >= clickThrough.minimumPositionInclusive &&
    page.position <= clickThrough.maximumPositionInclusive &&
    page.clicks === clickThrough.clicks
  ) {
    evidence.push({ label: "Click-through candidate", ...clickThrough });
  }
  return evidence;
};

const buildCandidates = (currentData, previousData) => {
  const empty = finishAggregate(emptyAggregate());
  const candidates = [];
  for (const [page, current] of Object.entries(currentData.pages)) {
    if (!CANDIDATE_COHORTS.includes(current.cohort)) continue;
    const evidence = pageCandidateEvidence(current);
    if (!evidence.length) continue;
    candidates.push({
      type: "page",
      page,
      cohort: current.cohort,
      current,
      previous: previousData.pages[page] ?? empty,
      evidence,
    });
  }

  const previousQueries = new Map(
    previousData.queries.genericPageQueries.map((query) => [query.key, query]),
  );
  const threshold = CANDIDATE_THRESHOLDS.disclosedQuery;
  for (const current of currentData.queries.genericPageQueries) {
    if (!CANDIDATE_COHORTS.includes(current.cohort)) continue;
    if (
      current.impressions < threshold.minimumImpressions ||
      current.position < threshold.minimumPositionInclusive ||
      current.position > threshold.maximumPositionInclusive
    ) {
      continue;
    }
    const previous = previousQueries.get(current.key);
    candidates.push({
      type: "query",
      page: current.page,
      cohort: current.cohort,
      normalizedQuery: current.query,
      rawVariants: current.rawVariants,
      previousRawVariants: previous?.rawVariants ?? [],
      current: {
        clicks: current.clicks,
        impressions: current.impressions,
        ctr: current.ctr,
        position: current.position,
      },
      previous: previous
        ? {
            clicks: previous.clicks,
            impressions: previous.impressions,
            ctr: previous.ctr,
            position: previous.position,
          }
        : empty,
      evidence: [{ label: "Disclosed-query candidate", ...threshold }],
    });
  }
  return candidates;
};

const comparePages = (currentPages, previousPages) => {
  const empty = finishAggregate(emptyAggregate());
  const paths = new Set([
    ...Object.keys(currentPages),
    ...Object.keys(previousPages),
  ]);
  return Object.fromEntries(
    [...paths].sort().map((pathname) => {
      const current = currentPages[pathname] ?? empty;
      const previous = previousPages[pathname] ?? empty;
      return [
        pathname,
        {
          cohort: current.cohort ?? previous.cohort,
          ...compareMetrics(current, previous),
          position: comparePosition(current.position, previous.position),
          sourceUrls: {
            current: current.sourceUrls ?? [],
            previous: previous.sourceUrls ?? [],
          },
        },
      ];
    }),
  );
};

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
const fmtDecimal = (value) => (value === null ? "n/a" : value.toFixed(2));

const candidateSubject = (candidate) =>
  candidate.type === "page"
    ? candidate.page
    : `${candidate.page} — ${candidate.normalizedQuery}`;

const renderCandidateCohort = (model, cohort) => {
  const candidates = model.candidates
    .filter((candidate) => candidate.cohort === cohort)
    .sort(
      (a, b) =>
        b.current.impressions - a.current.impressions ||
        candidateSubject(a).localeCompare(candidateSubject(b)),
    )
    .slice(0, 20);
  return [
    `### ${cohort}`,
    "",
    ...(candidates.length
      ? [
          "| Page or disclosed generic query | Evidence labels | Clicks | Impressions | Position | Previous clicks | Previous impressions | Previous position |",
          "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
          ...candidates.map(
            (candidate) =>
              `| ${candidateSubject(candidate)} | ${candidate.evidence.map(({ label }) => label).join(", ")} | ${fmtNumber(candidate.current.clicks)} | ${fmtNumber(candidate.current.impressions)} | ${fmtDecimal(candidate.current.position)} | ${fmtNumber(candidate.previous.clicks)} | ${fmtNumber(candidate.previous.impressions)} | ${fmtDecimal(candidate.previous.position)} |`,
          ),
        ]
      : ["No Search review candidates."]),
    "",
  ];
};

const renderFieldData = (fieldData) => {
  const measurement = ({ scope, status, collectionPeriod, metrics }) => {
    const window = collectionPeriod
      ? `${collectionPeriod.start}–${collectionPeriod.end}`
      : "—";
    return metrics
      ? `| ${scope} | available | ${window} | ${Math.round(metrics.lcpMs)} | ${metrics.cls.toFixed(3)} | ${Math.round(metrics.inpMs)} |`
      : `| ${scope} | ${status} | ${window} | — | — | — |`;
  };
  return [
    "## Field-data monitoring",
    "",
    `Source: **${fieldData.source}**. Form factor: **${fieldData.formFactor}**. These real-reader measurements are not Lighthouse lab results or Search Console measurements.`,
    "",
    "| Scope | Coverage | Rolling window | LCP p75 ms | CLS p75 | INP p75 ms |",
    "| --- | --- | --- | ---: | ---: | ---: |",
    measurement(fieldData.origin),
    ...fieldData.urls.map(measurement),
    "",
  ];
};

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
    ...renderFieldData(model.fieldData),
    "## Primary measurements",
    "",
    `- Editorial-focus essays: ${fmtNumber(editorial.clicks.current)} clicks (${fmtChange(editorial.clicks.absoluteChange)}), ${fmtNumber(editorial.impressions.current)} impressions (${fmtChange(editorial.impressions.absoluteChange)}), ${fmtPercent(editorial.ctr.current)} CTR.`,
    `- Disclosed Brand queries: ${fmtNumber(brand.clicks.current)} clicks (${fmtChange(brand.clicks.absoluteChange)}), ${fmtNumber(brand.impressions.current)} impressions (${fmtChange(brand.impressions.absoluteChange)}).`,
    "",
    "## Property context and page reconciliation",
    "",
    `Property totals: ${fmtNumber(property.clicks.current)} clicks, previously ${fmtNumber(property.clicks.previous)} (${fmtChange(property.clicks.absoluteChange)}); ${fmtNumber(property.impressions.current)} impressions, previously ${fmtNumber(property.impressions.previous)} (${fmtChange(property.impressions.absoluteChange)}). CTR is ${fmtPercent(property.ctr.current)} (${property.ctr.percentagePointChange === null ? "n/a" : `${(property.ctr.percentagePointChange * 100).toFixed(2)} percentage points`}).`,
    `Page-only totals: ${fmtNumber(property.pageOnlyTotals.clicks.current)} clicks, previously ${fmtNumber(property.pageOnlyTotals.clicks.previous)}; ${fmtNumber(property.pageOnlyTotals.impressions.current)} impressions, previously ${fmtNumber(property.pageOnlyTotals.impressions.previous)}.`,
    `Current page-only gap: ${fmtNumber(property.pageReconciliation.clicks.current.absolute)} clicks (${fmtPercent(property.pageReconciliation.clicks.current.percentage)}) and ${fmtNumber(property.pageReconciliation.impressions.current.absolute)} impressions (${fmtPercent(property.pageReconciliation.impressions.current.percentage)}).`,
    `Previous page-only gap: ${fmtNumber(property.pageReconciliation.clicks.previous.absolute)} clicks (${fmtPercent(property.pageReconciliation.clicks.previous.percentage)}) and ${fmtNumber(property.pageReconciliation.impressions.previous.absolute)} impressions (${fmtPercent(property.pageReconciliation.impressions.previous.percentage)}).`,
    "",
    "## Page-cohort comparison",
    "",
    "| Page cohort | Clicks | Previous | Click share | Previous | Impressions | Previous | Impression share | Previous | CTR |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const cohort of COHORTS) {
    const value = model.cohorts[cohort];
    lines.push(
      `| ${cohort} | ${fmtNumber(value.clicks.current)} | ${fmtNumber(value.clicks.previous)} | ${fmtPercent(value.shares.clicks.current)} | ${fmtPercent(value.shares.clicks.previous)} | ${fmtNumber(value.impressions.current)} | ${fmtNumber(value.impressions.previous)} | ${fmtPercent(value.shares.impressions.current)} | ${fmtPercent(value.shares.impressions.previous)} | ${fmtPercent(value.ctr.current)} |`,
    );
  }
  lines.push(
    "",
    `Page-only share denominators: ${fmtNumber(property.pageOnlyTotals.clicks.current)} current and ${fmtNumber(property.pageOnlyTotals.clicks.previous)} previous clicks; ${fmtNumber(property.pageOnlyTotals.impressions.current)} current and ${fmtNumber(property.pageOnlyTotals.impressions.previous)} previous impressions.`,
    "",
    "### Canonical-page comparison",
    "",
    "| Canonical page | Page cohort | Clicks | Previous | Impressions | Previous | CTR | Previous | Position | Previous |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(model.pages.comparisons).map(
      ([pathname, page]) =>
        `| ${pathname} | ${page.cohort} | ${fmtNumber(page.clicks.current)} | ${fmtNumber(page.clicks.previous)} | ${fmtNumber(page.impressions.current)} | ${fmtNumber(page.impressions.previous)} | ${fmtPercent(page.ctr.current)} | ${fmtPercent(page.ctr.previous)} | ${fmtDecimal(page.position.current)} | ${fmtDecimal(page.position.previous)} |`,
    ),
    "",
    "## Migration consolidation",
    "",
    `${model.migration.configuredRedirectCount} explicit redirect mappings were applied.`,
    "",
    "| Old URL | Canonical URL | Old impressions | Canonical impressions | Old-URL share | Previous old impressions | Previous canonical impressions | Previous old-URL share |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...model.migration.pairs.map(
      (pair) =>
        `| ${pair.oldPath} | ${pair.canonicalPath} | ${fmtNumber(pair.current.old.impressions)} | ${fmtNumber(pair.current.canonical.impressions)} | ${fmtPercent(pair.current.oldUrlShare)} | ${fmtNumber(pair.previous.old.impressions)} | ${fmtNumber(pair.previous.canonical.impressions)} | ${fmtPercent(pair.previous.oldUrlShare)} |`,
    ),
    "",
    `Overall old-URL share is ${fmtPercent(model.migration.overall.current.oldUrlShare)} from ${fmtNumber(model.migration.overall.current.old.impressions)} old-URL impressions and ${fmtNumber(model.migration.overall.current.combined.impressions)} paired impressions; previously ${fmtPercent(model.migration.overall.previous.oldUrlShare)} from ${fmtNumber(model.migration.overall.previous.old.impressions)} old-URL impressions and ${fmtNumber(model.migration.overall.previous.combined.impressions)} paired impressions.`,
    `Closure thresholds require less than ${fmtPercent(model.migration.thresholds.overallOldUrlShareMaximumExclusive)} overall old-URL share and no Essay with at least ${fmtPercent(model.migration.thresholds.essayOutlierOldUrlShareMinimumInclusive)} old-URL share among at least ${fmtNumber(model.migration.thresholds.essayOutlierPairedImpressionsMinimumInclusive)} paired impressions.`,
    ...(model.migration.essayOutliers.current.length
      ? model.migration.essayOutliers.current.map(
          (outlier) =>
            `- Current Essay outlier: ${outlier.canonicalPath} has ${fmtPercent(outlier.oldUrlShare)} old-URL share across ${fmtNumber(outlier.pairedImpressions)} paired impressions.`,
        )
      : ["- Current month has no qualifying Essay migration outlier."]),
    ...(model.migration.essayOutliers.previous.length
      ? model.migration.essayOutliers.previous.map(
          (outlier) =>
            `- Previous Essay outlier: ${outlier.canonicalPath} has ${fmtPercent(outlier.oldUrlShare)} old-URL share across ${fmtNumber(outlier.pairedImpressions)} paired impressions.`,
        )
      : ["- Previous month has no qualifying Essay migration outlier."]),
    `The compared Final reporting months are ${model.migration.manualClosure.eligible ? "eligible" : "not eligible"} for manual closure. This report does not close migration tracking automatically. Search Performance cannot identify Google's selected canonical; URL Inspection is still required.`,
    "",
    "## Search review candidates",
    "",
    "Search review candidates are prompts for human review, not automatic editing recommendations. Markdown displays at most 20 candidates per Page cohort; JSON retains every qualifying candidate.",
    "",
    ...CANDIDATE_COHORTS.flatMap((cohort) =>
      renderCandidateCohort(model, cohort),
    ),
    "## Disclosed Brand and generic query analysis",
    "",
    "| Disclosed-query class | Clicks | Previous | Impressions | Previous | CTR | Previous | Position | Previous | Normalized queries |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    `| Brand | ${fmtNumber(brand.clicks.current)} | ${fmtNumber(brand.clicks.previous)} | ${fmtNumber(brand.impressions.current)} | ${fmtNumber(brand.impressions.previous)} | ${fmtPercent(brand.ctr.current)} | ${fmtPercent(brand.ctr.previous)} | ${fmtDecimal(brand.position.current)} | ${fmtDecimal(brand.position.previous)} | ${model.queries.brand.normalizedQueries.length} |`,
    `| Generic | ${fmtNumber(model.queries.generic.clicks.current)} | ${fmtNumber(model.queries.generic.clicks.previous)} | ${fmtNumber(model.queries.generic.impressions.current)} | ${fmtNumber(model.queries.generic.impressions.previous)} | ${fmtPercent(model.queries.generic.ctr.current)} | ${fmtPercent(model.queries.generic.ctr.previous)} | ${fmtDecimal(model.queries.generic.position.current)} | ${fmtDecimal(model.queries.generic.position.previous)} | ${model.queries.generic.normalizedQueries.length} |`,
    "",
    `The disclosed subset covers ${fmtPercent(model.queries.coverage.clicks.current)} of page-only clicks and ${fmtPercent(model.queries.coverage.impressions.current)} of page-only impressions; previously ${fmtPercent(model.queries.coverage.clicks.previous)} and ${fmtPercent(model.queries.coverage.impressions.previous)}.`,
    "",
    "## Anomalies and methodological notes",
    "",
    ...(model.anomalies.length
      ? model.anomalies.map((anomaly) =>
          anomaly.type === "early-exposure"
            ? `- Early exposure in ${anomaly.reportingMonth}: ${anomaly.page} (${anomaly.dataset}).`
            : `- Property/page reconciliation in ${anomaly.reportingMonth}: ${fmtNumber(anomaly.clicks.absolute)} clicks (${fmtPercent(anomaly.clicks.percentage)}) and ${fmtNumber(anomaly.impressions.absolute)} impressions (${fmtPercent(anomaly.impressions.percentage)}).`,
        )
      : ["- No data-quality anomalies."]),
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
  fieldData = {
    source: "Chrome UX Report (CrUX), separate from Search Console",
    formFactor: "PHONE",
    origin: {
      scope: "https://buthonestly.io",
      status: "field data unavailable: not collected",
      collectionPeriod: null,
      metrics: null,
    },
    urls: [],
  },
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
    pageOnlyTotals: {
      clicks: compare(currentPageTotals.clicks, previousPageTotals.clicks),
      impressions: compare(
        currentPageTotals.impressions,
        previousPageTotals.impressions,
      ),
      ctr: compareCtr(
        currentPageTotals.impressions === 0
          ? null
          : currentPageTotals.clicks / currentPageTotals.impressions,
        previousPageTotals.impressions === 0
          ? null
          : previousPageTotals.clicks / previousPageTotals.impressions,
      ),
    },
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
  const brandComparison = compareQueryMetrics(
    currentData.queries.brand,
    previousData.queries.brand,
  );
  const genericComparison = compareQueryMetrics(
    currentData.queries.generic,
    previousData.queries.generic,
  );
  const coverage = {
    clicks: queryCoverage(
      currentData.queries.brand.clicks + currentData.queries.generic.clicks,
      previousData.queries.brand.clicks + previousData.queries.generic.clicks,
      currentPageTotals.clicks,
      previousPageTotals.clicks,
    ),
    impressions: queryCoverage(
      currentData.queries.brand.impressions +
        currentData.queries.generic.impressions,
      previousData.queries.brand.impressions +
        previousData.queries.generic.impressions,
      currentPageTotals.impressions,
      previousPageTotals.impressions,
    ),
  };
  const migrationPairs = [...validatedConfiguration.redirects].map(
    ([oldPath, canonicalPath]) => ({
      oldPath,
      canonicalPath,
      current: redirectPairMeasurement(
        currentData.migrationSources[oldPath],
        currentData.migrationSources[canonicalPath],
      ),
      previous: redirectPairMeasurement(
        previousData.migrationSources[oldPath],
        previousData.migrationSources[canonicalPath],
      ),
    }),
  );
  const currentMigration = migrationPeriod(
    currentData,
    validatedConfiguration.redirects,
    validatedConfiguration.canonicalRoutes,
  );
  const previousMigration = migrationPeriod(
    previousData,
    validatedConfiguration.redirects,
    validatedConfiguration.canonicalRoutes,
  );
  const migrationMonths = [
    migrationMonthDecision(month, currentMigration),
    migrationMonthDecision(previousMonth, previousMigration),
  ];
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
    fieldData,
    primaryMeasurements: {
      editorialFocus: cohorts["Editorial-focus essay"],
      disclosedBrandQueries: brandComparison,
    },
    propertyContext,
    cohorts,
    pages: {
      current: currentData.pages,
      previous: previousData.pages,
      comparisons: comparePages(currentData.pages, previousData.pages),
    },
    migration: {
      configuredRedirectCount: configuration.redirects.length,
      thresholds: MIGRATION_THRESHOLDS,
      pairs: migrationPairs,
      overall: {
        current: currentMigration.overall,
        previous: previousMigration.overall,
      },
      essayOutliers: {
        current: currentMigration.essayOutliers,
        previous: previousMigration.essayOutliers,
      },
      manualClosure: {
        eligible: migrationMonths.every(({ qualifies }) => qualifies),
        closesTrackingAutomatically: false,
        urlInspectionRequired: true,
        months: migrationMonths,
      },
    },
    queries: {
      coverage,
      brand: {
        ...brandComparison,
        normalizedQueries: currentData.queries.brandNormalizedQueries,
        previousNormalizedQueries: previousData.queries.brandNormalizedQueries,
      },
      generic: {
        ...genericComparison,
        normalizedQueries: currentData.queries.genericNormalizedQueries,
        previousNormalizedQueries:
          previousData.queries.genericNormalizedQueries,
      },
    },
    candidates: buildCandidates(currentData, previousData),
    anomalies: [
      ...previousData.anomalies,
      ...currentData.anomalies,
      ...[
        [
          previousMonth,
          propertyContext.pageReconciliation.clicks.previous,
          propertyContext.pageReconciliation.impressions.previous,
        ],
        [
          month,
          propertyContext.pageReconciliation.clicks.current,
          propertyContext.pageReconciliation.impressions.current,
        ],
      ].flatMap(([reportingMonth, clicks, impressions]) =>
        clicks.absolute === 0 && impressions.absolute === 0
          ? []
          : [
              {
                type: "property-page-reconciliation",
                reportingMonth,
                clicks,
                impressions,
              },
            ],
      ),
    ],
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
    const fieldData = await collectCruxFieldData({
      port: createCruxPort({ apiKey: process.env.CRUX_API_KEY }),
    });
    const result = generateSearchReport({ month, fieldData });
    process.stdout.write(
      `Wrote ${result.jsonPath} and ${result.markdownPath}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
