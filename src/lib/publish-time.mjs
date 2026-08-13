// One reading of a frontmatter `date`, shared by the content schema and by every
// script that decides when an essay goes live. Seven places used to parse the
// field independently, which is how they drift.
//
// YAML already resolves a naive timestamp to UTC, so `2026-09-15T13:00:00` means
// the same moment everywhere. What it does not solve is a date with no time:
// that arrives as UTC midnight, which would publish an essay at 2am in Bucharest
// and hours before anyone is reading.

// Before the newsletter cron at 13:30 UTC, with margin for the hourly deploy
// job at :05 and the Cloudflare build. An essay live after 13:30 waits about
// 21 hours for the next send.
export const PUBLISH_HOUR_UTC = 13;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const isUtcMidnight = (d) =>
  d.getUTCHours() === 0 &&
  d.getUTCMinutes() === 0 &&
  d.getUTCSeconds() === 0 &&
  d.getUTCMilliseconds() === 0;

const atPublishHour = (d) => {
  const out = new Date(d);
  out.setUTCHours(PUBLISH_HOUR_UTC, 0, 0, 0);
  return out;
};
const NAIVE_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?$/;

/**
 * Resolve a frontmatter date to the moment the essay actually goes live.
 *
 * A time that was written down is kept as-is and read as UTC. A date with no
 * time takes {@link PUBLISH_HOUR_UTC}, whether YAML handed it over as a string
 * or as a midnight Date.
 *
 * @param value raw frontmatter value: `2026-09-15`, `2026-09-15T13:00:00`, a
 *   string carrying an offset, or an already-parsed Date
 * @returns a Date, or null when the value is missing or unparseable
 */
export function publishDate(value) {
  if (value == null || value === "") return null;

  // YAML hands over a Date for `2026-09-15` as readily as for a full timestamp,
  // so a midnight-UTC value is how "no time given" actually arrives. No essay
  // has ever wanted 00:00 deliberately.
  if (value instanceof Date) {
    if (Number.isNaN(+value)) return null;
    return isUtcMidnight(value) ? atPublishHour(value) : value;
  }

  const raw = String(value)
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!raw) return null;

  // A date with no time takes the standard slot rather than midnight, which
  // would put the essay live at 2am in Bucharest.
  if (DATE_ONLY.test(raw)) return atPublishHour(new Date(`${raw}T00:00:00Z`));

  if (NAIVE_DATETIME.test(raw)) {
    const [d, t] = raw.split(/[T ]/);
    return new Date(`${d}T${t.length === 5 ? `${t}:00` : t}Z`);
  }

  const parsed = new Date(raw);
  return Number.isNaN(+parsed) ? null : parsed;
}
