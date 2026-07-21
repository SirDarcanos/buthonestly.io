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
//
// TEST_SLUG=<slug> — draft exactly that one essay as a test: ignores the ledger
// and never writes it, and always drafts (never sends). Set it from the
// newsletter.yml dispatch UI to exercise the pipeline without side effects.

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

// The email teaser: 1–2 plain-text paragraphs lifted from the essay's opening
// prose, skipping furniture (callouts, headings, images, rules, fences, HTML).
function openingParagraphs(markdown) {
  const paras = [];
  let buf = [];
  const flush = () => {
    if (buf.length) paras.push(buf.join(" ").trim());
    buf = [];
  };
  for (const raw of String(markdown).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (/^(>|#{1,6}\s|!?\[\[|!\[|-{3,}|\*{3,}|_{3,}|```|~~~|<)/.test(line)) {
      flush();
      continue;
    }
    buf.push(line);
  }
  flush();

  const clean = (s) =>
    s
      .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`~]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const MAX = 360;
  const cap = (s) => {
    if (s.length <= MAX) return s;
    const cut = s.slice(0, MAX);
    const stop = Math.max(
      cut.lastIndexOf(". "),
      cut.lastIndexOf("! "),
      cut.lastIndexOf("? "),
    );
    return stop > MAX * 0.5 ? cut.slice(0, stop + 1) : cut.trimEnd() + "…";
  };

  const cleaned = paras.map(clean).filter(Boolean);
  if (!cleaned.length) return [];
  const out = [cap(cleaned[0])];
  const SHORT = 140; // a thin opening (often a one-line hook) — add the next para
  if (cleaned[0].length < SHORT && cleaned[1]) out.push(cap(cleaned[1]));
  return out;
}

async function loadPublishedEssays() {
  const entries = await readdir(ESSAYS_DIR, { withFileTypes: true });
  const essays = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const file = path.join(ESSAYS_DIR, slug, `${slug}.md`);
    if (!existsSync(file)) continue;
    const { data, content } = matter(await readFile(file, "utf8"));
    if (!data.date) continue; // no date → not live yet
    const date = new Date(data.date);
    if (Number.isNaN(+date) || date > NOW) continue;
    essays.push({
      slug,
      title: String(data.title ?? slug),
      coverAlt: data.coverAlt ? String(data.coverAlt) : "",
      opening: openingParagraphs(content),
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

// Only email once the post is actually reachable, so links never 404 — on a
// push this waits out the Cloudflare deploy. Returns the live page's HTML (for
// its og:image), or null if it never came up.
async function waitUntilLive(url, tries = 10, delayMs = 30000) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (res.ok) return await res.text();
    } catch {
      // network hiccup — retry
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

// The essay's cover is only resolved to a public, absolute URL inside Astro's
// build, so we lift it from the rendered page's og:image rather than trying to
// reconstruct the hashed `_astro/` path here.
function extractOgImage(html) {
  const m =
    html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    ) ||
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    );
  return m ? m[1] : null;
}

// The broadcast body Kit drops into {{ message_content }}. The intro lives here
// rather than in the Kit template so a hand-written broadcast won't inherit a
// "new essay" lead, and styles are inlined for clients that ignore the
// template's <style> (Outlook).
function renderEmail(essay) {
  const parts = [
    `<p style="margin:0 0 26px;">There's a new essay up on the site. Here's what it's about &mdash; and where to read the whole thing.</p>`,
  ];

  if (essay.image) {
    parts.push(
      `<p style="margin:0 0 26px;"><a href="${essay.url}" style="text-decoration:none;">` +
        `<img src="${escapeHtml(essay.image)}" alt="${escapeHtml(essay.coverAlt || essay.title)}" width="512" ` +
        `style="display:block; width:100%; max-width:512px; height:auto; border:1px solid rgba(33,29,24,0.14);"></a></p>`,
    );
  }

  parts.push(
    `<h2 style="margin:0 0 16px; font-family:'Newsreader',Georgia,serif; font-size:26px; line-height:1.25; font-weight:600; letter-spacing:-0.01em;">` +
      `<a href="${essay.url}" style="color:#211d18; text-decoration:none;">${escapeHtml(essay.title)}</a></h2>`,
  );

  const opening = essay.opening ?? [];
  if (opening.length) {
    for (const p of opening) {
      parts.push(`<p style="margin:0 0 26px;">${escapeHtml(p)}</p>`);
    }
  } else {
    parts.push(
      `<p style="margin:0 0 26px;">A new essay is up on BUT. Honestly.</p>`,
    );
  }

  parts.push(
    `<p style="margin:0 0 26px;"><a href="${essay.url}" ` +
      `style="color:#7e2a1e; font-weight:600; text-decoration:underline; text-underline-offset:2px;">Read the full essay &rarr;</a></p>`,
    `<p style="margin:0;">Settle in and give it a read when you have a quiet moment &mdash; I think you'll get something out of it.</p>`,
  );

  return parts.join("\n");
}

async function createBroadcast(essay, send = SEND) {
  const iso = new Date().toISOString();
  const body = {
    subject: essay.title,
    content: renderEmail(essay),
    description: `New essay: ${essay.title}`,
    public: false,
    published_at: iso,
    send_at: send ? iso : null, // null = draft; timestamp = send now
    preview_text: (essay.opening[0] || essay.title).slice(0, 150),
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

  const testSlug = process.env.TEST_SLUG?.trim();
  if (testSlug) {
    const essay = essays.find((e) => e.slug === testSlug);
    if (!essay) {
      console.error(`TEST_SLUG "${testSlug}" is not a published essay.`);
      process.exit(1);
    }
    if (!API_KEY) {
      console.error("KIT_API_KEY is not set — cannot create the test draft.");
      process.exit(1);
    }
    console.log(
      `TEST: drafting "${essay.slug}" (ledger ignored & untouched, never sends).`,
    );
    const html = await waitUntilLive(essay.url);
    if (!html) {
      console.error(`${essay.slug}: not reachable at ${essay.url}.`);
      process.exit(1);
    }
    essay.image = extractOgImage(html);
    const ok = await createBroadcast(essay, false);
    console.log(
      ok
        ? `· ${essay.slug}: draft created — review it in Kit.`
        : `· ${essay.slug}: draft failed.`,
    );
    process.exit(ok ? 0 : 1);
  }

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
    const html = await waitUntilLive(essay.url);
    if (!html) {
      console.log(`· ${essay.slug}: not live yet — will retry next run.`);
      continue;
    }
    essay.image = extractOgImage(html);
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
