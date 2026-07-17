// Style-guide lint for BUT. Honestly essays. Ported from the Cowork
// lint-draft.py and adapted to this repo: internal links are wikilink-aware
// (`[[slug]]`), and a "comments" CTA is a FAIL (this site has no comments)
// rather than the expectation it was in the original guide.
//
//   npm run lint:essay                 # all essays + drafts
//   npm run lint:essay -- <slug|path>  # one essay (essays/ then drafts/)
//   npm run lint:essay -- <slug> --quiet   # hide OK lines
//   npm run lint:essay -- <slug> --json    # machine-readable
//   npm run lint:essay -- <slug> --strict  # exit 1 on FAILs (default: advisory)
//
// Advisory by default (exit 0) so it never blocks a commit or CI. Thresholds
// mirror the style guide kept in local/ (uncommitted).

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ESSAY_ROOTS, exists, die, resolveEssay } from "./lib/fs-util.mjs";

// ── Thresholds (mirror the style guide) ──────────────────────────────────────
const SENTENCE_HARD_MAX = 28;
const SENTENCE_SOFT_MAX = 20;
const PARA_MAX_SENTENCES = 5;
const WORD_COUNT_LO = 1500;
const WORD_COUNT_HI = 3500;
const INTERNAL_LINKS_LO = 3;
const INTERNAL_LINKS_HI = 8;
const HEADING_MAX_CHARS = 60;
const HEADINGS_MIN_COUNT = 4;
const EM_DASH_PER_1K_WARN = 4;
const SEMICOLON_PER_1K_WARN = 2;
const HEDGE_PER_500_WARN = 1;
const BOLD_PER_PARAGRAPH_MAX = 2;

// ── Banned patterns ──────────────────────────────────────────────────────────
// "ecosystem" is intentionally absent — it's the accurate word for "WordPress
// ecosystem"; a reviewer can flag misuse by hand.
const BUZZWORDS =
  /\b(optimize|leverage|synergy|holistic|seamless|paradigm|game[\s-]?changing|revolutionary|cutting[\s-]?edge|world[\s-]?class|next[\s-]?gen|disruptive|robust|scalable|innovative|unlock)\b/gi;
const HYPE_WORDS =
  /\b(amazing|incredible|stunning|astonishing|mind[\s-]?blowing|unbelievable|breathtaking|spectacular|insane|massive|huge)\b/gi;
const MARKETING_OPENERS =
  /^(In this (article|post|piece|guide|essay)|This (article|post|piece|guide|essay)|Discover|Unlock|Transform)\b/gim;
const YOU_SHOULD = /\byou should\b/gi;
const HEDGE_INFLATORS =
  /\b(very|really|extremely|fairly|quite|just simply|absolutely)\b/gi;
const COMMENT_CTA =
  /\b(in the comments|comment below|leave a comment|drop a comment|share (this )?in the comments)\b/gi;

// ── Helpers ──────────────────────────────────────────────────────────────────
// Return [body, baseLine] where baseLine is the 1-indexed source line the body
// starts on — so finding line numbers map back to the original file.
function stripFrontmatter(text) {
  if (text.startsWith("---")) {
    const end = text.indexOf("\n---", 3);
    if (end > 0) {
      const nl = text.indexOf("\n", end + 1); // newline after the closing ---
      const bodyStart = nl === -1 ? text.length : nl + 1;
      const base = text.slice(0, bodyStart).split("\n").length;
      return [text.slice(bodyStart), base];
    }
  }
  return [text, 1];
}

// Blank a matched span while keeping its newlines, so downstream offsets (and
// therefore line numbers) stay aligned with the source.
const blank = (m) => m.replace(/[^\n]/g, " ");

const stripHtmlComments = (t) => t.replace(/<!--[\s\S]*?-->/g, blank);

// Neutralize non-prose so voice checks don't trip on code, images, embeds, or
// Obsidian callout tokens (`[!info]` carries a `!`) — blanked, not removed.
function stripProse(text) {
  return text
    .replace(/```[\s\S]*?```/g, blank)
    .replace(/`[^`\n]+`/g, blank)
    .replace(/!\[\[[^\]]*\]\]/g, blank) // ![[audio.mp3]] embeds
    .replace(/!\[[^\]]*\]\([^)]*\)/g, blank) // ![alt](url) images
    .replace(/\[!\w+\]/g, blank); // > [!info] callout markers
}

const lineOfOffset = (text, off, base = 1) =>
  text.slice(0, off).split("\n").length - 1 + base;

function* findPatternHits(text, pattern, base = 1) {
  const re = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g",
  );
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index === re.lastIndex) re.lastIndex++;
    const line = lineOfOffset(text, m.index, base);
    const start = text.lastIndexOf("\n", m.index) + 1;
    let end = text.indexOf("\n", m.index);
    if (end === -1) end = text.length;
    yield [line, m[0], text.slice(start, end).trim().slice(0, 140)];
  }
}

function wordsIn(text) {
  const t = text.replace(/<[^>]+>/g, "").replace(/!?\[[^\]]*\]\([^)]*\)/g, "");
  return (t.match(/\b\w+\b/g) || []).length;
}

function splitSentences(text) {
  const t = text.replace(/\s+/g, " ");
  return t
    .split(/(?<=[.!?])\s+(?=[A-Z"'(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitParagraphs(text) {
  const out = [];
  for (const chunk of text.split(/\n\s*\n/)) {
    const c = chunk.trim();
    if (!c) continue;
    if (/^#{1,6}\s/.test(c) || /^[-*]\s/.test(c) || /^>\s/.test(c)) continue;
    out.push(c);
  }
  return out;
}

const wc = (s) => (s.match(/\b\w+\b/g) || []).length;

// Reader-visible text: `[[target|label]]`→`label`, `[[target]]`→`target`,
// `[label](url)`→`label`. Used where a word count should reflect what shows.
const visibleText = (s) =>
  s
    .replace(/\[\[[^\]|#]*(?:#[^\]|]*)?\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]|#]+)[^\]]*\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

// ── Report ───────────────────────────────────────────────────────────────────
function makeReport(file) {
  return {
    file,
    word_count: 0,
    sentence_count: 0,
    paragraph_count: 0,
    internal_links: 0,
    external_links: 0,
    em_dashes: 0,
    semicolons: 0,
    findings: [],
    add(sev, category, rule, message = "", line = 0, excerpt = "") {
      this.findings.push({
        severity: sev,
        category,
        rule,
        message,
        line,
        excerpt,
      });
    },
    get fails() {
      return this.findings.filter((f) => f.severity === "FAIL");
    },
    get warns() {
      return this.findings.filter((f) => f.severity === "WARN");
    },
  };
}

// ── Checks ───────────────────────────────────────────────────────────────────
function checkLength(prose, r) {
  const n = wordsIn(prose);
  r.word_count = n;
  if (n < 800)
    r.add("WARN", "Length", `${n} words — short essay`, "soft min is 800");
  else if (n < WORD_COUNT_LO)
    r.add(
      "WARN",
      "Length",
      `${n} words — below target`,
      `typical range ${WORD_COUNT_LO}–${WORD_COUNT_HI}`,
    );
  else if (n > 5000)
    r.add(
      "WARN",
      "Length",
      `${n} words — very long`,
      "soft max is 5000; consider splitting",
    );
  else if (n > WORD_COUNT_HI)
    r.add(
      "OK",
      "Length",
      `${n} words`,
      `slightly above ${WORD_COUNT_LO}–${WORD_COUNT_HI} — fine`,
    );
  else
    r.add(
      "OK",
      "Length",
      `${n} words`,
      `within target ${WORD_COUNT_LO}–${WORD_COUNT_HI}`,
    );
}

function checkVoice(prose, base, r) {
  const youShould = [...findPatternHits(prose, YOU_SHOULD, base)];
  if (!youShould.length) r.add("OK", "Voice", "no 'you should' framing");
  for (const [line, , ctx] of youShould)
    r.add(
      "FAIL",
      "Voice",
      "you should",
      "rewrite as 'It helps to ask…' or 'One way to look at this is…'",
      line,
      ctx,
    );

  const buzz = [...findPatternHits(prose, BUZZWORDS, base)];
  if (!buzz.length) r.add("OK", "Voice", "no buzzwords");
  for (const [line, match, ctx] of buzz)
    r.add(
      "FAIL",
      "Voice",
      `buzzword '${match}'`,
      "rewrite with a concrete word",
      line,
      ctx,
    );

  for (const [line, match, ctx] of findPatternHits(
    prose,
    MARKETING_OPENERS,
    base,
  ))
    r.add(
      "FAIL",
      "Voice",
      `marketing opener '${match}'`,
      "start with substance, not preamble",
      line,
      ctx,
    );

  for (const [line, match, ctx] of findPatternHits(prose, HYPE_WORDS, base))
    r.add(
      "WARN",
      "Voice",
      `hype word '${match}'`,
      "understatement is stronger — consider rewriting",
      line,
      ctx,
    );

  let excl = 0;
  for (const [line, , ctx] of findPatternHits(prose, /!/g, base)) {
    excl++;
    r.add(
      "FAIL",
      "Voice",
      "exclamation mark",
      "banned inside essay body",
      line,
      ctx,
    );
  }
  if (!excl) r.add("OK", "Voice", "no exclamation marks");

  const hedges = [...findPatternHits(prose, HEDGE_INFLATORS, base)];
  const n = Math.max(wordsIn(prose), 1);
  const threshold = Math.max(2, Math.floor((n / 500) * HEDGE_PER_500_WARN));
  if (hedges.length > threshold)
    r.add(
      "WARN",
      "Voice",
      "hedge inflation",
      `${hedges.length} hedge words (very/really/just…) — target ≤${threshold} for ${n} words. Diluting claims.`,
    );
}

function checkSentences(prose, base, r) {
  const paras = splitParagraphs(prose);
  const all = [];
  const long = [];
  for (const para of paras) {
    for (const s of splitSentences(para)) {
      all.push(s);
      // Count reader-visible words: a wikilink slug or link URL isn't prose.
      const n = wc(visibleText(s));
      if (n > SENTENCE_HARD_MAX) long.push([n, s]);
    }
  }
  r.sentence_count = all.length;

  for (const [n, sent] of long) {
    const idx = prose.indexOf(sent.slice(0, 60));
    const line = idx >= 0 ? lineOfOffset(prose, idx, base) : 0;
    r.add(
      "FAIL",
      "Sentences",
      `sentence > ${SENTENCE_HARD_MAX} words`,
      `${n} words — split or compress`,
      line,
      sent.slice(0, 140),
    );
  }
  if (!long.length)
    r.add("OK", "Sentences", `all sentences ≤ ${SENTENCE_HARD_MAX} words`);

  if (all.length) {
    const avg = all.reduce((a, s) => a + wc(visibleText(s)), 0) / all.length;
    if (avg > SENTENCE_SOFT_MAX + 2)
      r.add(
        "WARN",
        "Sentences",
        "high average length",
        `${avg.toFixed(1)} words/sentence — target ≤${SENTENCE_SOFT_MAX}. Tighten.`,
      );
    else
      r.add(
        "OK",
        "Sentences",
        "average length in range",
        `${avg.toFixed(1)} words/sentence (target ≤${SENTENCE_SOFT_MAX})`,
      );
  }
}

function checkParagraphs(prose, base, r) {
  const paras = splitParagraphs(prose);
  r.paragraph_count = paras.length;

  for (const para of paras) {
    const sc = splitSentences(para).length;
    if (sc > PARA_MAX_SENTENCES) {
      const idx = prose.indexOf(para.slice(0, 60));
      const line = idx >= 0 ? lineOfOffset(prose, idx, base) : 0;
      r.add(
        "WARN",
        "Paragraphs",
        `paragraph with ${sc} sentences`,
        `target ≤${PARA_MAX_SENTENCES} — split for rhythm`,
        line,
        para.slice(0, 140),
      );
    }
  }

  for (let i = 0; i < paras.length - 1; i++) {
    const w1 = paras[i].split(/\s+/);
    const w2 = paras[i + 1].split(/\s+/);
    if (
      w1[0] &&
      w2[0] &&
      w1[0].toLowerCase() === w2[0].toLowerCase() &&
      w1[0].length > 2 &&
      !["the", "and", "but"].includes(w1[0].toLowerCase())
    ) {
      const idx = prose.indexOf(paras[i + 1].slice(0, 40));
      const line = idx >= 0 ? lineOfOffset(prose, idx, base) : 0;
      r.add(
        "WARN",
        "Paragraphs",
        `adjacent paragraphs both start with '${w1[0]}'`,
        "vary openings",
        line,
      );
    }
  }
}

function checkFormatting(body, base, r) {
  const n = Math.max(wordsIn(body), 1);

  const em = (body.match(/—/g) || []).length;
  r.em_dashes = em;
  const emThreshold = Math.max(2, Math.floor((n / 1000) * EM_DASH_PER_1K_WARN));
  if (em > emThreshold)
    r.add(
      "WARN",
      "Punctuation",
      "em dash usage",
      `${em} em dashes in ${n} words — target ≤${emThreshold}. Vary the device.`,
    );
  else
    r.add(
      "OK",
      "Punctuation",
      `em dashes (${em})`,
      `≤ target (${emThreshold}) for ${n} words`,
    );

  const semis = (body.match(/;/g) || []).length;
  r.semicolons = semis;
  const scThreshold = Math.max(
    1,
    Math.floor((n / 1000) * SEMICOLON_PER_1K_WARN),
  );
  if (semis > scThreshold)
    r.add(
      "WARN",
      "Punctuation",
      "semicolon usage",
      `${semis} semicolons — should be rare. Prefer splitting.`,
    );

  for (const para of splitParagraphs(body)) {
    const bolds = para.match(/\*\*[^*]+\*\*/g) || [];
    if (bolds.length > BOLD_PER_PARAGRAPH_MAX) {
      const idx = body.indexOf(para.slice(0, 60));
      const line = idx >= 0 ? lineOfOffset(body, idx, base) : 0;
      r.add(
        "WARN",
        "Formatting",
        `${bolds.length} bold-emphasized terms in one paragraph`,
        `target ≤${BOLD_PER_PARAGRAPH_MAX}`,
        line,
        para.slice(0, 140),
      );
    }
  }

  for (const [line, match] of findPatternHits(
    body,
    /\*[^*\n]{15,}?\*/g,
    base,
  )) {
    const words = wc(visibleText(match));
    if (words > 3)
      r.add(
        "WARN",
        "Formatting",
        `italics over 3 words (${words})`,
        "italics reserved for short emphasis",
        line,
        match,
      );
  }

  for (const [line, match] of findPatternHits(
    body,
    /^(#{2,4})\s+(.+)$/gm,
    base,
  )) {
    const heading = match.replace(/^#+\s+/, "");
    if (heading.length > HEADING_MAX_CHARS)
      r.add(
        "WARN",
        "Headings",
        `heading ${heading.length} chars`,
        `target ≤${HEADING_MAX_CHARS} — shorter and more functional`,
        line,
        heading,
      );
  }
}

function checkStructure(body, base, r) {
  const paras = splitParagraphs(body);
  const headings = [...body.matchAll(/^(#{2,4})\s+(.+)$/gm)].map((m) => m[2]);

  const first = paras.slice(0, 2).filter(Boolean);
  if (!first.length)
    r.add(
      "FAIL",
      "Structure",
      "missing opening hook",
      "first non-furniture line empty",
    );
  else {
    const hookWords = wc(first[0].split("\n")[0]);
    if (hookWords > 30)
      r.add(
        "WARN",
        "Structure",
        `opening hook is ${hookWords} words`,
        "target a tight punchline or single question",
      );
  }

  if (headings.length < HEADINGS_MIN_COUNT)
    r.add(
      "WARN",
      "Structure",
      `only ${headings.length} H2/H3 headings`,
      `target ≥${HEADINGS_MIN_COUNT} for a typical essay`,
    );

  if (headings.length) {
    const last = headings[headings.length - 1].toLowerCase();
    const signals = [
      "learned",
      "comes down",
      "honest",
      "rhythm",
      "reflection",
      "exit",
      "future",
      "where i",
      "what i",
      "the cost",
      "line",
    ];
    if (!signals.some((s) => last.includes(s)))
      r.add(
        "WARN",
        "Structure",
        "no obvious closing-reflection heading",
        `last heading is '${headings[headings.length - 1]}' — does it synthesize?`,
      );
  }

  // Reader CTA: a closing question is the voice; a comments CTA is banned here.
  const comment = [...findPatternHits(body, COMMENT_CTA, base)];
  for (const [line, match, ctx] of comment)
    r.add(
      "FAIL",
      "Structure",
      `comments CTA '${match}'`,
      "this site has no comments — end with a question + newsletter instead",
      line,
      ctx,
    );

  if (paras.length) {
    const lastPara = paras[paras.length - 1];
    if (!lastPara.includes("?"))
      r.add(
        "WARN",
        "Structure",
        "no reader CTA at end",
        "essays typically close with a question and an invitation",
      );
  }
}

function checkLinks(body, r) {
  // Internal: wikilinks `[[slug]]` (not `![[embeds]]`), root-relative, or
  // buthonestly.io. External: other http(s) markdown links.
  const wikilinks = (body.match(/(?<!!)\[\[[^\]|#]+/g) || []).length;
  let internal = wikilinks;
  let external = 0;
  for (const m of body.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
    const href = m[2].trim();
    if (href.includes("buthonestly.io") || href.startsWith("/")) internal++;
    else if (href.startsWith("http")) external++;
  }
  r.internal_links = internal;
  r.external_links = external;

  const n = wordsIn(body);
  let [lo, hi] = [INTERNAL_LINKS_LO, INTERNAL_LINKS_HI];
  if (n < 1000) [lo, hi] = [2, 6];
  else if (n > 3000) [lo, hi] = [5, 12];

  if (internal === 0)
    r.add(
      "FAIL",
      "Links",
      "zero internal links",
      `orphan post — target ${lo}–${hi} for ${n} words`,
    );
  else if (internal < lo)
    r.add(
      "WARN",
      "Links",
      `only ${internal} internal links`,
      `target ${lo}–${hi} for ${n} words`,
    );
  else if (internal > hi)
    r.add(
      "WARN",
      "Links",
      `${internal} internal links — above target`,
      `target ${lo}–${hi}. Be selective.`,
    );
  else
    r.add(
      "OK",
      "Links",
      `${internal} internal links in target range`,
      `target ${lo}–${hi}`,
    );
}

function lintText(file, raw) {
  const [afterFm, base] = stripFrontmatter(raw);
  const body = stripHtmlComments(afterFm);
  const prose = stripProse(body);
  const r = makeReport(file);
  checkLength(prose, r);
  checkVoice(prose, base, r);
  checkSentences(prose, base, r);
  checkParagraphs(prose, base, r);
  checkFormatting(body, base, r);
  checkStructure(body, base, r);
  checkLinks(body, r);
  return r;
}

// ── Output ───────────────────────────────────────────────────────────────────
function formatReport(r, quiet) {
  const order = { FAIL: 0, WARN: 1, OK: 2 };
  const sym = { FAIL: "✗", WARN: "⚠", OK: "✓" };
  const out = [];
  out.push(`\n${"─".repeat(70)}`);
  out.push(`LINT — ${r.file}`);
  out.push("─".repeat(70));
  out.push(
    `Words: ${r.word_count}  Sentences: ${r.sentence_count}  Paragraphs: ${r.paragraph_count}`,
  );
  out.push(
    `Links: ${r.internal_links} internal · ${r.external_links} external   Em dashes: ${r.em_dashes} · Semicolons: ${r.semicolons}`,
  );
  out.push(`FAILs: ${r.fails.length} · WARNs: ${r.warns.length}\n`);

  const byCat = {};
  for (const f of r.findings) {
    if (quiet && f.severity === "OK") continue;
    (byCat[f.category] ??= []).push(f);
  }
  for (const cat of Object.keys(byCat).sort()) {
    out.push(
      `━━ ${cat.toUpperCase()} ${"━".repeat(Math.max(0, 66 - cat.length))}`,
    );
    for (const f of byCat[cat].sort(
      (a, b) => order[a.severity] - order[b.severity] || a.line - b.line,
    )) {
      out.push(
        `  ${sym[f.severity]} [${f.severity}]${f.line ? ` line ${f.line}` : ""}  ${f.rule}`,
      );
      if (f.message) out.push(`        ${f.message}`);
      if (f.excerpt) out.push(`        ▸ ${f.excerpt}`);
    }
    out.push("");
  }
  return out.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function allEssays() {
  const files = [];
  for (const root of ESSAY_ROOTS) {
    if (!(await exists(root))) continue;
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = path.join(root, entry.name, `${entry.name}.md`);
      if (await exists(file)) files.push(file);
    }
  }
  return files;
}

async function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const args = argv.filter((a) => !a.startsWith("--"));
  const quiet = flags.has("--quiet");
  const asJson = flags.has("--json");
  const strict = flags.has("--strict");

  let files;
  if (args.length)
    files = (await Promise.all(args.map((a) => resolveEssay(a)))).map(
      (e) => e.file,
    );
  else files = await allEssays();

  if (!files.length) die("No essays found to lint.");

  const reports = [];
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    reports.push(lintText(file, raw));
  }

  if (asJson) {
    console.log(
      JSON.stringify(
        reports.map((r) => ({
          file: r.file,
          word_count: r.word_count,
          sentence_count: r.sentence_count,
          paragraph_count: r.paragraph_count,
          internal_links: r.internal_links,
          external_links: r.external_links,
          em_dashes: r.em_dashes,
          semicolons: r.semicolons,
          findings: r.findings,
          fails: r.fails.length,
          warns: r.warns.length,
        })),
        null,
        2,
      ),
    );
  } else {
    for (const r of reports) console.log(formatReport(r, quiet));
    const totalFails = reports.reduce((a, r) => a + r.fails.length, 0);
    const totalWarns = reports.reduce((a, r) => a + r.warns.length, 0);
    console.log("─".repeat(70));
    console.log(
      `${reports.length} file(s) · ${totalFails} FAIL(s) · ${totalWarns} WARN(s)` +
        (totalFails && !strict ? " — advisory, not blocking." : ""),
    );
    console.log("─".repeat(70));
  }

  const anyFail = reports.some((r) => r.fails.length);
  process.exit(strict && anyFail ? 1 : 0);
}

main().catch((e) => die(e.message));
