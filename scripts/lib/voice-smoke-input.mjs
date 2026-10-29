import { createWindow } from "@mixmark-io/domino";

export function essaySpeechText(html) {
  const document = createWindow(html).document;
  const prose = document.querySelector("article .post-content");
  if (!prose) throw new Error("No rendered essay prose found.");
  return Array.from(prose.children)
    .filter((element) =>
      ["P", "H2", "H3", "UL", "OL", "BLOCKQUOTE"].includes(element.tagName),
    )
    .map((element) => element.textContent.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

export function essayLongSentence(prose) {
  return (
    prose
      .replace(/[.!?;:]/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 350)
      .join(" ") + "."
  );
}
