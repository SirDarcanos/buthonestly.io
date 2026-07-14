// Verify internal links in essays resolve: [[wikilinks]] point to real essays,
// and root-relative links (/…, /section/…, /topic/…, /downloads/…) match a real
// route or download. External links and #anchors are not checked. Exits non-zero
// on any broken link so it can gate `npm run lint`.
import fs from "node:fs";
import path from "node:path";

const ESSAYS = "src/content/essays";
const slugify = (n) =>
  n
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const listUnder = (fm, key) => {
  const block =
    fm.match(
      new RegExp(`^${key}:[ \\t]*\\n((?:[ \\t]*-[ \\t]+.+\\n?)+)`, "m"),
    )?.[1] ?? "";
  return [...block.matchAll(/-[ \t]+(.+)/g)].map((m) =>
    m[1].trim().replace(/^["']|["']$/g, ""),
  );
};

const dirs = fs
  .readdirSync(ESSAYS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
const essaySlugs = new Set(dirs);

// Valid routes the site actually builds, plus known standalone pages.
const routes = new Set([
  "/",
  "/privacy/",
  "/artificial-intelligence-tools/",
  "/resources/",
]);
const downloadFiles = new Set();
const essays = [];
for (const slug of dirs) {
  const raw = fs.readFileSync(path.join(ESSAYS, slug, `${slug}.md`), "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const fm = m?.[1] ?? "";
  essays.push({ slug, body: raw.slice(m?.[0].length ?? 0) });
  routes.add(`/${slug}/`);
  for (const c of listUnder(fm, "categories"))
    routes.add(`/section/${slugify(c)}/`);
  for (const t of listUnder(fm, "tags")) routes.add(`/topic/${slugify(t)}/`);
  for (const d of fm.matchAll(/^[ \t]*-[ \t]*file:[ \t]*(\S+)/gm))
    downloadFiles.add(d[1]);
}

const norm = (p) => (p.endsWith("/") || /\.[a-z0-9]+$/i.test(p) ? p : `${p}/`);
const issues = [];
for (const { slug, body } of essays) {
  const clean = body.replace(/```[\s\S]*?```/g, ""); // ignore code blocks
  for (const m of clean.matchAll(/\[\[([^\]|#]+)/g)) {
    const target = m[1].trim();
    if (!essaySlugs.has(target))
      issues.push([slug, "wikilink", `[[${target}]]`]);
  }
  for (const m of clean.matchAll(
    /\]\((\/[^)\s#]*)(?:#[^)\s]*)?(?:[ \t]+"[^"]*")?\)/g,
  )) {
    const p = norm(m[1]);
    if (p.startsWith("/downloads/")) {
      if (!downloadFiles.has(p.slice("/downloads/".length)))
        issues.push([slug, "download", p]);
    } else if (!routes.has(p)) {
      issues.push([slug, "internal", p]);
    }
  }
}

if (issues.length === 0) {
  console.log(
    `✓ Links OK — ${essays.length} essays, all wikilinks and internal links resolve.`,
  );
  process.exit(0);
}
console.error(`✗ ${issues.length} broken internal link(s):\n`);
for (const [slug, kind, link] of issues)
  console.error(`  ${slug}  [${kind}]  ${link}`);
process.exit(1);
