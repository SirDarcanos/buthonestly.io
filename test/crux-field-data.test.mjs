import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  collectCruxFieldData,
  createCruxPort,
  normalizeCruxRecord,
} from "../src/lib/crux-field-data.mjs";

const fixture = JSON.parse(
  await readFile(
    new URL("./fixtures/crux/available.json", import.meta.url),
    "utf8",
  ),
);

test("CrUX records normalize p75 field data without pass/fail claims", () => {
  assert.deepEqual(normalizeCruxRecord(fixture, "/"), {
    scope: "/",
    status: "available",
    collectionPeriod: { start: "2026-02-20", end: "2026-03-19" },
    metrics: { lcpMs: 1800, cls: 0.08, inpMs: 175 },
  });
  assert.deepEqual(normalizeCruxRecord({}, "/rare/"), {
    scope: "/rare/",
    status: "insufficient field data",
    collectionPeriod: null,
    metrics: null,
  });
  assert.deepEqual(
    normalizeCruxRecord(
      {
        record: {
          metrics: {
            largest_contentful_paint: { percentiles: { p75: 1800 } },
            cumulative_layout_shift: { percentiles: { p75: 0.08 } },
          },
        },
      },
      "/partial/",
    ),
    {
      scope: "/partial/",
      status: "insufficient field data",
      collectionPeriod: null,
      metrics: null,
    },
  );
  assert.throws(
    () =>
      normalizeCruxRecord(
        {
          record: {
            collectionPeriod: fixture.record.collectionPeriod,
            metrics: {
              largest_contentful_paint: {},
              cumulative_layout_shift: { percentiles: { p75: 0.08 } },
              interaction_to_next_paint: { percentiles: { p75: 175 } },
            },
          },
        },
        "/malformed/",
      ),
    /malformed largest_contentful_paint/,
  );
});

test("an absent dedicated credential is explicit and neutral", async () => {
  let requests = 0;
  const port = createCruxPort({
    apiKey: "",
    fetch: async () => {
      requests += 1;
      return Response.json(fixture);
    },
  });
  const result = await port.origin("https://buthonestly.io");
  assert.match(result.status, /CRUX_API_KEY is not set/);
  assert.equal(result.collectionPeriod, null);
  assert.equal(result.metrics, null);
  assert.equal(requests, 0);
});

test("CrUX requests use mobile origin and regression-matrix URL scopes", async () => {
  const requests = [];
  const port = createCruxPort({
    apiKey: "narrow-key",
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, body });
      return body.origin
        ? Response.json(fixture)
        : new Response("", { status: 404 });
    },
  });
  const result = await collectCruxFieldData({ port });

  assert.equal(
    result.source,
    "Chrome UX Report (CrUX), separate from Search Console",
  );
  assert.equal(result.origin.status, "available");
  assert.equal(result.urls.length, 4);
  assert.ok(
    result.urls.every(({ status }) => status === "insufficient field data"),
  );
  assert.deepEqual(
    requests.map(({ body }) => body),
    [
      { origin: "https://buthonestly.io", formFactor: "PHONE" },
      { url: "https://buthonestly.io/", formFactor: "PHONE" },
      {
        url: "https://buthonestly.io/when-ai-stops-being-a-tool/",
        formFactor: "PHONE",
      },
      {
        url: "https://buthonestly.io/what-is-a-gpu/",
        formFactor: "PHONE",
      },
      {
        url: "https://buthonestly.io/resources/free-ai-voice-generator/",
        formFactor: "PHONE",
      },
    ],
  );
  assert.ok(requests.every(({ url }) => url.endsWith("?key=narrow-key")));
});

test("CrUX provider and schema errors remain explicit field-data results", async () => {
  const responses = [
    new Response("bad", { status: 503 }),
    Response.json({ record: { metrics: [] } }),
  ];
  const port = createCruxPort({
    apiKey: "key",
    fetch: async () => responses.shift(),
  });

  const providerFailure = await port.url("https://buthonestly.io/");
  assert.equal(providerFailure.status, "field data provider error: HTTP 503");
  assert.equal(providerFailure.collectionPeriod, null);
  assert.equal(providerFailure.metrics, null);

  const malformedResponse = await port.origin("https://buthonestly.io");
  assert.equal(
    malformedResponse.status,
    "field data provider error: CrUX response has malformed metrics.",
  );
  assert.equal(malformedResponse.collectionPeriod, null);
  assert.equal(malformedResponse.metrics, null);
});
