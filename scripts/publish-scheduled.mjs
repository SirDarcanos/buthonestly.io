// Rebuild the site only when a scheduled essay has come due but isn't live yet.
// Run hourly: POSTing the deploy hook only on a due-but-404 essay keeps builds
// to ~3×/year instead of a daily blind rebuild, and a skipped run self-heals.
//
// Env: CF_DEPLOY_HOOK_URL (required), SITE_URL (default https://buthonestly.io).

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const HOOK = process.env.CF_DEPLOY_HOOK_URL;
const SITE = (process.env.SITE_URL || "https://buthonestly.io").replace(
  /\/+$/,
  "",
);
const ROOT = "src/content/essays";

if (!HOOK) {
  console.error("CF_DEPLOY_HOOK_URL is not set — create a Pages deploy hook.");
  process.exit(1);
}

// Mirror getPublishedEssays: new Date(<frontmatter date>) <= new Date(). Both
// this job and the Cloudflare build run in UTC, so the comparison agrees.
const now = new Date();

function frontmatterDate(md) {
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const line = fm[1].match(/^date:\s*(.+?)\s*$/m);
  if (!line) return null;
  const dt = new Date(line[1].replace(/^["']|["']$/g, ""));
  return Number.isNaN(dt.valueOf()) ? null : dt;
}

const dueButMissing = [];
for (const slug of await readdir(ROOT)) {
  let md;
  try {
    md = await readFile(path.join(ROOT, slug, `${slug}.md`), "utf8");
  } catch {
    continue; // not an essay dir (no <slug>/<slug>.md)
  }
  const date = frontmatterDate(md);
  if (!date || date > now) continue;
  const res = await fetch(`${SITE}/${slug}/`, { method: "HEAD" });
  if (res.status === 404) dueButMissing.push(slug);
}

if (dueButMissing.length === 0) {
  console.log("Nothing due but missing — no rebuild needed.");
  process.exit(0);
}

console.log(
  `Due but not live: ${dueButMissing.join(", ")} — triggering build.`,
);
const res = await fetch(HOOK, { method: "POST" });
console.log(`Deploy hook: HTTP ${res.status}`);
if (!res.ok) process.exit(1);
