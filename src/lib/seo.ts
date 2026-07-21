// Helpers for page-level SEO metadata shared across the paginated templates.

/** Clamp to `max` characters at a word boundary, for meta descriptions. */
export function clamp(text: string, max = 160): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > 0 ? lastSpace : max).trimEnd()}…`;
}

interface PageInfo {
  currentPage: number;
  lastPage: number;
}

/**
 * Page 2+ of a paginated archive otherwise ships byte-identical <title> and
 * meta description to page 1, which reads as duplicate content. These make each
 * page unique.
 *
 * Page 1 is returned untouched — it's the page that actually ranks, so it keeps
 * the hand-written copy exactly as written.
 */
export function paginatedTitle(base: string, page: PageInfo): string {
  return page.currentPage === 1 ? base : `${base} — Page ${page.currentPage}`;
}

export function paginatedDescription(
  base: string | undefined,
  page: PageInfo,
): string | undefined {
  if (page.currentPage === 1) return base;
  const prefix = `Page ${page.currentPage} of ${page.lastPage}.`;
  // Prefix rather than suffix: the page number is the part that makes this
  // description unique, so it must survive truncation.
  return clamp(base ? `${prefix} ${base}` : prefix);
}
