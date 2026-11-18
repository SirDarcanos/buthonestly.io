import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createWindow } from "@mixmark-io/domino";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/components/Newsletter.astro", import.meta.url),
  "utf8",
);
const script = source.match(/<script>([\s\S]*?)<\/script>/i)[1];
const compiled = ts.transpileModule(script, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

async function submit({
  data,
  ok = true,
  fetchError,
  jsonError,
  trackError,
} = {}) {
  const dom = createWindow(`<form data-newsletter>
    <input name="email_address" value="reader@example.com">
    <button type="submit">Subscribe</button>
    <p data-newsletter-status></p>
  </form>`);
  const form = dom.document.querySelector("form");
  const input = form.querySelector("input");
  const button = form.querySelector("button");
  const status = form.querySelector("p");
  status.dataset = {};
  const requests = [];
  const redirects = [];
  const tracked = [];
  form.reset = () => {
    input.value = "";
  };
  runInNewContext(compiled, {
    exports: {},
    require: () => ({
      track: (name) => {
        tracked.push(name);
        if (trackError) throw trackError;
      },
    }),
    document: dom.document,
    window: { location: { assign: (url) => redirects.push(String(url)) } },
    URL,
    URLSearchParams,
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (fetchError) throw fetchError;
      return {
        ok,
        json: async () => {
          if (jsonError) throw jsonError;
          return data;
        },
      };
    },
  });
  const event = new dom.Event("submit", { cancelable: true });
  form.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(button.disabled, true);
  assert.equal(status.dataset.state, "pending");
  await new Promise((resolve) => setImmediate(resolve));
  return { input, button, status, requests, redirects, tracked };
}

test("Kit quarantine continues to the provider security check without reporting success", async () => {
  const url =
    "https://app.kit.com/forms/guards/1692b76e-35e9-4e5e-8cb7-5aae5eca8981";
  const result = await submit({ data: { status: "quarantined", url } });
  assert.deepEqual(result.redirects, [url]);
  assert.equal(result.input.value, "reader@example.com");
  assert.equal(result.status.dataset.state, "pending");
  assert.match(result.status.textContent, /security check/i);
  assert.deepEqual(result.tracked, []);
  assert.equal(result.button.disabled, false);
});

for (const options of [
  { ok: false, data: { status: "success" } },
  { fetchError: new Error("Network request failed") },
  { jsonError: new SyntaxError("Invalid JSON") },
]) {
  test(`transport failure preserves the email: ${Object.keys(options)[0]}`, async () => {
    const result = await submit(options);
    assert.equal(result.status.dataset.state, "error");
    assert.equal(
      result.status.textContent,
      "That didn't go through. Please try again.",
    );
    assert.equal(result.input.value, "reader@example.com");
    assert.equal(result.button.disabled, false);
    assert.deepEqual(result.tracked, []);
    assert.deepEqual(result.redirects, []);
  });
}

for (const url of [
  undefined,
  "javascript:alert(1)",
  "http://app.kit.com/forms/guards/abc123",
  "https://example.com/forms/guards/abc123",
  "https://app.kit.com.evil.example/forms/guards/abc123",
  "https://user:password@app.kit.com/forms/guards/abc123",
  "https://app.kit.com/unexpected",
]) {
  test(`invalid guard URL never navigates: ${url}`, async () => {
    const result = await submit({ data: { status: "quarantined", url } });
    assert.equal(result.status.dataset.state, "error");
    assert.equal(result.input.value, "reader@example.com");
    assert.equal(result.button.disabled, false);
    assert.deepEqual(result.redirects, []);
    assert.deepEqual(result.tracked, []);
  });
}

for (const trackError of [undefined, new Error("analytics unavailable")]) {
  test(`confirmed signup remains successful with analytics ${trackError ? "throwing" : "available"}`, async () => {
    const result = await submit({ data: { status: "success" }, trackError });
    assert.equal(result.status.dataset.state, "ok");
    assert.match(result.status.textContent, /check your inbox to confirm/i);
    assert.equal(result.input.value, "");
    assert.equal(result.button.disabled, false);
    assert.deepEqual(result.tracked, ["Newsletter subscribed"]);
    assert.deepEqual(result.redirects, []);
    assert.equal(result.requests.length, 1);
    assert.equal(
      result.requests[0].url,
      "https://app.kit.com/forms/9685650/subscriptions",
    );
    assert.equal(result.requests[0].options.method, "POST");
    assert.equal(
      result.requests[0].options.body,
      "email_address=reader%40example.com",
    );
  });
}

for (const data of [
  { status: "failed" },
  {
    status: "failed",
    errors: {
      fields: ["email_address"],
      messages: ["Email address is invalid"],
    },
  },
  { status: "success", errors: ["Invalid email"] },
  { status: "success", errors: { messages: ["Invalid email"] } },
  { status: "unexpected" },
  {},
  null,
]) {
  test(`unsuccessful Kit response preserves the email: ${JSON.stringify(data)}`, async () => {
    const result = await submit({ data });
    assert.equal(result.status.dataset.state, "error");
    assert.equal(result.input.value, "reader@example.com");
    assert.equal(result.button.disabled, false);
    assert.deepEqual(result.tracked, []);
    assert.deepEqual(result.redirects, []);
  });
}
