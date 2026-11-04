import assert from "node:assert/strict";
import test from "node:test";
import { parseEssayFrontmatter } from "../src/lib/essay-frontmatter.mjs";

test("essay frontmatter preserves dates, YAML values, and exact body spacing", () => {
  const source =
    "---\ntitle: Example\ndate: 2026-01-02\nsticky: true\ntags: [AI, Software]\nnewsletterIntro: |\n  First paragraph.\n\n  Second paragraph.\n---\n\nBody.\n";
  const parsed = parseEssayFrontmatter(source);
  assert.equal(parsed.data.title, "Example");
  assert.equal(parsed.data.date.toISOString(), "2026-01-02T00:00:00.000Z");
  assert.equal(parsed.data.sticky, true);
  assert.deepEqual(parsed.data.tags, ["AI", "Software"]);
  assert.equal(
    parsed.data.newsletterIntro,
    "First paragraph.\n\nSecond paragraph.\n",
  );
  assert.equal(parsed.content, "\nBody.\n");
});

test("essay parsing preserves CRLF bodies and accepts a BOM", () => {
  assert.deepEqual(
    parseEssayFrontmatter("\uFEFF---\r\ntitle: Example\r\n---\r\nBody.\r\n"),
    {
      data: { title: "Example" },
      content: "Body.\r\n",
    },
  );
});

test("unmarked content stays unchanged and invalid YAML is rejected", () => {
  assert.deepEqual(parseEssayFrontmatter("\nBody.\n"), {
    data: {},
    content: "\nBody.\n",
  });
  assert.throws(() =>
    parseEssayFrontmatter("---\ntitle: [broken\n---\nBody.\n"),
  );
});
