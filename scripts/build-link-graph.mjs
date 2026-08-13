// Maps the editorial internal links between essays — the ones written into the
// prose, not the ones the site generates. The related-posts block, taxonomy
// links and the footer already give every essay inbound links automatically, so
// counting those would report a healthy graph no matter what was written. Only
// authored links say anything about topical spread.
//
// Output (committed): data/link-graph.json — { slug: { out, in, cornerstone } }.
// `in` is derivable from `out`, but storing it makes a diff read "this essay
// gained an inbound link" instead of leaving you to recompute it by hand.
//
// Advisory by default, like lint-essay. `--strict` exits non-zero so CI can
// gate on it.
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { publishDate } from "../src/lib/publish-time.mjs";

const ESSAYS = "src/content/essays";
const OUT_FILE = "data/link-graph.json";
const STRICT = process.argv.includes("--strict");

// A cluster this sparse isn't a cluster, it's a coincidence of tagging.
const MIN_DENSITY = 0.5;

const read = (slug) => {
  const dir = path.join(ESSAYS, slug);
  const md = fs.readdirSync(dir).find((f) => f.endsWith(".md"));
  return md ? matter(fs.readFileSync(path.join(dir, md), "utf8")) : null;
};

const slugs = fs
  .readdirSync(ESSAYS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const essays = new Map();
for (const slug of slugs) {
  const file = read(slug);
  if (file) essays.set(slug, file);
}

const known = new Set(essays.keys());
const now = new Date();

/**
 * Editorial links only: wikilinks and Markdown links to an internal essay path.
 * The AI-summary callout is stripped first — its "Read more" is boilerplate
 * that appears on every essay and would flatten the graph.
 */
function linksFrom(body) {
  const prose = body.replace(/^> \[!summary\][\s\S]*?(?=\n\n)/, "");
  const wiki = [...prose.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)];
  const md = [...prose.matchAll(/\]\(\/([a-z0-9-]+)\/\)/g)];
  return [...wiki, ...md].map((m) => m[1].trim());
}

const graph = {};
for (const [slug, file] of essays) {
  const targets = linksFrom(file.content).filter(
    (t) => known.has(t) && t !== slug,
  );
  graph[slug] = { out: [...new Set(targets)].sort(), in: [] };
}
for (const [slug, node] of Object.entries(graph)) {
  for (const target of node.out) graph[target].in.push(slug);
}

const meta = (slug) => {
  const d = essays.get(slug).data;
  const date = publishDate(d.date);
  return {
    title: d.title ?? slug,
    date,
    scheduled: !!date && date > now,
    cornerstone: d.cornerstone === true,
    tags: d.tags ?? [],
    categories: d.categories ?? [],
  };
};

for (const slug of Object.keys(graph)) {
  graph[slug].in.sort();
  if (meta(slug).cornerstone) graph[slug].cornerstone = true;
}

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(graph, null, 2) + "\n");

// ── Report ────────────────────────────────────────────────────────────
const all = [...known];
const byDate = (a, b) => (meta(b).date ?? 0) - (meta(a).date ?? 0);
const label = (s) =>
  `${meta(s).date?.toISOString().slice(0, 10) ?? "          "}  ${s}${meta(s).scheduled ? "  [scheduled]" : ""}`;

// A link only exists for readers and crawlers once its source is published, so
// counting a scheduled essay's links would report a connectedness the live site
// doesn't have. Orphans and density are judged live; the pending links are shown
// separately, since those are exactly what the backfill queue is made of.
const live = all.filter((s) => !meta(s).scheduled);
const liveIn = (s) => graph[s].in.filter((t) => !meta(t).scheduled);
const pendingIn = (s) => graph[s].in.filter((t) => meta(t).scheduled);

const total = Object.values(graph).reduce((n, g) => n + g.out.length, 0);
const liveTotal = live.reduce((n, s) => n + graph[s].out.length, 0);
const orphans = live.filter((s) => liveIn(s).length === 0).sort(byDate);
const unlanded = all
  .filter((s) => meta(s).scheduled && graph[s].in.length === 0)
  .sort(byDate);
const deadEnds = all.filter((s) => graph[s].out.length === 0).sort(byDate);
const cornerstones = all.filter((s) => meta(s).cornerstone);

console.log(
  `\n${all.length} essays (${live.length} live, ${all.length - live.length} scheduled) · ` +
    `${total} editorial links, ${liveTotal} live · ${(liveTotal / live.length).toFixed(2)} per live essay\n`,
);

const section = (title, items, render = label) => {
  console.log(`${title} (${items.length})`);
  for (const i of items) console.log(`  ${render(i)}`);
  console.log("");
};

if (orphans.length)
  section("NO LIVE ESSAY LINKS IN", orphans, (s) => {
    const pending = pendingIn(s);
    return `${label(s)}${pending.length ? `  ← pending: ${pending.join(", ")}` : ""}`;
  });
if (unlanded.length) section("SCHEDULED, NOTHING LINKS IN YET", unlanded);
if (deadEnds.length) section("LINKS OUT TO NOTHING", deadEnds);

const clusters = new Map();
for (const s of all)
  for (const t of meta(s).tags)
    clusters.set(t, [...(clusters.get(t) ?? []), s]);

const thin = [];
console.log("CLUSTERS");
for (const [tag, members] of [...clusters].sort(
  (a, b) => b[1].length - a[1].length,
)) {
  if (members.length < 3) continue;
  const set = new Set(members);
  const onAir = members.filter((s) => !meta(s).scheduled);
  const inside = onAir.reduce(
    (n, s) =>
      n + graph[s].out.filter((t) => set.has(t) && !meta(t).scheduled).length,
    0,
  );
  const density = onAir.length ? inside / onAir.length : 0;
  const stone = members.filter((s) => meta(s).cornerstone);
  const linked = stone.length
    ? onAir.filter((s) => graph[s].out.some((t) => stone.includes(t))).length
    : 0;
  const queued = members.length - onAir.length;
  const flag = density < MIN_DENSITY ? " ← thin" : "";
  if (density < MIN_DENSITY) thin.push(tag);
  console.log(
    `  ${tag.padEnd(16)} ${String(onAir.length).padStart(2)} live${queued ? `+${queued}` : "  "}  ` +
      `${String(inside).padStart(2)} links  density ${density.toFixed(2)}` +
      `  cornerstone: ${stone.length ? `${linked}/${onAir.length} link to it` : "none"}${flag}`,
  );
}
console.log("");

if (cornerstones.length) {
  console.log(`CORNERSTONES (${cornerstones.length})`);
  for (const s of cornerstones.sort(byDate))
    console.log(`  ${String(liveIn(s).length).padStart(2)} live inbound  ${s}`);
  console.log("");
}

const ranked = live.sort((a, b) => liveIn(b).length - liveIn(a).length);
section(
  "MOST LINKED TO (live)",
  ranked.slice(0, 5),
  (s) => `${String(liveIn(s).length).padStart(2)}x  ${s}`,
);

const problems = orphans.length + deadEnds.length + thin.length;
console.log(
  `${OUT_FILE} written — ${orphans.length} live orphan(s), ${unlanded.length} scheduled with no inbound, ` +
    `${deadEnds.length} dead end(s), ${thin.length} thin cluster(s).`,
);
if (STRICT && problems) {
  console.error(`\n${problems} issue(s) — advisory unless --strict.`);
  process.exit(1);
}
