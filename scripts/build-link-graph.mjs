import fs from "node:fs";
import path from "node:path";
import { loadEssayInventory } from "../src/lib/essay-inventory.mjs";
import { buildInternalLinkGraph } from "../src/lib/internal-prose-links.mjs";

const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
};

const essaysDirectory = valueAfter("--essays-dir") ?? "src/content/essays";
const outputPath = valueAfter("--json");
if (
  (process.argv.includes("--essays-dir") && !essaysDirectory) ||
  (process.argv.includes("--json") && !outputPath)
) {
  console.error(
    "Usage: node scripts/build-link-graph.mjs [--essays-dir <path>] [--json <path>]",
  );
  process.exit(2);
}

const inventory = loadEssayInventory({ essaysDirectory });
const graph = buildInternalLinkGraph(inventory);
const bySlug = inventory.bySlug;
const publishedSlugs = new Set(inventory.published.map(({ slug }) => slug));
const scheduledSlugs = new Set(inventory.scheduled.map(({ slug }) => slug));
const all = Object.keys(graph);
const published = all.filter((slug) => publishedSlugs.has(slug));
const liveInbound = (slug) =>
  graph[slug].in.filter((source) => publishedSlugs.has(source));
const pendingInbound = (slug) =>
  graph[slug].in.filter((source) => scheduledSlugs.has(source));
const byDate = (left, right) =>
  bySlug.get(right).publishedAt - bySlug.get(left).publishedAt;
const label = (slug) => {
  const essay = bySlug.get(slug);
  return `${essay.publicationDay}  ${slug}${scheduledSlugs.has(slug) ? "  [scheduled]" : ""}`;
};
const section = (title, items, render = label) => {
  console.log(`${title} (${items.length})`);
  for (const item of items) console.log(`  ${render(item)}`);
  console.log("");
};

const total = Object.values(graph).reduce(
  (count, node) => count + node.out.length,
  0,
);
const publishedTotal = published.reduce(
  (count, slug) => count + graph[slug].out.length,
  0,
);
const orphans = published
  .filter((slug) => liveInbound(slug).length === 0)
  .sort(byDate);
const unlanded = inventory.scheduled
  .map(({ slug }) => slug)
  .filter((slug) => graph[slug].in.length === 0)
  .sort(byDate);
const deadEnds = all
  .filter((slug) => graph[slug].out.length === 0)
  .sort(byDate);
const cornerstones = all
  .filter((slug) => bySlug.get(slug).cornerstone)
  .sort(byDate);

console.log(
  `\n${all.length} essays (${published.length} published, ${inventory.scheduled.length} scheduled) · ` +
    `${total} editorial links, ${publishedTotal} published · ` +
    `${published.length ? (publishedTotal / published.length).toFixed(2) : "0.00"} per published essay\n`,
);

if (orphans.length) {
  section("NO LIVE ESSAY LINKS IN", orphans, (slug) => {
    const pending = pendingInbound(slug);
    return `${label(slug)}${pending.length ? `  ← pending: ${pending.join(", ")}` : ""}`;
  });
}
if (unlanded.length) section("SCHEDULED, NOTHING LINKS IN YET", unlanded);
if (deadEnds.length) section("LINKS OUT TO NOTHING", deadEnds);

const clusters = new Map();
for (const essay of inventory.essays) {
  for (const { name } of essay.tags) {
    clusters.set(name, [...(clusters.get(name) ?? []), essay.slug]);
  }
}

const minimumDensity = 0.5;
const thinClusters = [];
console.log("CLUSTERS");
for (const [tag, members] of [...clusters].sort(
  (left, right) =>
    right[1].length - left[1].length || left[0].localeCompare(right[0]),
)) {
  if (members.length < 3) continue;
  const memberSlugs = new Set(members);
  const onAir = members.filter((slug) => publishedSlugs.has(slug));
  const inside = onAir.reduce(
    (count, slug) =>
      count +
      graph[slug].out.filter(
        (target) => memberSlugs.has(target) && publishedSlugs.has(target),
      ).length,
    0,
  );
  const density = onAir.length ? inside / onAir.length : 0;
  const stones = members.filter((slug) => bySlug.get(slug).cornerstone);
  const linkedToStone = stones.length
    ? onAir.filter((slug) =>
        graph[slug].out.some((target) => stones.includes(target)),
      ).length
    : 0;
  const queued = members.length - onAir.length;
  if (density < minimumDensity) thinClusters.push(tag);
  console.log(
    `  ${tag.padEnd(16)} ${String(onAir.length).padStart(2)} published${queued ? `+${queued}` : "  "}  ` +
      `${String(inside).padStart(2)} links  density ${density.toFixed(2)}` +
      `  cornerstone: ${stones.length ? `${linkedToStone}/${onAir.length} link to it` : "none"}` +
      `${density < minimumDensity ? " ← thin" : ""}`,
  );
}
console.log("");

if (cornerstones.length) {
  section(
    "CORNERSTONES",
    cornerstones,
    (slug) =>
      `${String(liveInbound(slug).length).padStart(2)} published inbound  ${slug}`,
  );
}

const ranked = [...published].sort(
  (left, right) =>
    liveInbound(right).length - liveInbound(left).length ||
    left.localeCompare(right),
);
section(
  "MOST LINKED TO (published)",
  ranked.slice(0, 5),
  (slug) => `${String(liveInbound(slug).length).padStart(2)}x  ${slug}`,
);

console.log(
  `${orphans.length} published orphan(s), ${unlanded.length} scheduled with no inbound, ` +
    `${deadEnds.length} dead end(s), ${thinClusters.length} thin cluster(s).`,
);

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(graph, null, 2)}\n`);
  console.log(`JSON written to ${outputPath}.`);
}
