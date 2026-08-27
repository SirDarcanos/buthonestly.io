// Verify that internal links, essay-local images and covers resolve. External
// links and #anchors are not checked. Exits non-zero so it can gate
// `npm run lint`.
import fs from "node:fs";
import path from "node:path";
import { taxonomySlug } from "../src/lib/essay-inventory.mjs";
import { publishDate } from "../src/lib/publish-time.mjs";

const essaysDirectoryArgument = process.argv.indexOf("--essays-dir");
const ESSAYS =
  essaysDirectoryArgument === -1
    ? "src/content/essays"
    : process.argv[essaysDirectoryArgument + 1];

if (!ESSAYS) {
  console.error("Usage: node scripts/check-links.mjs [--essays-dir <path>]");
  process.exit(2);
}

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
const routes = new Set([
  "/",
  "/about/",
  "/essays/",
  "/section/", // hub index; per-term archives are added per essay below
  "/topic/",
  "/privacy/",
  "/artificial-intelligence-tools/",
  "/resources/",
  "/resources/free-ai-voice-generator/",
]);
const downloadFiles = new Set();
const essays = [];
for (const slug of dirs) {
  const directory = path.join(ESSAYS, slug);
  const source = path.join(directory, `${slug}.mdx`);
  if (!fs.existsSync(source)) {
    console.error(`${slug}: missing ${slug}.mdx`);
    process.exitCode = 1;
    continue;
  }
  const raw = fs.readFileSync(source, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const fm = m?.[1] ?? "";
  const date = fm.match(/^date:[ \t]*(\S+)/m)?.[1];
  essays.push({
    slug,
    fm,
    body: raw.slice(m?.[0].length ?? 0),
    scheduled: !!date && publishDate(date) > new Date(),
  });
  routes.add(`/${slug}/`);
  for (const c of listUnder(fm, "categories"))
    routes.add(`/section/${taxonomySlug(c)}/`);
  for (const t of listUnder(fm, "tags"))
    routes.add(`/topic/${taxonomySlug(t)}/`);
  for (const d of fm.matchAll(/^[ \t]*-[ \t]*file:[ \t]*(\S+)/gm))
    downloadFiles.add(d[1]);
}

const norm = (p) => (p.endsWith("/") || /\.[a-z0-9]+$/i.test(p) ? p : `${p}/`);
const issues = [];
const scheduledSlugs = new Set(
  essays.filter((essay) => essay.scheduled).map((essay) => essay.slug),
);

for (const { slug, fm, body, scheduled } of essays) {
  const clean = body.replace(/```[\s\S]*?```/g, "");

  // Nothing else validates that a cover exists, so a bad one surfaces as an
  // ImageNotFound build failure — and can hide behind Astro's content cache
  // until a cold build in CI.
  const cover = fm
    .match(/^cover:[ \t]*(\S.*?)[ \t]*$/m)?.[1]
    ?.replace(/^["']|["']$/g, "");
  if (
    cover &&
    !/^https?:/i.test(cover) &&
    !fs.existsSync(path.join(ESSAYS, slug, cover.replace(/^\.\//, "")))
  ) {
    issues.push([slug, "cover", cover]);
  }

  // Every essay image is local now, so an absolute wp.com URL is a straggler
  // that 404s. Matched only as a URL, so prose paths don't trip it.
  for (const m of clean.matchAll(
    /https?:\/\/[^\s)"'<>]*(?:\.wp\.com|wp-content\/uploads|wpcomstaging\.com)[^\s)"'<>]*/gi,
  )) {
    issues.push([slug, "wordpress url", m[0].slice(0, 90)]);
  }

  for (const m of clean.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    const src = m[1].split(/[#?]/)[0];
    if (
      !src ||
      /^(https?:)?\/\//i.test(src) ||
      /^data:/i.test(src) ||
      src.startsWith("/")
    )
      continue;
    if (!fs.existsSync(path.join(ESSAYS, slug, src.replace(/^\.\//, ""))))
      issues.push([slug, "image", src]);
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
    } else {
      const targetSlug = p.match(/^\/([^/]+)\/$/)?.[1];
      if (!scheduled && targetSlug && scheduledSlugs.has(targetSlug)) {
        issues.push([slug, "unpublished", `${p} is not live yet`]);
      }
    }
  }
}

if (issues.length === 0) {
  console.log(
    `✓ Links OK — ${essays.length} essays; internal links and local assets resolve.`,
  );
  process.exit(0);
}
console.error(`✗ ${issues.length} problem(s):\n`);
for (const [slug, kind, link] of issues)
  console.error(`  ${slug}  [${kind}]  ${link}`);
process.exit(1);
