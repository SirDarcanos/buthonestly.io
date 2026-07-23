// The API reports success for audio that quietly dropped or repeated a clause,
// and only the speaking rate gives it away. Comparing each chunk against the
// run's own median points at the minute worth listening to, rather than all of
// them — an absolute band is no use when voice and pace are configurable.

import { pcmDurationSeconds } from "./assemble.mjs";

const PACE_TOLERANCE = 0.35;
const PLAUSIBLE_WPM = [90, 220];

/** @returns {{median: number, outliers: Array<{n, wpm, at, delta, opening}>, implausible: boolean}} */
export function checkPace(chunks, pcms, silenceMs = 0) {
  const stats = chunks.map((text, i) => {
    const seconds = pcmDurationSeconds(pcms[i]);
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return { n: i + 1, seconds, wpm: seconds > 0 ? (words / seconds) * 60 : 0 };
  });

  const rates = stats.map((s) => s.wpm).sort((a, b) => a - b);
  const median = rates[Math.floor(rates.length / 2)] ?? 0;
  if (!median) return { median: 0, outliers: [], implausible: false };

  let at = 0;
  const outliers = [];
  for (const s of stats) {
    const start = at;
    at += s.seconds + silenceMs / 1000;
    const drift = (s.wpm - median) / median;
    if (Math.abs(drift) <= PACE_TOLERANCE) continue;
    outliers.push({
      n: s.n,
      wpm: s.wpm,
      at: start,
      delta: drift * 100,
      opening: chunks[s.n - 1].trim().replace(/\s+/g, " ").slice(0, 60),
    });
  }

  return {
    median,
    outliers,
    implausible: median < PLAUSIBLE_WPM[0] || median > PLAUSIBLE_WPM[1],
  };
}

export function formatPaceReport(
  { median, outliers, implausible },
  total,
  fmt,
) {
  if (!median) return [];
  const lines = [`Median pace ${Math.round(median)} wpm.`];
  if (implausible)
    lines.push(
      `  ! Whole narration reads at ${Math.round(median)} wpm — expected ${PLAUSIBLE_WPM.join("–")}. Check the voice and pace.`,
    );
  if (outliers.length) {
    lines.push(
      `  ! ${outliers.length} chunk(s) off pace — listen there first:`,
    );
    for (const o of outliers) {
      const sign = o.delta > 0 ? "+" : "";
      lines.push(
        `    chunk ${o.n}/${total} at ${fmt(o.at)} — ${Math.round(o.wpm)} wpm (${sign}${Math.round(o.delta)}%): "${o.opening}…"`,
      );
    }
  }
  return lines;
}
