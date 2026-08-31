#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEssayInventory } from "../src/lib/essay-inventory.mjs";
import {
  createEmptyLighthouseState,
  createPullRequestPlan,
  LIGHTHOUSE_MATRIX,
  runLighthouseMonitoring,
} from "../src/lib/lighthouse-monitoring.mjs";
import { createLighthouseAuditor } from "./lib/lighthouse-adapter.mjs";

const STATE_FILE = "data/lighthouse-state.json";
const PUBLICATION_HANDOFF_FILE =
  "artifacts/publication-monitoring-handoff.json";

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
};

export const createLighthouseStatePort = ({
  filePath = STATE_FILE,
  now = () => new Date(),
} = {}) => ({
  load: async () => {
    try {
      const value = JSON.parse(await readFile(filePath, "utf8"));
      if (
        value?.version !== 1 ||
        !value.advisory ||
        !value.checkedContentHashes ||
        typeof value.postPublicationBootstrapped !== "boolean" ||
        !value.outcomes ||
        !value.issues ||
        !Array.isArray(value.advisory.baseline)
      ) {
        throw new Error(`${filePath} does not contain Lighthouse state v1.`);
      }
      return value;
    } catch (error) {
      if (error?.code === "ENOENT")
        return createEmptyLighthouseState(now().toISOString());
      throw error;
    }
  },
  save: async (state) => {
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(stable(state), null, 2)}\n`);
      await rename(temporary, filePath);
    } finally {
      await rm(temporary, { force: true });
    }
  },
});

const REPORT_COLUMNS = Object.freeze([
  { key: "lcpMs", label: "LCP ms", decimals: false },
  { key: "cls", label: "CLS", decimals: true },
  { key: "scriptTransferBytes", label: "Script bytes", decimals: false },
  { key: "mainThreadWorkMs", label: "Main-thread ms", decimals: false },
  {
    key: "firstPartyTransferBytes",
    label: "First-party bytes",
    decimals: false,
  },
  {
    key: "thirdPartyTransferBytes",
    label: "Third-party bytes",
    decimals: false,
  },
  { key: "performance", label: "Performance", decimals: true },
  {
    key: "firstPartyImageTransferBytes",
    label: "Scroll image bytes",
    decimals: false,
  },
  { key: "layoutShift", label: "Scroll layout shift", decimals: true },
  { key: "accessibility", label: "A11y", decimals: true },
  { key: "bestPractices", label: "BP", decimals: true },
  { key: "seo", label: "SEO", decimals: true },
]);

const formatMetric = ({ decimals }, value) =>
  decimals ? value.toFixed(3) : Math.round(value).toLocaleString("en-US");

export const reportMarkdown = (report, { evidenceUrl } = {}) => {
  const lines = [
    "## Lighthouse regression check",
    "",
    `Mode: **${report.advisory ? "advisory" : "approved enforcement"}**`,
    "",
  ];
  if (report.skipped)
    return [...lines, "No reader-facing routes selected."].join("\n");
  lines.push(
    `${report.routes.length === 1 ? "Target" : "Targets"}: ${report.routes.map((route) => `\`${route}\``).join(", ")}`,
    "",
    `${report.devices.length === 1 ? "Device" : "Devices"}: ${report.devices.map((device) => `\`${device}\``).join(", ")}`,
    "",
  );
  if (report.baselineProgress?.length) {
    lines.push(
      `Advisory baseline evidence: ${report.baselineProgress
        .map(
          ({ device, completed, required, status }) =>
            `\`${device}\` ${completed} of ${required} (${status})`,
        )
        .join("; ")}`,
      "",
    );
  }
  if (evidenceUrl) {
    lines.push(
      `[Download individual HTML and JSON reports](${evidenceUrl})`,
      "",
    );
  }
  const cells = (metrics) =>
    REPORT_COLUMNS.map((column) =>
      Object.hasOwn(metrics, column.key)
        ? formatMetric(column, metrics[column.key])
        : "—",
    ).join(" | ");
  lines.push(
    `| Route | Device | Workload | Status | ${REPORT_COLUMNS.map(({ label }) => label).join(" | ")} |`,
    `| --- | --- | --- | --- | ${REPORT_COLUMNS.map(() => "---:").join(" | ")} |`,
  );
  for (const entry of report.results) {
    const metrics = entry.result?.metrics;
    lines.push(
      metrics
        ? `| ${entry.route} | ${entry.device} | ${entry.result.workload} | ${entry.status}${entry.retried ? " (retried)" : ""} | ${cells(metrics)} |`
        : `| ${entry.route} | ${entry.device} | ${entry.workload} | ${entry.status}: ${entry.error} | ${REPORT_COLUMNS.map(() => "—").join(" | ")} |`,
    );
    if (entry.base?.status === "audit-failed") {
      lines.push(
        `| ↳ base | | ${entry.base.workload} | audit-failed: ${entry.base.error} | ${REPORT_COLUMNS.map(() => "—").join(" | ")} |`,
      );
    } else if (entry.base?.result && entry.delta) {
      lines.push(
        `| ↳ base | | | passed | ${cells(entry.base.result.metrics)} |`,
        `| ↳ head − base | | | | ${cells(entry.delta)} |`,
      );
    }
  }
  return lines.join("\n");
};

const changedFiles = (base) =>
  base
    ? execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
        encoding: "utf8",
      })
        .trim()
        .split("\n")
        .filter(Boolean)
    : [];

const commitFiles = (commit) =>
  commit
    ? execFileSync(
        "git",
        ["diff-tree", "--root", "--no-commit-id", "-r", "--name-only", commit],
        { encoding: "utf8" },
      )
        .trim()
        .split("\n")
        .filter(Boolean)
    : [];

const essaySlugsFromFiles = (files) =>
  files
    .map((filename) => filename.match(/^src\/content\/essays\/([^/]+)\//u)?.[1])
    .filter(Boolean);

export const planPostPublicationChecks = ({
  published,
  handoffs,
  monitoringState,
  changedFiles: publicationChangedFiles = [],
  runStartedAt,
  now,
}) => {
  const handedOffHashes = new Map(
    handoffs.map(({ slug, contentHash }) => [slug, contentHash]),
  );
  const handedOffEssays = published.filter(
    ({ slug, publicContentHash }) =>
      handedOffHashes.get(slug) === publicContentHash,
  );
  if (monitoringState.postPublicationBootstrapped) {
    return {
      bootstrapCandidates: [],
      candidates: handedOffEssays.filter(
        (essay) =>
          !(monitoringState.checkedContentHashes[essay.slug] ?? []).includes(
            essay.publicContentHash,
          ),
      ),
    };
  }

  const preciseSlugs = new Set(essaySlugsFromFiles(publicationChangedFiles));
  const startedAt = runStartedAt ? new Date(runStartedAt) : null;
  if (startedAt && !Number.isNaN(startedAt.valueOf())) {
    const recentBoundary = new Date(startedAt.getTime() - 2 * 60 * 60 * 1000);
    for (const essay of handedOffEssays) {
      if (essay.publishedAt > recentBoundary && essay.publishedAt <= now) {
        preciseSlugs.add(essay.slug);
      }
    }
  }
  return {
    bootstrapCandidates: handedOffEssays.filter(
      ({ slug }) => !preciseSlugs.has(slug),
    ),
    candidates: handedOffEssays.filter(({ slug }) => preciseSlugs.has(slug)),
  };
};

export const readPublicationMonitoringHandoffs = async (
  filePath = PUBLICATION_HANDOFF_FILE,
) => {
  try {
    const handoff = JSON.parse(await readFile(filePath, "utf8"));
    if (
      handoff?.version !== 1 ||
      !Array.isArray(handoff.essays) ||
      handoff.essays.some(
        ({ slug, contentHash }) =>
          typeof slug !== "string" || typeof contentHash !== "string",
      )
    ) {
      throw new Error(
        `${filePath} does not contain a publication monitoring handoff v1.`,
      );
    }
    return handoff.essays;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
};

export const isExpectedProductionVersionLive = async (
  essay,
  { fetch: fetchProduction = fetch } = {},
) => {
  const production = await fetchProduction(essay.canonicalUrl, {
    headers: { Accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!production.ok) return false;
  const contentHash = (await production.text()).match(
    /\bdata-content-version\s*=\s*["']([^"']+)["']/iu,
  )?.[1];
  return contentHash === essay.publicContentHash;
};

export const historicalContentHashes = (essays) =>
  Object.fromEntries(
    essays.map(({ slug, publicContentHash }) => [slug, [publicContentHash]]),
  );

export const runPostPublicationChecks = async ({ candidates, isLive, run }) => {
  const reports = [];
  const failures = [];
  for (const essay of candidates) {
    try {
      if (!(await isLive(essay))) continue;
      reports.push(await run(essay));
    } catch (error) {
      failures.push(
        `${essay.slug}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(`Post-publication checks failed: ${failures.join("; ")}`);
  }
  return reports;
};

const parseArguments = (arguments_) => {
  const options = { trigger: "scheduled", routes: [], devices: [] };
  for (let index = 0; index < arguments_.length; index += 1) {
    const value = arguments_[index];
    if (value === "--trigger") options.trigger = arguments_[++index];
    else if (value === "--route") options.routes.push(arguments_[++index]);
    else if (value === "--device") options.devices.push(arguments_[++index]);
    else if (value === "--slug") options.slug = arguments_[++index];
    else if (value === "--content-hash")
      options.contentHash = arguments_[++index];
    else throw new Error(`Unknown Lighthouse option: ${value}`);
  }
  return options;
};

export async function runCommand(options, environment = process.env) {
  const now = new Date(environment.LIGHTHOUSE_NOW ?? Date.now());
  const state = createLighthouseStatePort({ now: () => now });
  const targets = {
    head:
      environment.LIGHTHOUSE_HEAD_URL ??
      environment.SITE_URL ??
      "https://buthonestly.io",
    production: environment.SITE_URL ?? "https://buthonestly.io",
  };
  if (environment.LIGHTHOUSE_BASE_URL)
    targets.base = environment.LIGHTHOUSE_BASE_URL;
  const evidenceUrl =
    environment.GITHUB_SERVER_URL &&
    environment.GITHUB_REPOSITORY &&
    environment.GITHUB_RUN_ID
      ? `${environment.GITHUB_SERVER_URL}/${environment.GITHUB_REPOSITORY}/actions/runs/${environment.GITHUB_RUN_ID}#artifacts`
      : undefined;
  const reporter = {
    write: async (report) => {
      const markdown = reportMarkdown(report, { evidenceUrl });
      console.log(markdown);
      if (environment.GITHUB_STEP_SUMMARY)
        await writeFile(environment.GITHUB_STEP_SUMMARY, `${markdown}\n`, {
          flag: "a",
        });
    },
  };
  const common = {
    trigger: options.trigger,
    clock: { now: () => now },
    state,
    auditor: createLighthouseAuditor({
      targets,
      artifactDirectory:
        environment.LIGHTHOUSE_ARTIFACT_DIR ?? "artifacts/lighthouse",
    }),
    reporter,
    routes: options.routes,
    devices: options.devices,
    schedule: environment.LIGHTHOUSE_SCHEDULE,
    scheduledRunId: environment.LIGHTHOUSE_SCHEDULED_RUN_ID,
  };
  if (options.trigger === "pull-request") {
    const files = changedFiles(environment.LIGHTHOUSE_BASE_SHA);
    const selectedRoutes =
      environment.LIGHTHOUSE_PULL_REQUEST_ROUTES?.split(",").filter(Boolean);
    const inventory = loadEssayInventory({ now });
    const pullRequestRoutes =
      selectedRoutes ??
      createPullRequestPlan({
        files,
        headPublishedSlugs: inventory.published.map(({ slug }) => slug),
        basePublishedSlugs: inventory.published.map(({ slug }) => slug),
        headScheduledSlugs: inventory.scheduled.map(({ slug }) => slug),
        baseScheduledSlugs: inventory.scheduled.map(({ slug }) => slug),
      }).routes;
    let baseRoutes;
    if (targets.base) {
      baseRoutes =
        environment.LIGHTHOUSE_BASE_ROUTES?.split(",").filter(Boolean);
      if (!baseRoutes) {
        baseRoutes = [];
        for (const route of pullRequestRoutes) {
          const response = await fetch(new URL(route, targets.base), {
            redirect: "follow",
            signal: AbortSignal.timeout(15_000),
          });
          if (response.ok) baseRoutes.push(route);
        }
      }
    }
    return runLighthouseMonitoring({
      ...common,
      changedFiles: files,
      pullRequestRoutes,
      revisions: {
        head: "head",
        ...(targets.base ? { base: "base", baseRoutes } : {}),
      },
    });
  }
  if (options.trigger === "post-publication" && !options.slug) {
    const inventory = loadEssayInventory({ now });
    const durableState = await state.load();
    const handoffs = await readPublicationMonitoringHandoffs(
      environment.PUBLICATION_MONITORING_HANDOFF_FILE ??
        PUBLICATION_HANDOFF_FILE,
    );
    if (handoffs.length === 0) {
      const skipped = { advisory: true, skipped: true, results: [] };
      await reporter.write(skipped);
      return [skipped];
    }
    const plan = planPostPublicationChecks({
      published: inventory.published,
      handoffs,
      monitoringState: durableState,
      changedFiles: commitFiles(environment.PUBLICATION_HEAD_SHA),
      runStartedAt: environment.PUBLICATION_RUN_STARTED_AT,
      now,
    });
    if (!durableState.postPublicationBootstrapped) {
      durableState.checkedContentHashes = {
        ...durableState.checkedContentHashes,
        ...historicalContentHashes(plan.bootstrapCandidates),
      };
      durableState.postPublicationBootstrapped = true;
      await state.save(durableState);
    }
    const reports = await runPostPublicationChecks({
      candidates: plan.candidates,
      isLive: isExpectedProductionVersionLive,
      run: (essay) =>
        runLighthouseMonitoring({
          ...common,
          handoff: { slug: essay.slug, contentHash: essay.publicContentHash },
        }),
    });
    if (reports.length === 0)
      await reporter.write({ advisory: true, skipped: true, results: [] });
    return reports;
  }
  return runLighthouseMonitoring({
    ...common,
    ...(options.trigger === "post-publication"
      ? { handoff: { slug: options.slug, contentHash: options.contentHash } }
      : {}),
    revisions: {
      head:
        options.trigger === "scheduled" ||
        options.trigger === "post-publication"
          ? "production"
          : "head",
    },
  });
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    await runCommand(parseArguments(process.argv.slice(2)));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

export { LIGHTHOUSE_MATRIX };
