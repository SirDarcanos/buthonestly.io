// Tell IndexNow which essays changed, so Bing (and Yandex, Seznam, Naver)
// recrawl them in hours rather than whenever they next get round to it.
// Google does not participate in IndexNow — it still discovers via the sitemap.
//
//   npm run indexnow                    # submit what changed
//   MODE=seed npm run indexnow          # record current state, submit nothing
//   DRY_RUN=true npm run indexnow       # show what would be submitted
//
// A committed ledger (data/indexnow-pinged.json) maps slug → content hash, so a
// URL is only resubmitted when its content actually changed. Repeatedly
// submitting unchanged URLs is what gets a host throttled.
//
// Env: SITE_URL (default https://buthonestly.io). The key is NOT a secret — the
// protocol requires it to be publicly fetchable — so it lives in public/, and
// this reads it from there. One source of truth: the key we submit is by
// construction the key the verifier will fetch.

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ESSAYS_DIR = "src/content/essays";
const LEDGER = "data/indexnow-pinged.json";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const SITE = (process.env.SITE_URL || "https://buthonestly.io").replace(
  /\/+$/,
  "",
);
const MODE = process.env.MODE || "run";
const DRY_RUN = process.env.DRY_RUN === "true";
const NOW = new Date();

/**
 * The key file in public/, named <key>.txt and containing exactly <key>. Those
 * two agreeing IS the verification, so identify the key by that property rather
 * than by a hardcoded name — and discover a mismatch here rather than from a
 * 403 later. Any other .txt in public/ is simply not a key file.
 */
async function readKey() {
  const candidates = (await readdir("public"))
    .filter((f) => f.endsWith(".txt"))
    .filter((f) => /^[A-Za-z0-9-]{8,128}\.txt$/.test(f));
  for (const f of candidates) {
    const name = f.slice(0, -4);
    const body = (await readFile(path.join("public", f), "utf8")).trim();
    if (body === name) return name;
  }
  console.error(
    candidates.length
      ? `No valid IndexNow key in public/. Checked ${candidates.join(", ")} — each must contain exactly its own filename without the .txt.`
      : "No IndexNow key file in public/. Create public/<key>.txt containing <key>.",
  );
  process.exit(1);
}

const KEY = await readKey();

/** Mirrors getPublishedEssays: an essay is live once its date has passed. */
function frontmatterDate(md) {
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const line = fm?.[1].match(/^date:\s*(.+?)\s*$/m);
  if (!line) return null;
  const dt = new Date(line[1].replace(/^["']|["']$/g, ""));
  return Number.isNaN(dt.valueOf()) ? null : dt;
}

function listUnder(fm, key) {
  const block = fm.match(
    new RegExp(`^${key}:\\s*\\n((?:\\s*-\\s+.+\\n?)*)`, "m"),
  );
  if (!block) return [];
  return [...block[1].matchAll(/^\s*-\s+(.+?)\s*$/gm)].map((m) =>
    m[1].replace(/^["']|["']$/g, ""),
  );
}

const slugify = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// ── Gather published essays and hash their content ──────────────────────────
const dirs = (await readdir(ESSAYS_DIR, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const live = [];
for (const slug of dirs) {
  const file = path.join(ESSAYS_DIR, slug, `${slug}.md`);
  if (!existsSync(file)) continue;
  const md = await readFile(file, "utf8");
  const date = frontmatterDate(md);
  if (!date || date > NOW) continue; // not published yet
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  live.push({
    slug,
    hash: createHash("sha256").update(md).digest("hex").slice(0, 16),
    sections: listUnder(fm, "categories").map(slugify),
    topics: listUnder(fm, "tags").map(slugify),
  });
}

const ledger = existsSync(LEDGER)
  ? JSON.parse(await readFile(LEDGER, "utf8"))
  : {};

const changed = live.filter((e) => ledger[e.slug] !== e.hash);
const isNew = live.filter((e) => !(e.slug in ledger));

if (MODE === "seed") {
  const next = Object.fromEntries(live.map((e) => [e.slug, e.hash]));
  await writeFile(LEDGER, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Seeded ledger with ${live.length} essays — nothing submitted.`);
  process.exit(0);
}

if (!changed.length) {
  console.log("Nothing changed — no submission.");
  process.exit(0);
}

// ── Build the URL list ──────────────────────────────────────────────────────
// Changed essays, plus the listings a *new* essay actually alters. An edit to an
// existing essay doesn't change the home page, so don't claim it did.
const urls = new Set(changed.map((e) => `${SITE}/${e.slug}/`));
if (isNew.length) {
  urls.add(`${SITE}/`);
  urls.add(`${SITE}/essays/`);
  for (const e of isNew) {
    for (const s of e.sections) urls.add(`${SITE}/section/${s}/`);
    for (const t of e.topics) urls.add(`${SITE}/topic/${t}/`);
  }
}

// Never submit a URL that isn't actually live — invalid submissions are what
// IndexNow throttles a host for. A scheduled essay whose deploy hasn't finished
// yet simply gets picked up on the next run.
const verified = [];
for (const url of urls) {
  const res = await fetch(url, { method: "HEAD" }).catch(() => null);
  if (res?.ok) verified.push(url);
  else console.warn(`  skipped (${res?.status ?? "unreachable"}): ${url}`);
}

if (!verified.length) {
  console.log("No live URLs to submit — nothing done, ledger untouched.");
  process.exit(0);
}

console.log(
  `${changed.length} changed essay(s), ${isNew.length} new — submitting ${verified.length} URL(s):`,
);
for (const u of verified) console.log(`  ${u}`);

if (DRY_RUN) {
  console.log("DRY_RUN — not submitting, ledger untouched.");
  process.exit(0);
}

// ── Submit ──────────────────────────────────────────────────────────────────
const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: new URL(SITE).host,
    key: KEY,
    keyLocation: `${SITE}/${KEY}.txt`,
    urlList: verified,
  }),
});

// 200 accepted, 202 accepted-but-key-pending. Both mean it landed.
if (!res.ok && res.status !== 202) {
  const body = await res.text().catch(() => "");
  console.error(`IndexNow returned ${res.status}. ${body}`.trim());
  process.exit(1); // leave the ledger alone so the next run retries
}

console.log(`IndexNow accepted the submission (${res.status}).`);

// Only record what we actually submitted, so a partial run retries the rest.
const submitted = new Set(verified);
const next = { ...ledger };
for (const e of changed) {
  if (submitted.has(`${SITE}/${e.slug}/`)) next[e.slug] = e.hash;
}
await writeFile(LEDGER, `${JSON.stringify(next, null, 2)}\n`);
console.log(`Ledger updated (${Object.keys(next).length} essays tracked).`);
