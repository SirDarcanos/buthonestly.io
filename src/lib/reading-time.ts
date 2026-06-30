/**
 * Reading-time estimate.
 */

const WORDS_PER_MINUTE = 225;
const segmenter = new Intl.Segmenter("en", { granularity: "word" });

/** Number of words in `input`, after stripping HTML tags + entities. */
function countWords(input: string): number {
  const text = input
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  let words = 0;
  for (const segment of segmenter.segment(text)) {
    if (segment.isWordLike) words++;
  }
  return words;
}

/** Estimated reading time in whole minutes (always ≥ 1). */
export function readingMinutes(
  input: string,
  wpm: number = WORDS_PER_MINUTE,
): number {
  return Math.max(1, Math.round(countWords(input) / wpm));
}

/** Formatted label for a byline, e.g. "14 min read". */
export function readingTimeLabel(
  input: string,
  wpm: number = WORDS_PER_MINUTE,
): string {
  return `${readingMinutes(input, wpm)} min read`;
}
