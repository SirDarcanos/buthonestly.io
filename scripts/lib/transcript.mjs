// The editable narration script that sits between the essay and the TTS call.
// Synthesis reads this file, not the Markdown, so wording meant only for the
// ear — expanded acronyms, a rephrased image caption, a name spelled the way it
// should sound — can be fixed without touching the published prose.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const CHUNK_RE = /^--- chunk \d+ ---$/gm;
const SOURCE_RE = /^# source: ([0-9a-f]+)$/m;

export const sourceHash = (text) =>
  createHash("sha256").update(text).digest("hex").slice(0, 12);

export function renderTranscript(slug, chunks, hash) {
  const header = [
    `# Narration script for ${slug}`,
    "#",
    "# Synthesis reads this file, not the essay — edit it freely.",
    "# Each chunk below is sent to the TTS model as one call, so a chunk break",
    "# is where the voice may reset; move text across one to fix a bad join.",
    "#",
    `# Rebuild from the essay (discards edits): npm run audio -- ${slug} --refresh`,
    `# source: ${hash}`,
    "",
  ].join("\n");

  const body = chunks
    .map((c, i) => `--- chunk ${i + 1} ---\n\n${c.trim()}\n`)
    .join("\n");

  return `${header}\n${body}`;
}

/** @returns {{chunks: string[], hash: string|null}} */
export async function readTranscript(file) {
  const raw = await readFile(file, "utf8");
  const hash = raw.match(SOURCE_RE)?.[1] ?? null;
  const chunks = raw
    .split(CHUNK_RE)
    .slice(1)
    .map((c) =>
      c
        .split("\n")
        .filter((l) => !l.startsWith("#"))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
  return { chunks, hash };
}

export async function writeTranscript(file, slug, chunks, hash) {
  await writeFile(file, renderTranscript(slug, chunks, hash));
}
