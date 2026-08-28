import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const CATEGORY_WEIGHT = 1;
const TAG_WEIGHT = 3;
const SEMANTIC_TAXONOMY_SCALE = 0.02;

const stripMarkdown = (markdown) =>
  markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^>\s?/gm, " ")
    .replace(/[#*_~`>|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const hashText = (text) =>
  createHash("sha256").update(text).digest("hex").slice(0, 16);

const names = (terms) => terms.map((term) => term.name ?? term);

const semanticInput = (essay) => {
  const sourceText = `${essay.title}. ${essay.excerpt}. ${stripMarkdown(essay.body)}`;
  return {
    slug: essay.slug,
    categories: names(essay.categories),
    tags: names(essay.tags),
    text: sourceText.slice(0, 4000),
    hash: hashText(sourceText),
  };
};

const dot = (left, right) =>
  left.reduce((score, value, index) => score + value * right[index], 0);

const sharedCount = (left, right) =>
  left.filter((term) => right.includes(term)).length;

const taxonomyScore = (left, right) =>
  sharedCount(left.categories, right.categories) * CATEGORY_WEIGHT +
  sharedCount(left.tags, right.tags) * TAG_WEIGHT;

const sortedRecord = (record) =>
  Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );

export async function buildSemanticState({
  inventory,
  cache,
  embed,
  embeddingVersion,
}) {
  const essays = inventory.essays
    .map(semanticInput)
    .sort((left, right) => left.slug.localeCompare(right.slug));
  const essaySlugs = new Set(essays.map(({ slug }) => slug));
  const nextCache = Object.fromEntries(
    Object.entries(cache).filter(([slug]) => essaySlugs.has(slug)),
  );
  const stale = essays.filter(
    ({ slug, hash }) =>
      nextCache[slug]?.hash !== hash ||
      nextCache[slug]?.version !== embeddingVersion,
  );

  if (stale.length) {
    const vectors = await embed(stale.map(({ text }) => text));
    if (!vectors || vectors.length !== stale.length) {
      throw new Error(
        `Embedding provider did not return a vector for every stale essay (${vectors?.length ?? 0}/${stale.length}).`,
      );
    }
    stale.forEach(({ slug, hash }, index) => {
      nextCache[slug] = {
        hash,
        version: embeddingVersion,
        vector: vectors[index],
      };
    });
  }

  const embedded = essays.filter(({ slug }) => nextCache[slug]?.vector);
  const related = {};
  for (const source of essays) {
    const sourceVector = nextCache[source.slug]?.vector;
    related[source.slug] = sourceVector
      ? embedded
          .filter(({ slug }) => slug !== source.slug)
          .map((candidate) => ({
            slug: candidate.slug,
            score:
              dot(sourceVector, nextCache[candidate.slug].vector) +
              taxonomyScore(source, candidate) * SEMANTIC_TAXONOMY_SCALE,
          }))
          .sort(
            (left, right) =>
              right.score - left.score || left.slug.localeCompare(right.slug),
          )
          .map(({ slug }) => slug)
      : [];
  }

  return {
    cache: sortedRecord(nextCache),
    related: sortedRecord(related),
  };
}

export function selectRelatedEssays({
  source,
  essays,
  rankedSlugs,
  publishedSlugs,
  size,
}) {
  const available = essays.filter(
    ({ slug }) => slug !== source.slug && publishedSlugs.has(slug),
  );
  const bySlug = new Map(
    available.map((candidate) => [candidate.slug, candidate]),
  );
  const selected = [];
  const seen = new Set([source.slug]);

  for (const slug of rankedSlugs) {
    const candidate = bySlug.get(slug);
    if (!candidate || seen.has(slug)) continue;
    selected.push(candidate);
    seen.add(slug);
    if (selected.length === size) return selected;
  }

  const fallback = available
    .filter(({ slug }) => !seen.has(slug))
    .map((candidate) => ({
      candidate,
      score: taxonomyScore(source, candidate),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        new Date(right.candidate.date).valueOf() -
          new Date(left.candidate.date).valueOf() ||
        left.candidate.slug.localeCompare(right.candidate.slug),
    );
  for (const { candidate } of fallback) {
    selected.push(candidate);
    if (selected.length === size) break;
  }
  return selected;
}

export async function writeGeneratedFile(filePath, contents) {
  let existing;
  try {
    existing = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (existing === contents) return false;
  await writeFile(filePath, contents);
  return true;
}
