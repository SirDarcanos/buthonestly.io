export const LIGHTHOUSE_MATRIX = Object.freeze([
  "/",
  "/when-ai-stops-being-a-tool/",
  "/what-is-a-gpu/",
  "/resources/free-ai-voice-generator/",
]);

export const GPU_ROUTE = "/what-is-a-gpu/";
export const DEVICES = Object.freeze(["mobile", "desktop"]);

const median = (values) => {
  if (
    values.some((value) => typeof value !== "number" || !Number.isFinite(value))
  ) {
    throw new Error("Lighthouse median inputs must contain finite metrics.");
  }
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
};

const workloadMetricKeys = Object.freeze({
  navigation: [
    "lcpMs",
    "cls",
    "scriptTransferBytes",
    "mainThreadWorkMs",
    "firstPartyTransferBytes",
    "thirdPartyTransferBytes",
    "accessibility",
    "bestPractices",
    "seo",
  ],
  "cold-scroll": ["firstPartyImageTransferBytes", "layoutShift"],
});

export const medianResult = (results) => {
  if (results.length !== 3)
    throw new Error("A Lighthouse result requires exactly three runs.");
  const workload = results[0].workload;
  if (results.some((result) => result.workload !== workload)) {
    throw new Error("Lighthouse median inputs must use one workload.");
  }
  const metricKeys = workloadMetricKeys[workload];
  if (!metricKeys) throw new Error(`Unknown Lighthouse workload: ${workload}`);
  return {
    workload,
    metrics: Object.fromEntries(
      metricKeys.map((key) => [
        key,
        median(results.map(({ metrics }) => metrics[key])),
      ]),
    ),
    runs: results.map(({ evidence }) => evidence),
  };
};

const isoWeek = (date) => {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil(((utc - yearStart) / 86_400_000 + 1) / 7);
};

const scheduleHour = (schedule) => {
  const hour = schedule?.match(/^0 (6|7) \* \* 1$/u)?.[1];
  if (!hour) throw new Error(`Unknown Lighthouse schedule: ${schedule}`);
  return Number(hour);
};

const scheduledOccurrence = (now, schedule) => {
  if (!schedule) return now;
  const occurrence = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  occurrence.setUTCDate(
    occurrence.getUTCDate() - ((occurrence.getUTCDay() + 6) % 7),
  );
  occurrence.setUTCHours(scheduleHour(schedule));
  return occurrence;
};

export const scheduledDevices = (now, schedule) => {
  const occurrence = scheduledOccurrence(now, schedule);
  const monday = occurrence.getUTCDay() === 1;
  if (!monday) return [];
  const firstMonday = occurrence.getUTCDate() <= 7;
  const hour = occurrence.getUTCHours();
  if (hour === 6) {
    return [
      ...(isoWeek(occurrence) % 2 === 0 ? ["mobile"] : []),
      ...(firstMonday && isoWeek(occurrence) % 2 === 0 ? ["desktop"] : []),
    ];
  }
  if (hour === 7 && firstMonday && isoWeek(occurrence) % 2 !== 0)
    return ["desktop"];
  return [];
};

const normalizedRoute = (route) => {
  const candidate = route === "/" || route?.endsWith("/") ? route : `${route}/`;
  if (!/^\/(?:[a-z0-9-]+\/)*$/iu.test(candidate ?? "")) {
    throw new Error(`Invalid Lighthouse route: ${route}`);
  }
  return candidate;
};

const monitoringOnlyChange = (filename) =>
  ["src/lib/crux-field-data.mjs", "src/lib/lighthouse-monitoring.mjs"].includes(
    filename,
  );

const fullMatrixChange = (filename) =>
  filename === "astro.config.mjs" ||
  filename === "package.json" ||
  filename === "package-lock.json" ||
  /^(src\/(components|layouts|styles|lib)\/|src\/content\.config\.ts|src\/consts\.ts)/u.test(
    filename,
  );

const outputChange = (filename) =>
  /^(src\/|public\/|astro\.config\.mjs$|package(-lock)?\.json$)/u.test(
    filename,
  );

export const selectPullRequestRoutes = (
  changedFiles,
  { homepageChanges = true } = {},
) => {
  const outputFiles = changedFiles.filter(
    (filename) => !monitoringOnlyChange(filename),
  );
  if (outputFiles.some(fullMatrixChange)) return [...LIGHTHOUSE_MATRIX];
  const routes = new Set();
  for (const filename of outputFiles) {
    const essay = filename.match(/^src\/content\/essays\/([^/]+)\//u)?.[1];
    if (essay) {
      routes.add(`/${essay}/`);
      if (homepageChanges) routes.add("/");
      continue;
    }
    if (
      /^src\/pages\/resources\/free-ai-voice-generator\.astro$/u.test(filename)
    ) {
      routes.add("/resources/free-ai-voice-generator/");
      routes.add("/");
      continue;
    }
    if (outputChange(filename)) return [...LIGHTHOUSE_MATRIX];
  }
  return [...routes];
};

export const createEmptyLighthouseState = (startedAt) => ({
  version: 1,
  advisory: {
    startedAt,
    scheduledObservations: { mobile: 0, desktop: 0 },
    baseline: [],
    budgetProposal: null,
    budgetsApproved: false,
  },
  checkedContentHashes: {},
  postPublicationBootstrapped: false,
  outcomes: {},
  issues: {},
});

const outcomeKey = (route, device) => `${device}:${route}`;

const auditWorkload = async ({
  auditor,
  route,
  device,
  revision,
  workload,
}) => {
  const runAttempt = async () => {
    const runs = [];
    for (let run = 1; run <= 3; run += 1) {
      runs.push(
        await auditor.audit({ route, device, revision, workload, run }),
      );
    }
    return medianResult(runs);
  };
  try {
    return { status: "passed", result: await runAttempt(), retried: false };
  } catch (firstError) {
    try {
      return { status: "passed", result: await runAttempt(), retried: true };
    } catch (retryError) {
      return {
        status: "audit-failed",
        retried: true,
        error:
          retryError instanceof Error ? retryError.message : String(retryError),
      };
    }
  }
};

const workloadsFor = (route) =>
  route === GPU_ROUTE ? ["navigation", "cold-scroll"] : ["navigation"];

const auditRevision = async ({ auditor, routes, devices, revision }) => {
  const results = [];
  for (const route of routes) {
    for (const device of devices) {
      for (const workload of workloadsFor(route)) {
        results.push({
          route,
          device,
          revision,
          ...(await auditWorkload({
            auditor,
            route,
            device,
            revision,
            workload,
          })),
        });
      }
    }
  }
  return results;
};

const comparison = (base, head) => {
  if (!base?.result || !head?.result) return null;
  return Object.fromEntries(
    Object.keys(head.result.metrics).map((key) => [
      key,
      head.result.metrics[key] - base.result.metrics[key],
    ]),
  );
};

const resolveRun = ({
  trigger,
  now,
  routes,
  devices,
  changedFiles,
  handoff,
  state,
  schedule,
}) => {
  if (trigger === "scheduled")
    return {
      routes: [...LIGHTHOUSE_MATRIX],
      devices: scheduledDevices(now, schedule),
    };
  if (trigger === "manual")
    return { routes: routes.map(normalizedRoute), devices };
  if (trigger === "pull-request")
    return {
      routes: selectPullRequestRoutes(changedFiles),
      devices: devices?.length ? devices : ["mobile"],
    };
  if (trigger === "post-publication") {
    const seen = state.checkedContentHashes[handoff.slug] ?? [];
    if (seen.includes(handoff.contentHash)) return { routes: [], devices: [] };
    return {
      routes: ["/", normalizedRoute(`/${handoff.slug}/`)],
      devices: devices?.length ? devices : ["mobile"],
    };
  }
  throw new Error(`Unknown Lighthouse trigger: ${trigger}`);
};

export async function runLighthouseMonitoring({
  trigger,
  clock,
  state: statePort,
  auditor,
  reporter,
  routes = [],
  devices = [],
  changedFiles = [],
  handoff,
  pullRequestRoutes,
  schedule,
  revisions = { head: "production" },
}) {
  const now = clock.now();
  const durableState = await statePort.load();
  const selection =
    trigger === "pull-request" && pullRequestRoutes
      ? {
          routes: pullRequestRoutes.map(normalizedRoute),
          devices: devices?.length ? devices : ["mobile"],
        }
      : resolveRun({
          trigger,
          now,
          routes,
          devices,
          changedFiles,
          handoff,
          state: durableState,
          schedule,
        });
  selection.routes = [...new Set(selection.routes.map(normalizedRoute))];
  selection.devices = [...new Set(selection.devices)];
  for (const device of selection.devices) {
    if (!DEVICES.includes(device)) {
      throw new Error(`Invalid Lighthouse device: ${device}`);
    }
  }
  if (selection.routes.length === 0 || selection.devices.length === 0) {
    const skipped = {
      trigger,
      advisory: true,
      skipped: true,
      routes: selection.routes,
      devices: selection.devices,
      results: [],
    };
    await reporter.write(skipped);
    return skipped;
  }

  const headResults = await auditRevision({
    auditor,
    routes: selection.routes,
    devices: selection.devices,
    revision: revisions.head,
  });
  let results = headResults;
  if (trigger === "pull-request" && revisions.base) {
    const baseRoutes = new Set(revisions.baseRoutes ?? selection.routes);
    const baseResults = await auditRevision({
      auditor,
      routes: selection.routes.filter((route) => baseRoutes.has(route)),
      devices: selection.devices,
      revision: revisions.base,
    });
    const baseByWorkload = new Map(
      baseResults.map((result) => [
        `${result.route}:${result.device}:${result.result?.workload}`,
        result,
      ]),
    );
    results = headResults.map((head) => ({
      ...head,
      base:
        baseByWorkload.get(
          `${head.route}:${head.device}:${head.result?.workload}`,
        ) ?? null,
      delta: comparison(
        baseByWorkload.get(
          `${head.route}:${head.device}:${head.result?.workload}`,
        ),
        head,
      ),
    }));
  }

  const outcomes = new Map();
  for (const result of results) {
    const key = outcomeKey(result.route, result.device);
    const routeDeviceResults = outcomes.get(key) ?? [];
    routeDeviceResults.push(result);
    outcomes.set(key, routeDeviceResults);
  }
  for (const [key, routeDeviceResults] of outcomes) {
    const status = routeDeviceResults.every(
      (result) => result.status === "passed",
    )
      ? "passed"
      : "audit-failed";
    const previous = durableState.outcomes[key] ?? {
      consecutivePasses: 0,
      openIssueNumber: null,
    };
    durableState.outcomes[key] = {
      status,
      checkedAt: now.toISOString(),
      consecutivePasses:
        status === "passed" ? previous.consecutivePasses + 1 : 0,
      openIssueNumber: previous.openIssueNumber ?? null,
    };
  }
  if (trigger === "scheduled") {
    for (const device of selection.devices) {
      const deviceResults = results.filter(
        (result) => result.device === device,
      );
      if (deviceResults.every(({ status }) => status === "passed")) {
        durableState.advisory.scheduledObservations[device] += 1;
      }
    }
    durableState.advisory.baseline.push(
      ...results
        .filter(({ status }) => status === "passed")
        .map(({ route, device, result }) => ({
          checkedAt: now.toISOString(),
          route,
          device,
          workload: result.workload,
          metrics: result.metrics,
        })),
    );
  }
  if (
    trigger === "post-publication" &&
    results.every(({ status }) => status === "passed")
  ) {
    durableState.checkedContentHashes[handoff.slug] = [
      ...new Set([
        ...(durableState.checkedContentHashes[handoff.slug] ?? []),
        handoff.contentHash,
      ]),
    ].sort();
  }
  await statePort.save(durableState);
  const report = {
    trigger,
    advisory: !durableState.advisory.budgetsApproved,
    skipped: false,
    routes: selection.routes,
    devices: selection.devices,
    results,
  };
  await reporter.write(report);
  return report;
}
