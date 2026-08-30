import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmptyLighthouseState,
  LIGHTHOUSE_MATRIX,
  runLighthouseMonitoring,
  scheduledDevices,
  selectPullRequestRoutes,
} from "../src/lib/lighthouse-monitoring.mjs";

const navigationMetrics = (value) => ({
  lcpMs: value,
  cls: value / 100,
  scriptTransferBytes: value,
  mainThreadWorkMs: value,
  firstPartyTransferBytes: value,
  thirdPartyTransferBytes: value,
  accessibility: value / 100,
  bestPractices: value / 100,
  seo: value / 100,
});

const workloadMetrics = (workload, value) =>
  workload === "cold-scroll"
    ? { firstPartyImageTransferBytes: value, layoutShift: value / 100 }
    : navigationMetrics(value);

const harness = ({
  now = new Date("2026-08-03T06:00:00.000Z"),
  audit,
} = {}) => {
  let durable = createEmptyLighthouseState("2026-08-01T00:00:00.000Z");
  const calls = [];
  const reports = [];
  return {
    calls,
    reports,
    state: () => durable,
    ports: {
      clock: { now: () => now },
      state: {
        load: async () => structuredClone(durable),
        save: async (value) => {
          durable = structuredClone(value);
        },
      },
      auditor: {
        audit: async (request) => {
          calls.push(request);
          if (audit) return audit(request, calls.length);
          return {
            workload: request.workload,
            metrics: workloadMetrics(request.workload, request.run),
            evidence: `${request.revision}-${request.run}`,
          };
        },
      },
      reporter: { write: async (report) => reports.push(report) },
    },
  };
};

test("scheduled device selection combines coincident checks without duplicating 07:00", () => {
  assert.deepEqual(scheduledDevices(new Date("2026-08-03T06:00:00.000Z")), [
    "mobile",
    "desktop",
  ]);
  assert.deepEqual(scheduledDevices(new Date("2026-08-03T07:00:00.000Z")), []);
  assert.deepEqual(scheduledDevices(new Date("2026-09-07T06:00:00.000Z")), []);
  assert.deepEqual(scheduledDevices(new Date("2026-09-07T07:00:00.000Z")), [
    "desktop",
  ]);
  assert.deepEqual(scheduledDevices(new Date("2026-08-17T06:00:00.000Z")), [
    "mobile",
  ]);
  assert.deepEqual(
    scheduledDevices(new Date("2026-08-03T09:47:00.000Z"), "0 6 * * 1"),
    ["mobile", "desktop"],
  );
  assert.deepEqual(
    scheduledDevices(new Date("2026-09-07T10:12:00.000Z"), "0 7 * * 1"),
    ["desktop"],
  );
  assert.deepEqual(
    scheduledDevices(new Date("2026-08-04T00:12:00.000Z"), "0 6 * * 1"),
    ["mobile", "desktop"],
  );
  assert.throws(
    () => scheduledDevices(new Date("2026-08-03T09:47:00.000Z"), "0 8 * * 1"),
    /Unknown Lighthouse schedule/,
  );
});

test("pull-request selection is change-aware and conservative", () => {
  assert.deepEqual(selectPullRequestRoutes(["docs/readme.md"]), []);
  assert.deepEqual(
    selectPullRequestRoutes([
      "src/lib/lighthouse-monitoring.mjs",
      "src/lib/crux-field-data.mjs",
    ]),
    [],
  );
  assert.deepEqual(
    selectPullRequestRoutes([
      "src/lib/lighthouse-monitoring.mjs",
      "src/components/Header.astro",
    ]),
    LIGHTHOUSE_MATRIX,
  );
  assert.deepEqual(
    selectPullRequestRoutes(["src/lib/essay-inventory.mjs"]),
    LIGHTHOUSE_MATRIX,
  );
  assert.deepEqual(
    selectPullRequestRoutes(["src/content/essays/example/example.mdx"]),
    ["/example/", "/"],
  );
  assert.deepEqual(
    selectPullRequestRoutes(["src/content/essays/scheduled/scheduled.mdx"], {
      homepageChanges: false,
    }),
    ["/scheduled/"],
  );
  assert.deepEqual(
    selectPullRequestRoutes([
      "src/pages/resources/free-ai-voice-generator.astro",
    ]),
    ["/resources/free-ai-voice-generator/", "/"],
  );
  assert.deepEqual(
    selectPullRequestRoutes(["src/components/Header.astro"]),
    LIGHTHOUSE_MATRIX,
  );
  assert.deepEqual(
    selectPullRequestRoutes(["public/unknown.js"]),
    LIGHTHOUSE_MATRIX,
  );
});

test("scheduled monitoring uses three-run medians and keeps navigation separate from cold scroll", async () => {
  const context = harness();
  const report = await runLighthouseMonitoring({
    trigger: "scheduled",
    ...context.ports,
  });

  assert.equal(report.advisory, true);
  assert.deepEqual(report.devices, ["mobile", "desktop"]);
  assert.equal(report.results.length, 10);
  assert.equal(context.calls.length, 30);
  const gpu = report.results.filter(({ route }) => route === "/what-is-a-gpu/");
  assert.deepEqual(
    gpu.map(({ result }) => result.workload),
    ["navigation", "cold-scroll", "navigation", "cold-scroll"],
  );
  assert.ok(
    report.results
      .filter(({ result }) => result.workload === "navigation")
      .every(({ result }) => result.metrics.lcpMs === 2),
  );
  assert.ok(
    gpu
      .filter(({ result }) => result.workload === "cold-scroll")
      .every(
        ({ result }) =>
          result.metrics.firstPartyImageTransferBytes === 2 &&
          result.metrics.layoutShift === 0.02 &&
          !Object.hasOwn(result.metrics, "lcpMs"),
      ),
  );
  assert.deepEqual(context.state().advisory.scheduledObservations, {
    mobile: 1,
    desktop: 1,
  });
  assert.equal(context.state().advisory.baseline.length, 10);
  assert.equal(context.state().advisory.baseline[0].metrics.lcpMs, 2);
  assert.equal(
    context.state().outcomes["mobile:/what-is-a-gpu/"].consecutivePasses,
    1,
  );
});

test("manual monitoring rejects routes outside the first-party path boundary", async () => {
  const context = harness();
  await assert.rejects(
    runLighthouseMonitoring({
      trigger: "manual",
      routes: ["//example.com/"],
      devices: ["mobile"],
      ...context.ports,
    }),
    /Invalid Lighthouse route/,
  );
});

test("an audit failure receives one immediate complete retry", async () => {
  let first = true;
  const context = harness({
    audit: (request) => {
      if (first) {
        first = false;
        throw new Error("browser ended");
      }
      return {
        workload: request.workload,
        metrics: workloadMetrics(request.workload, request.run),
        evidence: request.run,
      };
    },
  });
  const report = await runLighthouseMonitoring({
    trigger: "manual",
    routes: ["/"],
    devices: ["mobile"],
    ...context.ports,
  });

  assert.equal(context.calls.length, 4);
  assert.equal(report.results[0].status, "passed");
  assert.equal(report.results[0].retried, true);
});

test("pull requests compare matching routes while a new route has absolute evidence only", async () => {
  const context = harness({
    audit: (request) => ({
      workload: request.workload,
      metrics: workloadMetrics(
        request.workload,
        request.revision === "base" ? request.run : request.run + 5,
      ),
      evidence: request.run,
    }),
  });
  const report = await runLighthouseMonitoring({
    trigger: "pull-request",
    changedFiles: ["src/content/essays/new-essay/new-essay.mdx"],
    devices: ["mobile"],
    revisions: { base: "base", head: "head", baseRoutes: ["/"] },
    ...context.ports,
  });

  const essay = report.results.find(({ route }) => route === "/new-essay/");
  const homepage = report.results.find(({ route }) => route === "/");
  assert.equal(essay.base, null);
  assert.equal(essay.delta, null);
  assert.equal(homepage.delta.lcpMs, 5);
  assert.equal(
    context.calls.filter(({ revision }) => revision === "base").length,
    3,
  );
});

test("failed post-publication audits remain eligible for recovery", async () => {
  const context = harness({
    audit: () => {
      throw new Error("route unavailable");
    },
  });
  const report = await runLighthouseMonitoring({
    trigger: "post-publication",
    handoff: { slug: "essay", contentHash: "one" },
    ...context.ports,
  });

  assert.ok(report.results.every(({ status }) => status === "audit-failed"));
  assert.deepEqual(context.state().checkedContentHashes, {});
});

test("post-publication checks deduplicate reader-facing hashes but accept corrections", async () => {
  const context = harness();
  const first = await runLighthouseMonitoring({
    trigger: "post-publication",
    handoff: { slug: "essay", contentHash: "one" },
    ...context.ports,
  });
  const duplicate = await runLighthouseMonitoring({
    trigger: "post-publication",
    handoff: { slug: "essay", contentHash: "one" },
    ...context.ports,
  });
  const correction = await runLighthouseMonitoring({
    trigger: "post-publication",
    handoff: { slug: "essay", contentHash: "two" },
    ...context.ports,
  });

  assert.deepEqual(first.routes, ["/", "/essay/"]);
  assert.equal(duplicate.skipped, true);
  assert.equal(correction.skipped, false);
  assert.deepEqual(context.state().checkedContentHashes.essay, ["one", "two"]);
});
