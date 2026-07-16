// Emails subscribers about newly published essays via the Kit (ConvertKit) v4
// Broadcasts API. Kit's built-in RSS→email automation is a paid feature, so we
// drive the (free) broadcast API ourselves from CI on publish.
//
// Modes (env MODE):
//   seed  — record every currently-published essay as "already sent" WITHOUT
//           emailing. Run once during setup so the first real run doesn't blast
//           the whole back catalogue.
//   run   — (default) email each published essay not yet in the ledger.
//
// KIT_SEND=true actually sends; anything else creates a DRAFT in Kit (safe for
// testing — you review and send it by hand). A committed ledger
// (data/newsletter-sent.json) guarantees each essay is emailed at most once.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const ESSAYS_DIR = "src/content/essays";
const LEDGER = "data/newsletter-sent.json";
const SITE = (process.env.SITE_URL || "https://buthonestly.io").replace(
  /\/$/,
  "",
);
const API_KEY = process.env.KIT_API_KEY;
const MODE = process.env.MODE || "run";
const SEND = process.env.KIT_SEND === "true";
const NOW = new Date();

const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );

async function loadPublishedEssays() {
  const entries = await readdir(ESSAYS_DIR, { withFileTypes: true });
  const essays = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const file = path.join(ESSAYS_DIR, slug, `${slug}.md`);
    if (!existsSync(file)) continue;
    const { data } = matter(await readFile(file, "utf8"));
    if (!data.date) continue; // no date → not live yet
    const date = new Date(data.date);
    if (Number.isNaN(+date) || date > NOW) continue; // scheduled / future
    essays.push({
      slug,
      title: String(data.title ?? slug),
      excerpt: String(data.excerpt ?? ""),
      date,
      url: `${SITE}/${slug}/`,
    });
  }
  return essays.sort((a, b) => +a.date - +b.date); // oldest first
}

async function loadLedger() {
  try {
    return new Set(JSON.parse(await readFile(LEDGER, "utf8")));
  } catch {
    return new Set();
  }
}

async function saveLedger(set) {
  await writeFile(LEDGER, JSON.stringify([...set].sort(), null, 2) + "\n");
}

// Only email once the post is actually reachable on the site, so links never
// 404. On a push this waits for the Cloudflare deploy; on the daily cron the
// post is already live and this returns on the first try.
async function waitUntilLive(url, tries = 10, delayMs = 30000) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (res.ok) return true;
    } catch {
      // network hiccup — retry
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

function renderEmail(essay) {
  const teaser = essay.excerpt
    ? `<p>${escapeHtml(essay.excerpt)}</p>`
    : `<p>A new essay is up on BUT. Honestly.</p>`;
  return [
    teaser,
    `<p><a href="${essay.url}">Read the full essay →</a></p>`,
  ].join("\n");
}

async function createBroadcast(essay) {
  const iso = new Date().toISOString();
  const body = {
    subject: essay.title,
    content: renderEmail(essay),
    description: `New essay: ${essay.title}`,
    public: false,
    published_at: iso,
    send_at: SEND ? iso : null, // null = draft; timestamp = send now
    preview_text: (essay.excerpt || essay.title).slice(0, 150),
    subscriber_filter: [{ all: [], any: null, none: null }], // everyone
  };

  const res = await fetch("https://api.kit.com/v4/broadcasts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Kit-Api-Key": API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`Kit API ${res.status}: ${await res.text()}`);
    return false;
  }
  return true;
}

async function main() {
  const essays = await loadPublishedEssays();

  if (MODE === "seed") {
    await saveLedger(new Set(essays.map((e) => e.slug)));
    console.log(`Seeded ledger with ${essays.length} published essays.`);
    return;
  }

  const ledger = await loadLedger();
  const fresh = essays.filter((e) => !ledger.has(e.slug));
  if (fresh.length === 0) {
    console.log("No new essays to notify.");
    return;
  }
  if (!API_KEY) {
    console.error("KIT_API_KEY is not set — cannot create broadcasts.");
    process.exit(1);
  }

  console.log(`${fresh.length} new essay(s); mode=${SEND ? "SEND" : "DRAFT"}.`);

  for (const essay of fresh) {
    if (!(await waitUntilLive(essay.url))) {
      console.log(`· ${essay.slug}: not live yet — will retry next run.`);
      continue;
    }
    if (await createBroadcast(essay)) {
      ledger.add(essay.slug);
      await saveLedger(ledger); // persist after each success (crash-safe)
      console.log(`· ${essay.slug}: ${SEND ? "sent" : "drafted"}.`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
