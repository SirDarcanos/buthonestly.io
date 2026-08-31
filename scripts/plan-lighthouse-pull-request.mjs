#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEssayInventory } from "../src/lib/essay-inventory.mjs";
import { createPullRequestPlan } from "../src/lib/lighthouse-monitoring.mjs";

const changedFiles = (base) =>
  execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);

export const writePullRequestPlan = async ({
  base,
  outputPath,
  summaryPath,
  now = new Date(),
}) => {
  if (!base) throw new Error("LIGHTHOUSE_BASE_SHA is required.");
  const files = changedFiles(base);
  const headInventory = loadEssayInventory({ now });
  const baseInventory = loadEssayInventory({
    now,
    essaysDirectory: ".lighthouse-base/src/content/essays",
  });
  const plan = createPullRequestPlan({
    files,
    headPublishedSlugs: headInventory.published.map(({ slug }) => slug),
    basePublishedSlugs: baseInventory.published.map(({ slug }) => slug),
    headScheduledSlugs: headInventory.scheduled.map(({ slug }) => slug),
    baseScheduledSlugs: baseInventory.scheduled.map(({ slug }) => slug),
  });
  const selected = plan.routes.length > 0;
  await appendFile(
    outputPath,
    `selected=${selected}\nroutes=${plan.routes.join(",")}\npreview_slugs=${plan.previewSlugs.join(",")}\n`,
  );
  const summary = selected
    ? `## Lighthouse pull-request selection\n\nSelected: ${plan.routes.map((route) => `\`${route}\``).join(", ")}\n`
    : "## Lighthouse pull-request selection\n\nNo changed files can affect rendered reader output. Lighthouse skipped.\n";
  await writeFile(summaryPath, summary, { flag: "a" });
  return plan;
};

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    await writePullRequestPlan({
      base: process.env.LIGHTHOUSE_BASE_SHA,
      outputPath: process.env.GITHUB_OUTPUT,
      summaryPath: process.env.GITHUB_STEP_SUMMARY,
    });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}
