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
 * Page 2+ would otherwise ship a byte-identical title and description to page 1.
 * Page 1 is left untouched — it's the one that ranks.
 */
export function paginatedTitle(base: string, page: PageInfo): string {
  return page.currentPage === 1 ? base : `${base} — Page ${page.currentPage}`;
}

export function paginatedDescription(
  base: string | undefined,
  page: PageInfo,
): string | undefined {
  if (page.currentPage === 1) return base;
  // Prefixed so the page number survives truncation — it's what makes it unique.
  const prefix = `Page ${page.currentPage} of ${page.lastPage}.`;
  return clamp(base ? `${prefix} ${base}` : prefix);
}
