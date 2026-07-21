// Precomputes semantic "related posts" from sentence embeddings, at build time
// (never at runtime).
//
// Outputs (both committed):
//   data/embeddings.json — { slug: { hash, vector } } cache; only essays whose
//                          text changed get re-embedded.
//   data/related.json    — { slug: [slug, ...] } top neighbours, read by
//                          getRelatedPosts() with a taxonomy fallback.
//
// The model (onnxruntime-node, ~200MB) is intentionally NOT a project
// dependency — it's installed ad-hoc by .github/workflows/related.yml (or
// locally: `npm install --no-save @huggingface/transformers`). This keeps the
// Cloudflare deploy install light; recomputing related.json from the cached
// vectors needs no model at all.

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import matter from "gray-matter";

const ESSAYS_DIR = "src/content/essays";
const EMB_FILE = "data/embeddings.json";
const OUT_FILE = "data/related.json";
const MODEL = "Xenova/bge-small-en-v1.5";
const TOP_N = 6;
const CAT_BOOST = 0.02;
const TAG_BOOST = 0.06;

function stripMarkdown(md) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^>\s?/gm, " ")
    .replace(/[#*_~`>|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const hashText = (t) =>
  createHash("sha256").update(t).digest("hex").slice(0, 16);
const round = (x) => Math.round(x * 1e6) / 1e6;

async function loadEssays() {
  const dirs = await readdir(ESSAYS_DIR, { withFileTypes: true });
  const essays = [];
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const slug = dir.name;
    const file = path.join(ESSAYS_DIR, slug, `${slug}.md`);
    if (!existsSync(file)) continue;
    const { data, content } = matter(await readFile(file, "utf8"));
    if (!data.date) continue; // draft / no date
    if (new Date(data.date) > new Date()) continue;
    // Present-but-empty frontmatter arrives as null; clean it like the schema does.
    const list = (v) =>
      Array.isArray(v) ? v.filter((x) => x != null && x !== "") : [];
    const text = `${data.title ?? slug}. ${data.excerpt ?? ""}. ${stripMarkdown(
      content,
    )}`.slice(0, 4000);
    essays.push({
      slug,
      title: data.title ?? slug,
      categories: list(data.categories),
      tags: list(data.tags),
      text,
      hash: hashText(text),
    });
  }
  return essays;
}

async function embed(texts) {
  let pipeline;
  try {
    ({ pipeline } = await import("@huggingface/transformers"));
  } catch {
    console.warn(
      "⚠  @huggingface/transformers not installed — skipping (re)embedding.\n" +
        "   Install it to refresh vectors: npm install --no-save @huggingface/transformers",
    );
    return null;
  }
  const extractor = await pipeline("feature-extraction", MODEL);
  const vectors = [];
  for (const text of texts) {
    const out = await extractor(text, { pooling: "mean", normalize: true });
    vectors.push(Array.from(out.data, round));
  }
  return vectors;
}

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

async function main() {
  const essays = await loadEssays();
  const bySlug = new Map(essays.map((e) => [e.slug, e]));

  const cache = existsSync(EMB_FILE)
    ? JSON.parse(await readFile(EMB_FILE, "utf8"))
    : {};

  const stale = essays.filter(
    (e) => !cache[e.slug] || cache[e.slug].hash !== e.hash,
  );
  if (stale.length) {
    console.log(`Embedding ${stale.length} new/changed essay(s)…`);
    const vectors = await embed(stale.map((e) => e.text));
    if (vectors) {
      stale.forEach((e, i) => {
        cache[e.slug] = { hash: e.hash, vector: vectors[i] };
      });
    }
  } else {
    console.log("All embeddings up to date.");
  }

  for (const slug of Object.keys(cache)) {
    if (!bySlug.has(slug)) delete cache[slug];
  }

  await mkdir("data", { recursive: true });
  await writeFile(EMB_FILE, JSON.stringify(cache) + "\n");

  const embedded = essays.filter((e) => cache[e.slug]?.vector);
  const related = {};
  for (const a of essays) {
    const va = cache[a.slug]?.vector;
    if (!va) {
      related[a.slug] = [];
      continue;
    }
    related[a.slug] = embedded
      .filter((b) => b.slug !== a.slug)
      .map((b) => {
        const sharedCat = a.categories.filter((c) =>
          b.categories.includes(c),
        ).length;
        const sharedTag = a.tags.filter((t) => b.tags.includes(t)).length;
        return {
          slug: b.slug,
          score:
            dot(va, cache[b.slug].vector) +
            CAT_BOOST * sharedCat +
            TAG_BOOST * sharedTag,
        };
      })
      .sort((x, y) => y.score - x.score)
      .slice(0, TOP_N)
      .map((x) => x.slug);
  }

  await writeFile(OUT_FILE, JSON.stringify(related, null, 2) + "\n");
  console.log(
    `Wrote related.json (${essays.length} essays, ${embedded.length} with vectors).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
