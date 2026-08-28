export const PUBLISH_HOUR_UTC = 13;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const atPublishHour = (date) => {
  const publishedAt = new Date(date);
  publishedAt.setUTCHours(PUBLISH_HOUR_UTC, 0, 0, 0);
  return publishedAt;
};

export function publishDate(value) {
  if (value == null || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(+value) ? null : atPublishHour(value);
  }

  const authoredDate = String(value)
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2");
  if (!DATE_ONLY.test(authoredDate)) return null;

  const parsed = new Date(`${authoredDate}T00:00:00.000Z`);
  if (
    Number.isNaN(+parsed) ||
    parsed.toISOString().slice(0, 10) !== authoredDate
  ) {
    return null;
  }
  return atPublishHour(parsed);
}
