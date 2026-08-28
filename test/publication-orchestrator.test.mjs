import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runPublication } from "../src/lib/publication-orchestrator.mjs";
import {
  createDeploymentPort,
  createFileStatePort,
  createIndexNowPort,
  createKitPort,
  createProductionPort,
  renderNewsletterContent,
} from "../scripts/orchestrate-publication.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

test("the production port reads the exact public content version from successful HTML", async () => {
  const responses = [
    new Response(
      '<meta content="https://buthonestly.io/cover.webp?a=1&amp;b=2" property="og:image"><article data-content-version="expected-hash">Current</article>',
      { status: 200 },
    ),
    new Response('<article data-content-version="old-hash">Old</article>', {
      status: 200,
    }),
    new Response("Missing", { status: 404 }),
    new Response("Unavailable", { status: 503 }),
  ];
  const requested = [];
  const production = createProductionPort({
    fetch: async (url) => {
      requested.push(url);
      return responses.shift();
    },
  });
  const candidate = {
    canonicalUrl: "https://buthonestly.io/example/",
  };

  assert.deepEqual(await production.inspect(candidate), {
    status: "reachable",
    contentHash: "expected-hash",
    coverUrl: "https://buthonestly.io/cover.webp?a=1&b=2",
  });
  assert.deepEqual(await production.inspect(candidate), {
    status: "reachable",
    contentHash: "old-hash",
    coverUrl: null,
  });
  assert.deepEqual(await production.inspect(candidate), {
    status: "missing",
    contentHash: null,
  });
  assert.deepEqual(await production.inspect(candidate), {
    status: "unavailable",
    contentHash: null,
    detail: "HTTP 503",
  });
  assert.deepEqual(requested, [
    candidate.canonicalUrl,
    candidate.canonicalUrl,
    candidate.canonicalUrl,
    candidate.canonicalUrl,
  ]);
});

test("Kit drafts and delivers the exact recorded broadcast with structured safe content", async () => {
  const requests = [];
  const responses = [
    { broadcasts: [], pagination: { has_next_page: false } },
    { broadcast: { id: 47, status: "draft" } },
    { broadcast: { id: 47, status: "draft" } },
    { broadcast: { id: 47, status: "scheduled" } },
  ];
  const kit = createKitPort({
    apiKey: "secret",
    fetch: async (url, options) => {
      requests.push({ url, options });
      return Response.json(responses.shift());
    },
  });
  const candidate = {
    slug: "safe-content",
    title: 'Plain <title> & "subject"',
    newsletterIntro: "First <paragraph> & safe.\n\nSecond paragraph.",
    body: "This MDX prose must never appear.",
    canonicalUrl: "https://buthonestly.io/essay/?a=1&b=2",
    coverAlt: 'Cover <alt> & "details"',
    publishedAt: new Date("2026-09-15T13:00:00.000Z"),
  };
  const coverUrl = "https://buthonestly.io/cover.webp?a=1&b=2";

  assert.equal(await kit.findDraft(candidate), null);
  const draft = await kit.createDraft(candidate, coverUrl);
  await kit.inspect(draft.id);
  await kit.deliver(
    draft.id,
    candidate,
    coverUrl,
    new Date("2026-09-15T13:15:00.000Z"),
  );

  assert.deepEqual(
    requests.map(({ url, options }) => [url, options.method]),
    [
      [
        "https://api.kit.com/v4/broadcasts?status=draft&per_page=1000",
        undefined,
      ],
      ["https://api.kit.com/v4/broadcasts", "POST"],
      ["https://api.kit.com/v4/broadcasts/47", undefined],
      ["https://api.kit.com/v4/broadcasts/47", "PUT"],
    ],
  );
  const draftPayload = JSON.parse(requests[1].options.body);
  const deliveryPayload = JSON.parse(requests[3].options.body);
  assert.equal(draftPayload.subject, candidate.title);
  assert.match(
    draftPayload.description,
    /buthonestly-publication:safe-content/,
  );
  assert.equal(draftPayload.send_at, null);
  assert.equal(deliveryPayload.send_at, "2026-09-15T13:15:00.000Z");
  assert.match(draftPayload.content, /First &lt;paragraph&gt; &amp; safe\./);
  assert.match(draftPayload.content, /Second paragraph\./);
  assert.match(
    draftPayload.content,
    /https:\/\/buthonestly\.io\/cover\.webp\?a=1&amp;b=2/,
  );
  assert.doesNotMatch(draftPayload.content, /MDX prose/);
  assert.equal(
    renderNewsletterContent(candidate, coverUrl),
    draftPayload.content,
  );
});

test("the deployment port rejects an unavailable hook response", async () => {
  const deployment = createDeploymentPort({
    hookUrl: "https://api.cloudflare.com/deploy",
    fetch: async () => new Response("Unavailable", { status: 503 }),
  });

  await assert.rejects(deployment.request(), /returned HTTP 503/);
});

test("the file state port initializes missing state and writes deterministic state", async (testContext) => {
  const directory = await mkdtemp(path.join(tmpdir(), "publication-state-"));
  testContext.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "publication-state.json");
  const state = createFileStatePort({ filePath });

  assert.deepEqual(await state.load(), { version: 1, essays: {} });
  await state.save({
    version: 1,
    essays: {
      zebra: { indexNow: { contentHash: "z" } },
      alpha: { indexNow: { contentHash: "a" } },
    },
  });

  assert.deepEqual(
    Object.keys(JSON.parse(await readFile(filePath, "utf8")).essays),
    ["alpha", "zebra"],
  );
  assert.deepEqual(await readdir(directory), ["publication-state.json"]);
});

test("the IndexNow port accepts 202 and submits the public key contract", async () => {
  let request;
  const indexNow = createIndexNowPort({
    siteUrl: "https://buthonestly.io",
    key: "public-key",
    fetch: async (url, options) => {
      request = { url, options };
      return new Response(null, { status: 202 });
    },
  });
  const urls = ["https://buthonestly.io/example/"];

  await indexNow.submit(urls);

  assert.equal(request.url, "https://api.indexnow.org/indexnow");
  assert.equal(request.options.method, "POST");
  assert.deepEqual(JSON.parse(request.options.body), {
    host: "buthonestly.io",
    key: "public-key",
    keyLocation: "https://buthonestly.io/public-key.txt",
    urlList: urls,
  });
});

const essay = (slug, overrides = {}) => ({
  slug,
  publishedAt: new Date("2026-09-15T13:00:00.000Z"),
  publicContentHash: `${slug}-current`,
  canonicalUrl: `https://buthonestly.io/${slug}/`,
  categories: [
    {
      canonicalUrl: "https://buthonestly.io/section/programming/",
    },
  ],
  tags: [
    {
      canonicalUrl: "https://buthonestly.io/topic/testing/",
    },
  ],
  ...overrides,
});

const createHarness = ({
  now = new Date("2026-09-15T12:59:59.999Z"),
  essays = [essay("scheduled")],
  initialState = { version: 1, essays: {} },
  productionVersions = {},
  deploymentError,
  indexNowError,
  stateError,
  kitStatuses,
  kitDraftMatch,
  kitCreateError,
  kitDeliveryError,
} = {}) => {
  const calls = {
    sleeps: [],
    production: [],
    deployments: 0,
    submissions: [],
    saves: [],
    kitSearches: [],
    kitDrafts: [],
    kitInspections: [],
    kitDeliveries: [],
  };
  const queues = new Map(
    Object.entries(productionVersions).map(([slug, versions]) => [
      slug,
      [...versions],
    ]),
  );

  return {
    calls,
    ports: {
      clock: {
        now: () => now,
        sleep: async (milliseconds) => calls.sleeps.push(milliseconds),
      },
      inventory: {
        load: ({ now: inventoryNow }) => ({
          published: essays.filter(
            (candidate) => candidate.publishedAt <= inventoryNow,
          ),
          scheduled: essays.filter(
            (candidate) => candidate.publishedAt > inventoryNow,
          ),
        }),
      },
      state: {
        load: async () => structuredClone(initialState),
        save: async (nextState) => {
          calls.saves.push(structuredClone(nextState));
          if (stateError) throw stateError;
        },
      },
      deployment: {
        request: async () => {
          calls.deployments += 1;
          if (deploymentError) throw deploymentError;
        },
      },
      production: {
        inspect: async (candidate) => {
          calls.production.push(candidate.slug);
          const versions = queues.get(candidate.slug) ?? [];
          const version = versions.shift() ?? null;
          if (version instanceof Error) throw version;
          if (version && typeof version === "object") return version;
          return {
            status: version === null ? "missing" : "reachable",
            contentHash: version,
          };
        },
      },
      indexNow: {
        submit: async (urls) => {
          calls.submissions.push([...urls]);
          if (indexNowError) throw indexNowError;
        },
      },
      ...(kitStatuses
        ? {
            kit: {
              findDraft: async (candidate) => {
                calls.kitSearches.push(candidate.slug);
                return kitDraftMatch ?? null;
              },
              createDraft: async (candidate, coverUrl) => {
                calls.kitDrafts.push({ slug: candidate.slug, coverUrl });
                if (kitCreateError) throw kitCreateError;
                return { id: 700 + calls.kitDrafts.length, status: "draft" };
              },
              inspect: async (broadcastId) => {
                calls.kitInspections.push(broadcastId);
                const statuses = kitStatuses[broadcastId] ?? [];
                return { id: broadcastId, status: statuses.shift() ?? "draft" };
              },
              deliver: async (broadcastId, candidate, coverUrl, sendAt) => {
                calls.kitDeliveries.push({
                  broadcastId,
                  slug: candidate.slug,
                  coverUrl,
                  sendAt,
                });
                if (kitDeliveryError) throw kitDeliveryError;
                return { id: broadcastId, status: "scheduled" };
              },
            },
          }
        : {}),
    },
  };
};

test("a scheduled essay causes no publication action before 13:00 UTC", async () => {
  const { ports, calls } = createHarness();

  const result = await runPublication(ports);

  assert.deepEqual(result, {
    deployed: false,
    submitted: [],
    pending: [],
    stateChanged: false,
    errors: [],
  });
  assert.deepEqual(calls, {
    sleeps: [],
    production: [],
    deployments: 0,
    submissions: [],
    saves: [],
    kitSearches: [],
    kitDrafts: [],
    kitInspections: [],
    kitDeliveries: [],
  });
});

test("a live reader-facing update submits only its canonical URL", async () => {
  const updated = essay("updated");
  const { ports, calls } = createHarness({
    now: new Date("2026-09-16T00:00:00.000Z"),
    essays: [updated],
    initialState: {
      version: 1,
      essays: {
        updated: { indexNow: { contentHash: "previous-public-hash" } },
      },
    },
    productionVersions: { updated: [updated.publicContentHash] },
  });

  const result = await runPublication(ports);

  assert.equal(calls.deployments, 0);
  assert.deepEqual(calls.submissions, [[updated.canonicalUrl]]);
  assert.equal(
    calls.saves[0].essays.updated.indexNow.contentHash,
    updated.publicContentHash,
  );
  assert.deepEqual(result.submitted, ["updated"]);
});

test("an unchanged live essay verifies production without provider mutation or state writes", async () => {
  const unchanged = essay("unchanged");
  const { ports, calls } = createHarness({
    now: new Date("2026-09-16T00:00:00.000Z"),
    essays: [unchanged],
    initialState: {
      version: 1,
      essays: {
        unchanged: {
          indexNow: { contentHash: unchanged.publicContentHash },
        },
      },
    },
    productionVersions: { unchanged: [unchanged.publicContentHash] },
  });

  const result = await runPublication(ports);

  assert.deepEqual(result, {
    deployed: false,
    submitted: [],
    pending: [],
    stateChanged: false,
    errors: [],
  });
  assert.deepEqual(calls.production, ["unchanged"]);
  assert.equal(calls.deployments, 0);
  assert.deepEqual(calls.submissions, []);
  assert.deepEqual(calls.saves, []);
});

test("a stale production version triggers deployment even after IndexNow is complete", async () => {
  const tracked = essay("tracked");
  const { ports, calls } = createHarness({
    now: new Date("2026-09-16T00:00:00.000Z"),
    essays: [tracked],
    initialState: {
      version: 1,
      essays: {
        tracked: { indexNow: { contentHash: tracked.publicContentHash } },
      },
    },
    productionVersions: {
      tracked: ["old-production", tracked.publicContentHash],
    },
  });

  const result = await runPublication(ports);

  assert.equal(calls.deployments, 1);
  assert.deepEqual(calls.submissions, []);
  assert.deepEqual(calls.saves, []);
  assert.deepEqual(result, {
    deployed: true,
    submitted: [],
    pending: [],
    stateChanged: false,
    errors: [],
  });
});

test("an unavailable production origin remains retryable without requesting deployment", async () => {
  const unavailable = essay("unavailable");
  const { ports, calls } = createHarness({
    now: new Date("2026-09-16T00:00:00.000Z"),
    essays: [unavailable],
    productionVersions: {
      unavailable: [
        { status: "unavailable", contentHash: null, detail: "HTTP 500" },
      ],
    },
  });

  const result = await runPublication(ports);

  assert.equal(calls.deployments, 0);
  assert.deepEqual(calls.sleeps, []);
  assert.deepEqual(calls.submissions, []);
  assert.deepEqual(result, {
    deployed: false,
    submitted: [],
    pending: ["unavailable"],
    stateChanged: false,
    errors: ["Production unavailable: unavailable (HTTP 500)"],
  });
});

test("a production network failure remains retryable without requesting deployment", async () => {
  const unreachable = essay("unreachable");
  const { ports, calls } = createHarness({
    now: new Date("2026-09-16T00:00:00.000Z"),
    essays: [unreachable],
    productionVersions: {
      unreachable: [new Error("DNS lookup failed")],
    },
  });

  const result = await runPublication(ports);

  assert.equal(calls.deployments, 0);
  assert.deepEqual(result.pending, ["unreachable"]);
  assert.deepEqual(result.errors, [
    "Production unavailable: unreachable (DNS lookup failed)",
  ]);
});

test("a deployment failure does not discard an independent IndexNow success", async () => {
  const stale = essay("stale");
  const live = essay("live");
  const initialState = {
    version: 1,
    essays: {
      stale: { indexNow: { contentHash: "stale-previous" } },
      live: { indexNow: { contentHash: "live-previous" } },
    },
  };
  const { ports, calls } = createHarness({
    now: new Date("2026-09-16T00:00:00.000Z"),
    essays: [stale, live],
    initialState,
    productionVersions: {
      stale: ["old-production"],
      live: [live.publicContentHash],
    },
    deploymentError: new Error("Cloudflare unavailable"),
  });

  const result = await runPublication(ports);

  assert.deepEqual(calls.sleeps, []);
  assert.deepEqual(calls.submissions, [[live.canonicalUrl]]);
  assert.equal(
    calls.saves[0].essays.live.indexNow.contentHash,
    live.publicContentHash,
  );
  assert.equal(
    calls.saves[0].essays.stale.indexNow.contentHash,
    "stale-previous",
  );
  assert.deepEqual(result, {
    deployed: false,
    submitted: ["live"],
    pending: ["stale"],
    stateChanged: true,
    errors: ["Deployment request failed: Cloudflare unavailable"],
  });
});

test("a failed IndexNow submission remains pending and succeeds on retry without another deployment", async () => {
  const updated = essay("retry-update");
  const initialState = {
    version: 1,
    essays: {
      "retry-update": { indexNow: { contentHash: "previous" } },
    },
  };
  const failed = createHarness({
    now: new Date("2026-09-16T00:00:00.000Z"),
    essays: [updated],
    initialState,
    productionVersions: {
      "retry-update": ["stale", updated.publicContentHash],
    },
    indexNowError: new Error("IndexNow unavailable"),
  });

  const failedResult = await runPublication(failed.ports);

  assert.equal(failed.calls.deployments, 1);
  assert.deepEqual(failed.calls.saves, []);
  assert.deepEqual(failedResult, {
    deployed: true,
    submitted: [],
    pending: ["retry-update"],
    stateChanged: false,
    errors: ["IndexNow submission failed: IndexNow unavailable"],
  });

  const retried = createHarness({
    now: new Date("2026-09-16T00:10:00.000Z"),
    essays: [updated],
    initialState,
    productionVersions: {
      "retry-update": [updated.publicContentHash],
    },
  });
  const retriedResult = await runPublication(retried.ports);

  assert.equal(retried.calls.deployments, 0);
  assert.deepEqual(retriedResult.submitted, ["retry-update"]);
  assert.equal(
    retried.calls.saves[0].essays["retry-update"].indexNow.contentHash,
    updated.publicContentHash,
  );
});

test("an accepted IndexNow submission remains visibly pending when durable state cannot be saved", async () => {
  const updated = essay("unsaved");
  const { ports, calls } = createHarness({
    now: new Date("2026-09-16T00:00:00.000Z"),
    essays: [updated],
    productionVersions: { unsaved: [updated.publicContentHash] },
    stateError: new Error("disk unavailable"),
  });

  const result = await runPublication(ports);

  assert.deepEqual(calls.submissions, [
    [
      updated.canonicalUrl,
      "https://buthonestly.io/",
      "https://buthonestly.io/essays/",
      "https://buthonestly.io/section/programming/",
      "https://buthonestly.io/topic/testing/",
    ],
  ]);
  assert.equal(calls.saves.length, 1);
  assert.deepEqual(result, {
    deployed: false,
    submitted: [],
    pending: ["unsaved"],
    stateChanged: false,
    errors: ["Publication state save failed: disk unavailable"],
  });
});

test("a missing production version stays pending when deployment polling times out", async () => {
  const missing = essay("missing");
  const { ports, calls } = createHarness({
    now: new Date("2026-09-16T00:00:00.000Z"),
    essays: [missing],
    productionVersions: { missing: [null, null, "still-stale"] },
  });
  ports.pollAttempts = 2;
  ports.pollIntervalMs = 5;

  const result = await runPublication(ports);

  assert.equal(calls.deployments, 1);
  assert.deepEqual(calls.sleeps, [5, 5]);
  assert.deepEqual(calls.submissions, []);
  assert.deepEqual(calls.saves, []);
  assert.deepEqual(result, {
    deployed: true,
    submitted: [],
    pending: ["missing"],
    stateChanged: false,
    errors: ["Expected production version did not become live: missing"],
  });
});

test("an unrecorded Kit draft is reconciled and persisted instead of duplicated", async () => {
  const candidate = essay("reconciled", {
    newsletterIntro: "A newsletter introduction.",
  });
  const { ports, calls } = createHarness({
    now: new Date("2026-09-15T13:15:00.000Z"),
    essays: [candidate],
    productionVersions: {
      reconciled: [
        {
          status: "reachable",
          contentHash: candidate.publicContentHash,
          coverUrl: "https://buthonestly.io/cover.webp",
        },
      ],
    },
    kitStatuses: {},
    kitDraftMatch: { id: 611, status: "draft" },
  });

  await runPublication(ports);

  assert.deepEqual(calls.kitSearches, ["reconciled"]);
  assert.deepEqual(calls.kitDrafts, []);
  assert.deepEqual(calls.kitDeliveries, []);
  assert.deepEqual(calls.saves.at(-1).essays.reconciled.newsletter, {
    broadcastId: 611,
    status: "draft",
  });
});

test("a live essay creates and persists one Kit draft without delivering it in the same phase", async () => {
  const candidate = essay("newsletter", {
    title: "A title <with markup>",
    newsletterIntro: "First & safest.\n\nSecond <paragraph>.",
    coverAlt: "A descriptive cover",
  });
  const { ports, calls } = createHarness({
    now: new Date("2026-09-15T13:15:00.000Z"),
    essays: [candidate],
    productionVersions: {
      newsletter: [
        {
          status: "reachable",
          contentHash: candidate.publicContentHash,
          coverUrl: "https://buthonestly.io/_astro/cover.webp",
        },
      ],
    },
    kitStatuses: {},
  });

  await runPublication(ports);

  assert.deepEqual(calls.kitDrafts, [
    {
      slug: "newsletter",
      coverUrl: "https://buthonestly.io/_astro/cover.webp",
    },
  ]);
  assert.deepEqual(calls.kitDeliveries, []);
  assert.deepEqual(calls.saves.at(-1).essays.newsletter.newsletter, {
    broadcastId: 701,
    status: "draft",
  });
});

test("a recorded Kit draft is inspected and delivered only from 13:15 UTC", async () => {
  const candidate = essay("timed", {
    newsletterIntro: "A plain-text introduction.",
  });
  const initialState = {
    version: 1,
    essays: {
      timed: {
        indexNow: { contentHash: candidate.publicContentHash },
        newsletter: { broadcastId: 81, status: "draft" },
      },
    },
  };
  const before = createHarness({
    now: new Date("2026-09-15T13:14:59.999Z"),
    essays: [candidate],
    initialState,
    productionVersions: {
      timed: [
        {
          status: "reachable",
          contentHash: candidate.publicContentHash,
          coverUrl: "https://buthonestly.io/cover.webp",
        },
      ],
    },
    kitStatuses: { 81: ["draft"] },
  });

  await runPublication(before.ports);

  assert.deepEqual(before.calls.kitInspections, [81]);
  assert.deepEqual(before.calls.kitDeliveries, []);

  const ready = createHarness({
    now: new Date("2026-09-15T13:15:00.000Z"),
    essays: [candidate],
    initialState,
    productionVersions: {
      timed: [
        {
          status: "reachable",
          contentHash: candidate.publicContentHash,
          coverUrl: "https://buthonestly.io/cover.webp",
        },
      ],
    },
    kitStatuses: { 81: ["draft"] },
  });

  await runPublication(ready.ports);

  assert.deepEqual(ready.calls.kitDrafts, []);
  assert.deepEqual(ready.calls.kitInspections, [81]);
  assert.deepEqual(ready.calls.kitDeliveries, [
    {
      broadcastId: 81,
      slug: "timed",
      coverUrl: "https://buthonestly.io/cover.webp",
      sendAt: new Date("2026-09-15T13:15:00.000Z"),
    },
  ]);
  assert.deepEqual(ready.calls.saves.at(-1).essays.timed.newsletter, {
    broadcastId: 81,
    status: "delivery-requested",
  });
});

test("a completed recorded broadcast is saved as delivered and never repeated for updates", async () => {
  const candidate = essay("delivered");
  const initialState = {
    version: 1,
    essays: {
      delivered: {
        indexNow: { contentHash: "previous-version" },
        newsletter: { broadcastId: 93, status: "draft" },
      },
    },
  };
  const completed = createHarness({
    now: new Date("2026-09-16T00:00:00.000Z"),
    essays: [candidate],
    initialState,
    productionVersions: {
      delivered: [
        {
          status: "reachable",
          contentHash: candidate.publicContentHash,
          coverUrl: "https://buthonestly.io/cover.webp",
        },
      ],
    },
    kitStatuses: { 93: ["completed"] },
  });

  await runPublication(completed.ports);

  assert.deepEqual(completed.calls.kitDeliveries, []);
  assert.deepEqual(completed.calls.saves.at(-1).essays.delivered.newsletter, {
    broadcastId: 93,
    status: "delivered",
  });

  const updated = essay("delivered", { publicContentHash: "later-update" });
  const suppressed = createHarness({
    now: new Date("2026-09-17T00:00:00.000Z"),
    essays: [updated],
    initialState: completed.calls.saves.at(-1),
    productionVersions: { delivered: [updated.publicContentHash] },
    kitStatuses: {},
  });

  await runPublication(suppressed.ports);

  assert.deepEqual(suppressed.calls.kitDrafts, []);
  assert.deepEqual(suppressed.calls.kitInspections, []);
  assert.deepEqual(suppressed.calls.kitDeliveries, []);
});

test("a crash after Kit accepts delivery recovers by inspecting the recorded broadcast", async () => {
  const candidate = essay("recovered");
  const initialState = {
    version: 1,
    essays: {
      recovered: {
        indexNow: { contentHash: candidate.publicContentHash },
        newsletter: { broadcastId: 115, status: "draft" },
      },
    },
  };
  const failed = createHarness({
    now: new Date("2026-09-16T00:00:00.000Z"),
    essays: [candidate],
    initialState,
    productionVersions: {
      recovered: [
        {
          status: "reachable",
          contentHash: candidate.publicContentHash,
          coverUrl: "https://buthonestly.io/cover.webp",
        },
      ],
    },
    kitStatuses: { 115: ["draft"] },
    stateError: new Error("process crashed before state persisted"),
  });

  await runPublication(failed.ports);

  assert.equal(failed.calls.kitDeliveries.length, 1);

  const retried = createHarness({
    now: new Date("2026-09-16T00:05:00.000Z"),
    essays: [candidate],
    initialState,
    productionVersions: {
      recovered: [
        {
          status: "reachable",
          contentHash: candidate.publicContentHash,
          coverUrl: "https://buthonestly.io/cover.webp",
        },
      ],
    },
    kitStatuses: { 115: ["completed"] },
  });

  await runPublication(retried.ports);

  assert.deepEqual(retried.calls.kitDrafts, []);
  assert.deepEqual(retried.calls.kitDeliveries, []);
  assert.deepEqual(retried.calls.saves.at(-1).essays.recovered.newsletter, {
    broadcastId: 115,
    status: "delivered",
  });
});

test("newsletter failure does not discard an independent IndexNow success", async () => {
  const candidate = essay("partial", {
    newsletterIntro: "A newsletter introduction.",
  });
  const { ports, calls } = createHarness({
    now: new Date("2026-09-16T00:00:00.000Z"),
    essays: [candidate],
    productionVersions: {
      partial: [
        {
          status: "reachable",
          contentHash: candidate.publicContentHash,
          coverUrl: "https://buthonestly.io/cover.webp",
        },
      ],
    },
    kitStatuses: {},
    kitCreateError: new Error("Kit unavailable"),
  });

  const result = await runPublication(ports);

  assert.deepEqual(result.submitted, ["partial"]);
  assert.equal(
    calls.saves.at(-1).essays.partial.indexNow.contentHash,
    candidate.publicContentHash,
  );
  assert.equal(calls.saves.at(-1).essays.partial.newsletter, undefined);
  assert.match(result.errors.join("\n"), /Kit draft creation failed: partial/);
});

test("IndexNow failure does not discard an independent newsletter success", async () => {
  const candidate = essay("newsletter-partial");
  const initialState = {
    version: 1,
    essays: {
      "newsletter-partial": {
        indexNow: { contentHash: "previous" },
        newsletter: { broadcastId: 121, status: "delivery-requested" },
      },
    },
  };
  const { ports, calls } = createHarness({
    now: new Date("2026-09-16T00:00:00.000Z"),
    essays: [candidate],
    initialState,
    productionVersions: {
      "newsletter-partial": [
        {
          status: "reachable",
          contentHash: candidate.publicContentHash,
          coverUrl: "https://buthonestly.io/cover.webp",
        },
      ],
    },
    kitStatuses: { 121: ["completed"] },
    indexNowError: new Error("IndexNow unavailable"),
  });

  const result = await runPublication(ports);

  assert.deepEqual(calls.saves.at(-1).essays["newsletter-partial"].newsletter, {
    broadcastId: 121,
    status: "delivered",
  });
  assert.equal(
    calls.saves.at(-1).essays["newsletter-partial"].indexNow.contentHash,
    "previous",
  );
  assert.match(result.errors.join("\n"), /IndexNow submission failed/);
});

test("the publication state retains legacy IndexNow and newsletter successes", () => {
  const state = JSON.parse(
    readFileSync(
      path.join(repositoryRoot, "data/publication-state.json"),
      "utf8",
    ),
  );
  const migratedSlugs = JSON.parse(
    readFileSync(
      path.join(
        repositoryRoot,
        "test/fixtures/publication/migrated-indexnow-slugs.json",
      ),
      "utf8",
    ),
  );

  assert.equal(migratedSlugs.length, 44);
  for (const slug of migratedSlugs) {
    assert.match(state.essays[slug].indexNow.contentHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(state.essays[slug].newsletter, { status: "delivered" });
  }
  assert.equal(
    existsSync(path.join(repositoryRoot, "data/indexnow-pinged.json")),
    false,
  );
  assert.equal(
    existsSync(path.join(repositoryRoot, "data/newsletter-sent.json")),
    false,
  );
});

test("the publication workflow owns hourly, essay-change, and manual orchestration without state recursion", () => {
  const workflow = readFileSync(
    path.join(repositoryRoot, ".github/workflows/publication.yml"),
    "utf8",
  );

  assert.match(workflow, /cron: ["']5 \* \* \* \*["']/);
  assert.match(workflow, /cron: ["']15 13 \* \* \*["']/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /src\/content\/essays\/\*\*/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(
    workflow,
    /REPOSITORY_DEPLOY_KEY: \$\{\{ secrets\.REPOSITORY_DEPLOY_KEY \}\}/,
  );
  assert.equal(
    workflow.match(/node scripts\/checkpoint-generated-state\.mjs publication/g)
      ?.length,
    2,
  );
  assert.doesNotMatch(workflow, /GIT_SSH_COMMAND|ssh-key:/);
  assert.match(workflow, /group: publication/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.equal(workflow.match(/run: npm run publication/g)?.length, 2);
  assert.match(workflow, /KIT_API_KEY/);
  assert.match(workflow, /Record draft identities and partial successes/);
  assert.match(workflow, /steps\.publication_checkpoint\.outcome == 'success'/);
  assert.match(workflow, /Resume recorded Kit broadcasts/);
  assert.match(workflow, /if: always\(\)/);
  assert.doesNotMatch(workflow, /git add data\/publication-state\.json/);
  assert.doesNotMatch(
    workflow,
    /^\s*- ["']data\/publication-state\.json["']\s*$/m,
  );
  assert.equal(
    existsSync(path.join(repositoryRoot, ".github/workflows/indexnow.yml")),
    false,
  );
  assert.equal(
    existsSync(
      path.join(repositoryRoot, ".github/workflows/scheduled-rebuild.yml"),
    ),
    false,
  );
  assert.equal(
    existsSync(path.join(repositoryRoot, ".github/workflows/newsletter.yml")),
    false,
  );
  assert.equal(
    existsSync(path.join(repositoryRoot, "scripts/notify-subscribers.mjs")),
    false,
  );
});

test("a stale published essay deploys, waits for its expected version, and submits its discovery URLs", async () => {
  const published = essay("new-essay");
  const { ports, calls } = createHarness({
    now: new Date("2026-09-15T13:00:00.000Z"),
    essays: [published],
    productionVersions: {
      "new-essay": ["old-version", published.publicContentHash],
    },
  });

  const result = await runPublication(ports);

  const expectedUrls = [
    published.canonicalUrl,
    "https://buthonestly.io/",
    "https://buthonestly.io/essays/",
    "https://buthonestly.io/section/programming/",
    "https://buthonestly.io/topic/testing/",
  ];
  assert.deepEqual(calls.production, ["new-essay", "new-essay"]);
  assert.equal(calls.deployments, 1);
  assert.deepEqual(calls.sleeps, [30_000]);
  assert.deepEqual(calls.submissions, [expectedUrls]);
  assert.deepEqual(calls.saves, [
    {
      version: 1,
      essays: {
        "new-essay": {
          indexNow: { contentHash: published.publicContentHash },
        },
      },
    },
  ]);
  assert.deepEqual(result, {
    deployed: true,
    submitted: ["new-essay"],
    pending: [],
    stateChanged: true,
    errors: [],
  });
});
