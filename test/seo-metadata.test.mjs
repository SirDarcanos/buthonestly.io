import assert from "node:assert/strict";
import test from "node:test";

import { essaySeoMetadata } from "../src/lib/seo-metadata.mjs";

test("essay SEO metadata defaults to the visible title and excerpt", () => {
  assert.deepEqual(
    essaySeoMetadata({
      title: "Visible title",
      excerpt: "Visible excerpt.",
    }),
    {
      title: "Visible title",
      description: "Visible excerpt.",
    },
  );
});

test("essay SEO metadata uses optional search overrides", () => {
  assert.deepEqual(
    essaySeoMetadata({
      title: "Visible title",
      excerpt: "Visible excerpt.",
      seoTitle: "Search title",
      seoDescription: "Search description.",
    }),
    {
      title: "Search title",
      description: "Search description.",
    },
  );
});

test("essay SEO descriptions remain capped at 160 characters", () => {
  const description = essaySeoMetadata({
    title: "Title",
    excerpt: "unused",
    seoDescription: `${"word ".repeat(40)}ending`,
  }).description;

  assert.ok(description.length <= 160);
  assert.equal(description.endsWith("…"), true);
});
