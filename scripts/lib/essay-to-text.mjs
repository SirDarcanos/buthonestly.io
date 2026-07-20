// Turn an essay's Markdown into clean, narratable text for TTS: drop code,
// images, tables, and the Quick Summary callout; flatten headings/links/
// wikilinks/emphasis to prose; keep paragraph breaks for the chunker.

import matter from "gray-matter";

// Callout types dropped entirely from narration (the AI summary duplicates the
// article and shouldn't be read aloud). Other callouts are unwrapped: their
// marker line goes, their prose stays.
const DROP_CALLOUTS = new Set(["summary"]);

const CALLOUT_RE = /^\[!(\w+)\][+-]?\s*(.*)$/;

// Spoken bookends. "dot IO" is written out so the voice says "dot eye-oh"
// rather than trying to read a URL.
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

    // GFM table: contiguous run of lines starting with "|". Drop the block.
    if (/^\|/.test(trimmed)) {
      while (i < lines.length && /^\|/.test(lines[i].trim())) i++;
      i--;
      out.push(""); // paragraph break where the table was
      continue;
    }

    // Blockquote / Obsidian callout: contiguous run of ">"-prefixed lines.
    if (/^>/.test(trimmed)) {
      const block = [];
      while (i < lines.length && /^>/.test(lines[i].trim())) {
        block.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      i--;
      const first = block.find((l) => l.trim() !== "") ?? "";
      const m = first.trim().match(CALLOUT_RE);
      if (m && DROP_CALLOUTS.has(m[1].toLowerCase())) continue; // drop entirely
      if (m) {
        // Callout (note/tip/etc.): drop the "[!type] Title" marker, keep prose.
        out.push("", dropFirstNonEmpty(block).join("\n").trim(), "");
      } else {
        // A plain blockquote is a quotation — bracket it for the listener.
        out.push("", `Quote. ${block.join("\n").trim()} End quote.`, "");
      }
      continue;
    }

    // Horizontal rule.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      out.push("");
      continue;
    }

    // Heading: keep the text (read as a short line), drop the "#" markers.
    // H2s open a new section, so bracket them ("New section. <title>.") to
    // give the listener an audible section break.
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

// Per-essay audio overrides from optional flat frontmatter, e.g.
//   audioVoice: Enceladus
//   audioStyle: witty
//   audioPace: brisk
// Flat rather than a nested `audio:` map because Obsidian's Properties editor
// can't edit nested objects ("Unknown format").
// Any field left blank/absent falls through to the CLI flag, then the default.
export function essayAudioConfig(raw) {
  const fm = matter(raw).data ?? {};
  const pick = (v) => (v == null || v === "" ? undefined : String(v).trim());
  return {
    voice: pick(fm.audioVoice),
    style: pick(fm.audioStyle),
    pace: pick(fm.audioPace),
  };
}

// Remove ``` and ~~~ fenced code blocks wholesale.
function stripFencedCode(text) {
  const lines = text.split("\n");
  const out = [];
  let fence = null; // the fence marker that opened the current block
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

// Inline-level cleanup across the whole (block-cleaned) text.
function inlineClean(text) {
  return (
    text
      // HTML blocks that carry no narratable text: figures, galleries, media.
      .replace(/<figure[\s\S]*?<\/figure>/gi, "")
      .replace(/<picture[\s\S]*?<\/picture>/gi, "")
      .replace(/<(video|audio|iframe)[\s\S]*?<\/\1>/gi, "")
      .replace(/<img\b[^>]*>/gi, "")
      // Markdown images.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      // Wikilinks: [[slug|label]] → label, [[slug]] → slug.
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, s, l) =>
        (l ?? s).trim(),
      )
      // Markdown links: [text](url) → text.
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      // Inline code, bold, italic, strikethrough markers.
      .replace(/`([^`]*)`/g, "$1")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      .replace(/~~(.*?)~~/g, "$1")
      // Any remaining HTML tags → keep inner text.
      .replace(/<[^>]+>/g, "")
      // Collapse 3+ newlines to a clean paragraph break.
      .replace(/\n{3,}/g, "\n\n")
      // Trim trailing spaces per line.
      .replace(/[ \t]+$/gm, "")
  );
}
