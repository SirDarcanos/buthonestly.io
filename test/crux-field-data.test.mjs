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
    metrics: { lcpMs: 1800, cls: 0.08, inpMs: 175 },
  });
  assert.deepEqual(normalizeCruxRecord({}, "/rare/"), {
    scope: "/rare/",
    status: "insufficient field data",
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
      metrics: null,
    },
  );
  assert.throws(
    () =>
      normalizeCruxRecord(
        {
          record: {
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
  const port = createCruxPort({ apiKey: "" });
  const result = await port.origin("https://buthonestly.io");
  assert.match(result.status, /CRUX_API_KEY is not set/);
  assert.equal(result.metrics, null);
});

test("CrUX requests use mobile origin and URL scopes and normalize insufficient coverage", async () => {
  const requests = [];
  const responses = [Response.json(fixture), new Response("", { status: 404 })];
  const port = createCruxPort({
    apiKey: "narrow-key",
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return responses.shift();
    },
  });
  const result = await collectCruxFieldData({ port, routes: ["/"] });

  assert.equal(
    result.source,
    "Chrome UX Report (CrUX), separate from Search Console",
  );
  assert.equal(result.origin.status, "available");
  assert.equal(result.urls[0].status, "insufficient field data");
  assert.deepEqual(
    requests.map(({ body }) => body),
    [
      { origin: "https://buthonestly.io", formFactor: "PHONE" },
      { url: "https://buthonestly.io/", formFactor: "PHONE" },
    ],
  );
  assert.ok(requests.every(({ url }) => url.endsWith("?key=narrow-key")));
});

test("CrUX provider errors remain explicit field-data results", async () => {
  const port = createCruxPort({
    apiKey: "key",
    fetch: async () => new Response("bad", { status: 503 }),
  });
  const result = await port.url("https://buthonestly.io/");
  assert.equal(result.status, "field data provider error: HTTP 503");
  assert.equal(result.metrics, null);
});
