// Generate an essay audio narration with Gemini TTS (Vertex AI).
//
//   npm run audio -- <slug|path>            # preview: synthesize MP3 + ![[embed]]
//   npm run audio -- <slug|path> --commit   # upload the previewed MP3 to R2
//
// Preview writes a git-ignored MP3 beside the essay and inserts an Obsidian audio
// embed (plays in the vault; remark-audio-embed renders it on the site). --commit
// only uploads that MP3 to R2 — it never re-synthesizes. Flags (preview):
// --voice/--style/--pace/--silence/--budget. Env:
// GOOGLE_APPLICATION_CREDENTIALS (+ optional VERTEX_REGION/VERTEX_MODEL); per-essay
// overrides via `audioVoice` / `audioStyle` / `audioPace` frontmatter.

import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

import { exists, die, resolveEssay } from "./lib/fs-util.mjs";
import { chunkText } from "../src/lib/chunk-text.mjs";
import { essayToText, essayAudioConfig } from "./lib/essay-to-text.mjs";
import {
  GeminiTTS,
  DEFAULT_VOICE,
  DEFAULT_STYLE,
  DEFAULT_PACE,
  listStyles,
  listPaces,
} from "./lib/gemini-tts.mjs";
import { concatPcm, pcmToMp3, pcmDurationSeconds } from "./lib/assemble.mjs";

const CHUNK_BUDGET_WORDS = 200; // Gemini's per-call sweet spot (vs Kokoro's 60).

async function main() {
  loadDotEnv();
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (!positional.length) die("Usage: npm run audio -- <slug|path> [--commit]");

  const silenceMs = flags.silence != null ? Number(flags.silence) : 200;
  const budget =
    flags.budget != null ? Number(flags.budget) : CHUNK_BUDGET_WORDS;

  const { slug, file } = await resolveEssay(positional[0]);
  const mp3Path = path.join(path.dirname(file), `${slug}.mp3`);

  // Commit only uploads the MP3 a prior preview generated — never re-synthesizes.
  if (flags.commit) {
    if (!(await exists(mp3Path)))
      die(
        `No MP3 at ${mp3Path} — run a preview first: npm run audio -- ${slug}`,
      );
    await insertAudioTag(file, slug);
    await commitToR2(slug, mp3Path);
    return;
  }

  const raw = await readFile(file, "utf8");

  const fm = essayAudioConfig(raw);
  const voice = flags.voice ?? fm.voice ?? DEFAULT_VOICE;
  const style = flags.style ?? fm.style ?? DEFAULT_STYLE;
  const pace = flags.pace ?? fm.pace ?? DEFAULT_PACE;
  if (!listStyles().includes(style))
    die(`Unknown style "${style}". One of: ${listStyles().join(", ")}`);
  if (!listPaces().includes(pace))
    die(`Unknown pace "${pace}". One of: ${listPaces().join(", ")}`);

  const text = essayToText(raw);
  if (!text.trim()) die(`No narratable text found in ${file}.`);
  const chunks = chunkText(text, budget);
  console.log(
    `${slug}: ${chunks.length} chunk(s), voice ${voice}, ${style}/${pace}.`,
  );

  const tts = new GeminiTTS(await loadServiceAccount(), {
    region: process.env.VERTEX_REGION,
    model: process.env.VERTEX_MODEL,
  });
  const pcms = [];
  for (let i = 0; i < chunks.length; i++) {
    process.stdout.write(`  chunk ${i + 1}/${chunks.length}…`);
    pcms.push(await tts.synthesize(chunks[i], { voice, style, pace }));
    process.stdout.write(" ok\n");
  }

  const pcm = concatPcm(pcms, silenceMs);
  await pcmToMp3(pcm, mp3Path);
  const dur = pcmDurationSeconds(pcm);
  console.log(`Wrote ${mp3Path} (${fmtDuration(dur)}).`);

  await insertAudioTag(file, slug);
  console.log(`Embedded ![[${slug}.mp3]] — plays inline in Obsidian.`);
  console.log(`Preview done. Listen, then run --commit to upload to R2.`);
}

async function commitToR2(slug, mp3Path) {
  const bucket = await staticBucketName();
  await uploadToR2(bucket, `audio/${slug}.mp3`, mp3Path);
  console.log(
    `Uploaded to R2: ${bucket}/audio/${slug}.mp3 — serves at https://static.buthonestly.io/audio/${slug}.mp3`,
  );
}

async function loadServiceAccount() {
  const p = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!p)
    die(
      "Set GOOGLE_APPLICATION_CREDENTIALS in .env to the path of your Vertex service-account JSON.",
    );
  if (!(await exists(p)))
    die(
      `Service account JSON not found at GOOGLE_APPLICATION_CREDENTIALS=${p}`,
    );
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch (e) {
    die(`Could not parse service account JSON at ${p}: ${e.message}`);
  }
}

// The STATIC bucket name lives only in the git-ignored wrangler.toml (kept out
// of the repo), so read it from there rather than hard-coding it.
async function staticBucketName() {
  const toml = await readFile("wrangler.toml", "utf8").catch(() =>
    die("wrangler.toml not found — needed for the STATIC bucket name."),
  );
  const blocks = toml.split(/\[\[r2_buckets\]\]/).slice(1);
  for (const b of blocks) {
    if (/binding\s*=\s*"STATIC"/.test(b)) {
      const m = b.match(/bucket_name\s*=\s*"([^"]+)"/);
      if (m) return m[1];
    }
  }
  die("Could not find the STATIC r2_bucket in wrangler.toml.");
}

async function uploadToR2(bucket, key, filePath) {
  const { spawn } = await import("node:child_process");
  await new Promise((resolve, reject) => {
    // `--yes`: fetch wrangler on demand (cached after first run) without an
    // interactive prompt, and without adding it to package.json / the deploy.
    const p = spawn(
      "npx",
      [
        "--yes",
        "wrangler",
        "r2",
        "object",
        "put",
        `${bucket}/${key}`,
        "--file",
        filePath,
        "--remote",
        "--content-type",
        "audio/mpeg",
        // Long-lived immutable cache — the R2 custom domain serves this
        // directly, so there's no Worker to set headers.
        "--cache-control",
        "public, max-age=31536000, immutable",
      ],
      { stdio: "inherit" },
    );
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`wrangler exited ${code}`)),
    );
  });
}

async function insertAudioTag(file, slug) {
  let raw = await readFile(file, "utf8");
  const block = `![[${slug}.mp3]]`;
  const esc = escapeRe(slug);

  // Strip any existing embed so a re-run replaces rather than duplicates.
  raw = raw
    .replace(new RegExp(`\\n*!\\[\\[${esc}\\.mp3\\]\\]\\n*`, "g"), "\n\n")
    .replace(
      new RegExp(
        `\\n*<audio[^>]*${esc}\\.mp3[^>]*>(?:[\\s\\S]*?</audio>)?\\n*`,
        "gi",
      ),
      "\n\n",
    )
    .replace(/\n{3,}/g, "\n\n");

  // Insert after the frontmatter, and after a leading Quick Summary callout if
  // present, so the player sits above the body.
  const fm = raw.match(/^---\n[\s\S]*?\n---\n/);
  let insertAt = fm ? fm[0].length : 0;
  const afterFm = raw.slice(insertAt);
  const summary = afterFm.match(/(^|\n)>\s*\[!summary\][\s\S]*?(?=\n\n(?!>))/i);
  if (summary) insertAt += summary.index + summary[0].length;

  const before = raw.slice(0, insertAt).replace(/\n*$/, "\n");
  const after = raw.slice(insertAt).replace(/^\n*/, "");
  await writeFile(file, `${before}\n${block}\n\n${after}`);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--commit") flags.commit = true;
    else if (a.startsWith("--")) flags[a.slice(2)] = argv[++i];
    else positional.push(a);
  }
  return { positional, flags };
}

// Minimal .env loader, to avoid a dotenv dependency. Existing process.env wins.
function loadDotEnv() {
  let text;
  try {
    text = readFileSync(".env", "utf8");
  } catch {
    return; // no .env is fine (e.g. env vars set some other way)
  }
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function fmtDuration(s) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main().catch((e) => die(e.message));
