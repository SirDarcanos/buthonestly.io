#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { createLighthouseAuditor } from "./lib/lighthouse-adapter.mjs";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const runBuild = async () => {
  await execFileAsync("npm", ["run", "build"], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    timeout: 180_000,
  });
};

const startPreview = async ({ port }) => {
  const child = execFile(
    "npm",
    ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(port)],
    { encoding: "utf8" },
  );
  let output = "";
  child.stdout?.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr?.on("data", (chunk) => {
    output += chunk;
  });
  return {
    url: `http://127.0.0.1:${port}`,
    output: () => output,
    close: async () => {
      if (child.exitCode !== null) return;
      child.kill("SIGTERM");
      await Promise.race([once(child, "exit"), delay(5_000)]);
      if (child.exitCode === null) child.kill("SIGKILL");
    },
  };
};

const waitForPreview = async ({ preview, timeoutMs = 30_000 }) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(preview.url, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error(
    `Production preview did not become ready within ${timeoutMs}ms: ${preview.output()}`,
  );
};

const runAuditChild = async ({ url, artifactDirectory }) => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [scriptPath, "--audit", url, artifactDirectory],
    {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
    },
  );
  return JSON.parse(stdout);
};

export async function runProductionBuildSmoke({
  port = 4399,
  artifactDirectory = "artifacts/lighthouse-smoke",
  build = runBuild,
  preview: createPreview = startPreview,
  waitUntilReady = waitForPreview,
  audit = runAuditChild,
} = {}) {
  await build();
  const preview = await createPreview({ port });
  try {
    await waitUntilReady({ preview });
    return await audit({ url: preview.url, artifactDirectory });
  } finally {
    await preview.close();
  }
}

const runChildAudit = async (url, artifactDirectory) => {
  await mkdir(artifactDirectory, { recursive: true });
  const auditor = createLighthouseAuditor({
    targets: { smoke: url },
    artifactDirectory,
  });
  const result = await auditor.audit({
    route: "/",
    device: "mobile",
    revision: "smoke",
    workload: "navigation",
    run: 1,
  });
  process.stdout.write(
    `${JSON.stringify({ workload: result.workload, metrics: result.metrics, evidence: result.evidence })}\n`,
  );
};

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath);
if (isMain) {
  try {
    if (process.argv[2] === "--audit") {
      await runChildAudit(process.argv[3], process.argv[4]);
    } else {
      const result = await runProductionBuildSmoke();
      process.stdout.write(
        `Lighthouse production-build smoke passed: LCP ${Math.round(result.metrics.lcpMs)}ms. Reports: ${result.evidence.json}, ${result.evidence.html}\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`Lighthouse smoke failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
