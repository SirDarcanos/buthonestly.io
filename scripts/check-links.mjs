// Verify internal links in essays resolve: [[wikilinks]] point to real essays,
// and root-relative links (/…, /section/…, /topic/…, /downloads/…) match a real
// route or download. Also checks Markdown images: a title with an unbalanced
// quote (which swallows the closing paren, so the caption never renders and the
// stray quote leaks into the filename), and a relative image that doesn't exist
// beside the essay (which fails the Astro build with ImageNotFound).
// External links and #anchors are not checked. Exits non-zero on any problem so
// it can gate `npm run lint`.
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
  "/resources/free-ai-voice-generator/",
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

// Walk `![alt](target "title")` image refs. Scanned rather than regex-matched
// because a quoted title may itself contain parens ("… MediEvil (1998)."), and
// because an unterminated quote — the failure we want to catch — can't be
// expressed as a match. A quote that only "closes" on a later line is broken.
function* markdownImages(text) {
  const re = /!\[[^\]]*\]\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    let i = re.lastIndex;
    while (i < text.length && /[ \t]/.test(text[i])) i++;
    const tStart = i;
    while (i < text.length && !/[\s)]/.test(text[i])) i++;
    const target = text.slice(tStart, i).replace(/^<|>$/g, "");
    while (i < text.length && /[ \t]/.test(text[i])) i++;

    let broken = false;
    if (text[i] === '"' || text[i] === "'") {
      const close = text.indexOf(text[i], i + 1);
      const nl = text.indexOf("\n", i + 1);
      if (close === -1 || (nl !== -1 && close > nl)) broken = true;
      else i = close + 1;
    }
    if (!broken) {
      while (i < text.length && /[ \t]/.test(text[i])) i++;
      if (text[i] !== ")") broken = true;
    }
    const eol = text.indexOf("\n", m.index);
    yield {
      target,
      broken,
      raw: text.slice(m.index, eol === -1 ? text.length : eol).slice(0, 90),
    };
  }
}

const norm = (p) => (p.endsWith("/") || /\.[a-z0-9]+$/i.test(p) ? p : `${p}/`);
const issues = [];
for (const { slug, body } of essays) {
  const clean = body.replace(/```[\s\S]*?```/g, ""); // ignore code blocks
  // `[[…]]` wikilinks, but not `![[…]]` embeds (audio players etc.).
  for (const m of clean.matchAll(/(?<!!)\[\[([^\]|#]+)/g)) {
    const target = m[1].trim();
    if (!essaySlugs.has(target))
      issues.push([slug, "wikilink", `[[${target}]]`]);
  }
  // Markdown images. Remote and root-relative sources are left to the link
  // check below; these are the essay-local ones.
  for (const { target, broken, raw } of markdownImages(clean)) {
    if (broken) {
      // The target is unreliable once quoting is broken, so don't also file it
      // as a missing image.
      issues.push([slug, "image title", raw]);
      continue;
    }
    const src = target.split(/[#?]/)[0];
    if (!src || /^(https?:)?\/\//i.test(src) || /^data:/i.test(src)) continue;
    if (src.startsWith("/")) continue; // public/ asset — not essay-local
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
    }
  }
}

if (issues.length === 0) {
  console.log(
    `✓ Links OK — ${essays.length} essays; wikilinks, internal links and images all resolve.`,
  );
  process.exit(0);
}
console.error(`✗ ${issues.length} problem(s):\n`);
for (const [slug, kind, link] of issues)
  console.error(`  ${slug}  [${kind}]  ${link}`);
process.exit(1);
