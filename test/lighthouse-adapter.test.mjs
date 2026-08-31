import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createLighthouseAuditor,
  normalizeLighthouseResult,
  waitForNetworkQuiescence,
} from "../scripts/lib/lighthouse-adapter.mjs";

const fixture = JSON.parse(
  await readFile(
    new URL("./fixtures/lighthouse/navigation.json", import.meta.url),
    "utf8",
  ),
);

test("representative Lighthouse JSON is normalized into attributable metrics", () => {
  assert.deepEqual(
    normalizeLighthouseResult(fixture, {
      siteOrigin: "https://buthonestly.io",
    }),
    {
      workload: "navigation",
      metrics: {
        lcpMs: 1234.5,
        cls: 0.04,
        scriptTransferBytes: 1000,
        mainThreadWorkMs: 456.7,
        firstPartyTransferBytes: 3000,
        thirdPartyTransferBytes: 300,
        performance: 0.91,
        accessibility: 0.98,
        bestPractices: 1,
        seo: 0.92,
      },
    },
  );
});

test("a failed route fails at the Lighthouse adapter boundary", () => {
  const failedRoute = structuredClone(fixture);
  failedRoute.audits["http-status-code"] = { score: 0, displayValue: "404" };

  assert.throws(
    () =>
      normalizeLighthouseResult(failedRoute, {
        siteOrigin: "https://buthonestly.io",
      }),
    /route failed with HTTP status 404/,
  );
});

test("category scores outside the Lighthouse range are malformed", () => {
  const malformed = structuredClone(fixture);
  malformed.categories.performance.score = 2;

  assert.throws(
    () =>
      normalizeLighthouseResult(malformed, {
        siteOrigin: "https://buthonestly.io",
      }),
    /invalid performance score/,
  );
});

test("provider schema drift fails at the Lighthouse adapter boundary", () => {
  assert.throws(
    () =>
      normalizeLighthouseResult(
        {
          lighthouseVersion: "13",
          audits: { "http-status-code": { score: 1 } },
          categories: {},
        },
        { siteOrigin: "https://buthonestly.io" },
      ),
    /network request details/,
  );
});

test("cold-scroll waits for delayed loadingFinished and a bounded quiet period", async () => {
  const pendingRequests = new Set(["lazy-image"]);
  let currentTime = 0;
  let lastActivity = 0;
  const result = await waitForNetworkQuiescence({
    pendingRequests,
    lastActivityAt: () => lastActivity,
    timeoutMs: 1_000,
    quietMs: 200,
    pollMs: 50,
    now: () => currentTime,
    sleep: async (milliseconds) => {
      currentTime += milliseconds;
      if (currentTime === 150) {
        pendingRequests.delete("lazy-image");
        lastActivity = currentTime;
      }
    },
  });

  assert.deepEqual(result, { timedOut: false, waitedMs: 350 });
});

test("cold-scroll rejects an incomplete metric when a transfer never finishes", async () => {
  const pendingRequests = new Set(["stalled-image"]);
  let currentTime = 0;
  await assert.rejects(
    waitForNetworkQuiescence({
      pendingRequests,
      lastActivityAt: () => 0,
      timeoutMs: 300,
      quietMs: 100,
      pollMs: 50,
      now: () => currentTime,
      sleep: async (milliseconds) => {
        currentTime += milliseconds;
      },
    }),
    /did not become idle within 300ms/,
  );
});

test("the adapter retains raw reports when normalization rejects malformed output", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "lighthouse-artifacts-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const malformed = structuredClone(fixture);
  malformed.categories.performance.score = 2;
  const auditor = createLighthouseAuditor({
    targets: { head: "https://buthonestly.io" },
    artifactDirectory: directory,
    navigationRunner: async () => ({
      lhr: malformed,
      json: JSON.stringify(malformed),
      html: "<html>diagnostic report</html>",
    }),
  });

  await assert.rejects(
    auditor.audit({
      route: "/",
      device: "mobile",
      revision: "head",
      workload: "navigation",
      run: 1,
    }),
    /invalid performance score/,
  );
  assert.equal(
    await readFile(
      path.join(directory, "head-mobile-home-navigation-1.html"),
      "utf8",
    ),
    "<html>diagnostic report</html>",
  );
  assert.match(
    await readFile(
      path.join(directory, "head-mobile-home-navigation-1.json"),
      "utf8",
    ),
    /lighthouseVersion/,
  );
});

test("the adapter writes raw reports while returning only evidence paths", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "lighthouse-artifacts-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const auditor = createLighthouseAuditor({
    targets: { head: "https://buthonestly.io" },
    artifactDirectory: directory,
    navigationRunner: async () => ({
      lhr: fixture,
      json: JSON.stringify(fixture),
      html: "<html>report</html>",
    }),
  });

  const result = await auditor.audit({
    route: "/",
    device: "mobile",
    revision: "head",
    workload: "navigation",
    run: 1,
  });
  assert.equal(result.metrics.lcpMs, 1234.5);
  assert.equal(
    await readFile(result.evidence.html, "utf8"),
    "<html>report</html>",
  );
  assert.match(
    await readFile(result.evidence.json, "utf8"),
    /lighthouseVersion/,
  );
});
