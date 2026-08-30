import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runProductionBuildSmoke } from "../scripts/smoke-lighthouse.mjs";

test("the opt-in smoke builds, serves, audits, and always closes the production preview", async () => {
  const calls = [];
  const result = await runProductionBuildSmoke({
    port: 4400,
    artifactDirectory: "reports",
    build: async () => calls.push("build"),
    preview: async ({ port }) => {
      calls.push(`preview:${port}`);
      return {
        url: "http://127.0.0.1:4400",
        close: async () => calls.push("close"),
      };
    },
    waitUntilReady: async ({ preview }) => calls.push(`ready:${preview.url}`),
    audit: async ({ url, artifactDirectory }) => {
      calls.push(`audit:${url}:${artifactDirectory}`);
      return { metrics: { lcpMs: 1200 } };
    },
  });

  assert.deepEqual(result, { metrics: { lcpMs: 1200 } });
  assert.deepEqual(calls, [
    "build",
    "preview:4400",
    "ready:http://127.0.0.1:4400",
    "audit:http://127.0.0.1:4400:reports",
    "close",
  ]);
});

test("the real-browser smoke has bounded build, preview, and audit phases", async () => {
  const source = await readFile(
    new URL("../scripts/smoke-lighthouse.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /timeout: 180_000/);
  assert.match(source, /timeoutMs = 30_000/);
  assert.match(source, /timeout: 120_000/);
  assert.match(source, /createLighthouseAuditor/);
});
