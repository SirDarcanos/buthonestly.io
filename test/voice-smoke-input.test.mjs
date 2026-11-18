import assert from "node:assert/strict";
import test from "node:test";

let input;
try {
  input = await import("../scripts/lib/voice-smoke-input.mjs");
} catch (error) {
  if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
}

test("essay smoke input includes the authored prose in order, without summaries or captions", () => {
  assert.equal(typeof input?.essaySpeechText, "function");
  const html =
    '<article><div class="post-content"><audio></audio><details><p>Summary duplicate</p></details><p>First <a href="/">paragraph</a>.</p><h2>Heading</h2><figure><figcaption>Credit</figcaption></figure><blockquote><p>A quotation.</p></blockquote><p>The ending.</p></div></article>';
  assert.equal(
    input.essaySpeechText(html),
    "First paragraph.\n\nHeading\n\nA quotation.\n\nThe ending.",
  );
  assert.throws(() => input.essaySpeechText("<html>No essay</html>"), /essay/i);
});

test("long-sentence stress input uses ordered essay words with only punctuation changed", () => {
  assert.equal(typeof input?.essayLongSentence, "function");
  const prose = "First sentence. Second sentence? Third sentence! ".repeat(100);
  const sentence = input.essayLongSentence(prose);
  assert.equal(sentence.trim().split(/\s+/).length, 350);
  assert.equal((sentence.match(/[.!?]/g) || []).length, 1);
  assert.ok(
    sentence.startsWith("First sentence Second sentence Third sentence"),
  );
});
