// Turn an essay's Markdown into clean, narratable text for TTS.

import matter from "gray-matter";

// The AI summary duplicates the article, so it isn't read aloud. Other callouts
// are unwrapped: their marker line goes, their prose stays.
//
// `screen-only` and `audio-only` mark which medium a passage belongs to — see
// remark-callouts.mjs, which drops and keeps the opposite pair. Transparent
// ones keep the text after the marker, since there it is prose, not a title.
const DROP_CALLOUTS = new Set(["summary", "screen-only", "gallery"]);
const TRANSPARENT_CALLOUTS = new Set(["audio-only"]);

const CALLOUT_RE = /^\[!([\w-]+)\][+-]?\s*(.*)$/;
const MARKER_RE = /^\[![\w-]+\][+-]?[ \t]*/;

// "dot IO" is written out so the voice says "dot eye-oh" rather than trying to
// read a URL.
const intro = (title) => `Now listening to ${title} on But Honestly dot IO.`;
const outro = (title) =>
  `Thank you for listening to ${title} on But Honestly dot IO.`;

export function essayToText(raw) {
  const { content, data } = matter(raw);
  const title = String(data?.title ?? "").trim();
  const lines = stripFencedCode(content).split("\n");

  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^\|/.test(trimmed)) {
      while (i < lines.length && /^\|/.test(lines[i].trim())) i++;
      i--;
      out.push(""); // paragraph break where the table was
      continue;
    }

    if (/^>/.test(trimmed)) {
      const block = [];
      while (i < lines.length && /^>/.test(lines[i].trim())) {
        block.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      i--;
      const first = block.find((l) => l.trim() !== "") ?? "";
      const m = first.trim().match(CALLOUT_RE);
      if (m && DROP_CALLOUTS.has(m[1].toLowerCase())) continue;
      if (m && TRANSPARENT_CALLOUTS.has(m[1].toLowerCase())) {
        out.push("", stripMarker(block).join("\n").trim(), "");
      } else if (m) {
        out.push("", dropFirstNonEmpty(block).join("\n").trim(), "");
      } else {
        out.push("", `Quote. ${block.join("\n").trim()} End quote.`, "");
      }
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      out.push("");
      continue;
    }

    // H2s are bracketed so the listener gets an audible section break.
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const text = heading[2].trim();
      const stop = /[.?!]$/.test(text) ? "" : "."; // avoid doubled punctuation
      out.push(
        "",
        heading[1].length === 2 ? `New section. ${text}${stop}` : text,
        "",
      );
      continue;
    }

    out.push(line);
  }

  const body = inlineClean(out.join("\n")).trim();
  return [intro(title), body, outro(title)].join("\n\n");
}

export function essayTitle(raw) {
  return String(matter(raw).data?.title ?? "").trim();
}

// Flat `audioVoice`/`audioStyle`/`audioPace` keys rather than a nested `audio:`
// map because Obsidian's Properties editor can't edit nested objects ("Unknown
// format"). Blank/absent falls through to the CLI flag, then the default.
export function essayAudioConfig(raw) {
  const fm = matter(raw).data ?? {};
  const pick = (v) => (v == null || v === "" ? undefined : String(v).trim());
  return {
    voice: pick(fm.audioVoice),
    style: pick(fm.audioStyle),
    pace: pick(fm.audioPace),
  };
}

function stripFencedCode(text) {
  const lines = text.split("\n");
  const out = [];
  let fence = null;
  for (const line of lines) {
    const m = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      if (m && line.trim().startsWith(fence)) fence = null;
      continue;
    }
    if (m) {
      fence = m[1];
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

function stripMarker(block) {
  const out = [...block];
  const i = out.findIndex((l) => l.trim() !== "");
  if (i >= 0) out[i] = out[i].replace(MARKER_RE, "");
  return out;
}

function dropFirstNonEmpty(block) {
  const out = [];
  let dropped = false;
  for (const l of block) {
    if (!dropped && l.trim() !== "") {
      dropped = true;
      continue;
    }
    out.push(l);
  }
  return out;
}

function inlineClean(text) {
  return text
    .replace(/<figure[\s\S]*?<\/figure>/gi, "")
    .replace(/<picture[\s\S]*?<\/picture>/gi, "")
    .replace(/<(video|audio|iframe)[\s\S]*?<\/\1>/gi, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, s, l) => (l ?? s).trim())
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "");
}
