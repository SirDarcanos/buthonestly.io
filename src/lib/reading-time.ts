const WORDS_PER_MINUTE = 225;
const segmenter = new Intl.Segmenter("en", { granularity: "word" });

function countWords(input: string): number {
  const text = input
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images (drop alt + URL)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/<[^>]+>/g, " ") // HTML tags
    .replace(/[#>*_`~|-]/g, " ") // Markdown syntax
    .replace(/&[a-z0-9#]+;/gi, " ") // HTML entities
    .replace(/\s+/g, " ")
    .trim();

  let words = 0;
  for (const segment of segmenter.segment(text)) {
    if (segment.isWordLike) words++;
  }
  return words;
}

export function readingMinutes(
  input: string,
  wpm: number = WORDS_PER_MINUTE,
): number {
  return Math.max(1, Math.round(countWords(input) / wpm));
}

/** e.g. "14 min read" */
export function readingTimeLabel(
  input: string,
  wpm: number = WORDS_PER_MINUTE,
): string {
  return `${readingMinutes(input, wpm)} min read`;
}
