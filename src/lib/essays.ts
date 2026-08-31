import { getCollection, type CollectionEntry } from "astro:content";
import { SITE_URL } from "../consts.ts";
import { loadEssayInventory } from "./essay-inventory.mjs";
import { selectRelatedEssays } from "./related-essays.mjs";
import { essaySeoMetadata } from "./seo-metadata.mjs";
import { taxDescription, taxSlug } from "../taxonomies.ts";
import { type Post, type Tax } from "../types.ts";
import relatedMap from "../../data/related.json";

type Essay = CollectionEntry<"essays">;
type EssayRecord = ReturnType<typeof loadEssayInventory>["essays"][number];
export type RenderableEssay = {
  entry: Essay;
  record: EssayRecord;
};

const INVENTORY = loadEssayInventory({ siteUrl: SITE_URL });
const PUBLISHED_SLUGS = new Set(INVENTORY.published.map(({ slug }) => slug));
const RELATED = relatedMap as Record<string, string[]>;

export function toPost({ entry, record }: RenderableEssay): Post {
  const cover = entry.data.cover;
  const featuredImage = cover
    ? new URL(cover.src, SITE_URL).toString()
    : undefined;

  return {
    id: record.slug,
    slug: record.slug,
    url: record.pathname,
    type: "post",
    title: record.title,
    body: record.body,
    excerpt: record.excerpt,
    date: record.publishedAt.toISOString(),
    modified: record.freshnessAt.toISOString(),
    cover,
    featuredImage,
    featuredImageAlt: record.coverAlt,
    featuredImageCaption: record.coverCaption,
    tags: record.tags.map(({ name }) => name),
    categories: record.categories.map(({ name }) => name),
    sticky: record.sticky,
    cornerstone: record.cornerstone,
    contentHash: record.publicContentHash,
    narrationUrl: record.narrationUrl,
    downloads: record.downloads,
    seo: {
      ...essaySeoMetadata(record),
      ogImage: featuredImage,
      canonical: record.canonicalUrl,
    },
  };
}

export async function getRenderableEssays(): Promise<RenderableEssay[]> {
  const entries = await getCollection("essays");
  const entriesBySlug = new Map(entries.map((entry) => [entry.id, entry]));
  const inventorySlugs = new Set(INVENTORY.essays.map(({ slug }) => slug));
  const missingEntries = INVENTORY.essays.filter(
    ({ slug }) => !entriesBySlug.has(slug),
  );
  const unknownEntries = entries.filter(({ id }) => !inventorySlugs.has(id));
  if (missingEntries.length || unknownEntries.length) {
    throw new Error(
      `Essay inventory and Astro collection disagree: ${[
        ...missingEntries.map(({ slug }) => `missing ${slug}`),
        ...unknownEntries.map(({ id }) => `unknown ${id}`),
      ].join(", ")}`,
    );
  }

  const previewSlugs = new Set(
    (import.meta.env.LIGHTHOUSE_PREVIEW_SLUGS ?? "").split(",").filter(Boolean),
  );
  const records = import.meta.env.PROD
    ? INVENTORY.essays.filter(
        (essay) =>
          PUBLISHED_SLUGS.has(essay.slug) || previewSlugs.has(essay.slug),
      )
    : INVENTORY.essays;
  return records
    .map((record) => ({ record, entry: entriesBySlug.get(record.slug)! }))
    .sort(
      (a, b) =>
        b.record.publishedAt.valueOf() - a.record.publishedAt.valueOf() ||
        a.record.slug.localeCompare(b.record.slug),
    );
}

export async function getAllPosts(): Promise<Post[]> {
  return (await getRenderableEssays()).map(toPost);
}

export async function getPostBySlug(slug: string): Promise<Post | undefined> {
  return (await getAllPosts()).find((p) => p.slug === slug);
}

export async function getRelatedPosts(post: Post, size = 3): Promise<Post[]> {
  return selectRelatedEssays({
    source: post,
    essays: await getAllPosts(),
    rankedSlugs: RELATED[post.slug] ?? [],
    publishedSlugs: PUBLISHED_SLUGS,
    size,
  });
}

function taxFrom(names: string[]): Tax[] {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => {
      const slug = taxSlug(name);
      return { name, slug, description: taxDescription(slug), count };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Taxonomy terms co-occurring across a set of posts, most common first. `count`
 * is the count within `posts`, not the site-wide total. Takes posts so archives
 * can pass the set they already filtered in getStaticPaths.
 */
export function coOccurringTax(
  posts: Post[],
  pick: (post: Post) => string[],
): Tax[] {
  return taxFrom(posts.flatMap(pick)).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
}

export async function getCategories(): Promise<Tax[]> {
  const posts = await getAllPosts();
  return taxFrom(posts.flatMap((p) => p.categories));
}

export async function getTags(): Promise<Tax[]> {
  const posts = await getAllPosts();
  return taxFrom(posts.flatMap((p) => p.tags));
}
