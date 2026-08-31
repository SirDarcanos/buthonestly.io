#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEssayInventory } from "../src/lib/essay-inventory.mjs";
import {
  createEmptyLighthouseState,
  LIGHTHOUSE_MATRIX,
  runLighthouseMonitoring,
  selectPullRequestRoutes,
} from "../src/lib/lighthouse-monitoring.mjs";
import { createLighthouseAuditor } from "./lib/lighthouse-adapter.mjs";

const STATE_FILE = "data/lighthouse-state.json";

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
        : `| ${entry.route} | ${entry.device} | unknown | ${entry.status}: ${entry.error} | ${REPORT_COLUMNS.map(() => "—").join(" | ")} |`,
    );
    if (entry.base?.status === "audit-failed") {
      lines.push(
        `| ↳ base | | | audit-failed: ${entry.base.error} | ${REPORT_COLUMNS.map(() => "—").join(" | ")} |`,
      );
    } else if (entry.delta) {
      lines.push(`| ↳ head − base | | | | ${cells(entry.delta)} |`);
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
  monitoringState,
  changedFiles: publicationChangedFiles = [],
  runStartedAt,
  now,
}) => {
  if (monitoringState.postPublicationBootstrapped) {
    return {
      bootstrapCandidates: [],
      candidates: published.filter(
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
    for (const essay of published) {
      if (essay.publishedAt > recentBoundary && essay.publishedAt <= now) {
        preciseSlugs.add(essay.slug);
      }
    }
  }
  return {
    bootstrapCandidates: published.filter(
      ({ slug }) => !preciseSlugs.has(slug),
    ),
    candidates: published.filter(({ slug }) => preciseSlugs.has(slug)),
  };
};

const inspectExpectedProductionVersion = async (essay) => {
  const production = await fetch(essay.canonicalUrl, {
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
  };
  if (options.trigger === "pull-request") {
    const files = changedFiles(environment.LIGHTHOUSE_BASE_SHA);
    const changedEssaySlugs = essaySlugsFromFiles(files);
    const scheduledSlugs = new Set(
      loadEssayInventory({ now }).scheduled.map(({ slug }) => slug),
    );
    const homepageChanges =
      changedEssaySlugs.length === 0 ||
      changedEssaySlugs.some((slug) => !scheduledSlugs.has(slug));
    const pullRequestRoutes = selectPullRequestRoutes(files, {
      homepageChanges,
    });
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
    const plan = planPostPublicationChecks({
      published: inventory.published,
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
    const reports = [];
    for (const essay of plan.candidates) {
      if (!(await inspectExpectedProductionVersion(essay))) continue;
      reports.push(
        await runLighthouseMonitoring({
          ...common,
          handoff: { slug: essay.slug, contentHash: essay.publicContentHash },
        }),
      );
    }
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
