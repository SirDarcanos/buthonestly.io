import { getCollection, type CollectionEntry } from "astro:content";
import { SITE_URL } from "../consts.ts";
import { taxDescription, taxSlug } from "../taxonomies.ts";
import { type Post, type Tax } from "../types.ts";
import relatedMap from "../../data/related.json";

type Essay = CollectionEntry<"essays">;

// Precomputed semantic neighbours (slug -> ranked slugs), built from sentence
// embeddings by scripts/build-related.mjs. Missing/unknown slugs fall back to
// taxonomy scoring below.
const RELATED = relatedMap as Record<string, string[]>;

/** Clamp to ~160 chars at a word boundary for a meta description. */
function truncate(text: string, max = 160): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > 0 ? lastSpace : max).trimEnd()}…`;
}

export function toPost(entry: Essay): Post {
  const d = entry.data;
  const slug = entry.id;
  const date = d.date ? d.date.toISOString() : "";
  const modified = (d.updated ?? d.date)?.toISOString() ?? date;
  // The imported cover goes to the Picture component; `featuredImage` is the
  // same image as an absolute URL string, for og:image.
  const cover = d.cover;
  const featuredImage = cover
    ? new URL(cover.src, SITE_URL).toString()
    : undefined;
  const excerpt = d.excerpt ?? "";

  return {
    id: slug,
    slug,
    url: `/${slug}/`,
    type: "post",
    title: d.title,
    body: entry.body ?? "",
    excerpt,
    date,
    modified,
    cover,
    featuredImage,
    featuredImageAlt: d.coverAlt,
    featuredImageCaption: d.coverCaption,
    tags: d.tags,
    categories: d.categories,
    sticky: d.sticky,
    cornerstone: d.cornerstone,
    seo: {
      title: d.title,
      description: truncate(excerpt),
      ogImage: featuredImage,
      canonical: `${SITE_URL}/${slug}/`,
    },
  };
}

export async function getPublishedEssays(): Promise<Essay[]> {
  const now = new Date();
  const published = await getCollection(
    "essays",
    ({ data }) => !!data.date && data.date <= now,
  );
  return published.sort(
    (a, b) => (b.data.date?.valueOf() ?? 0) - (a.data.date?.valueOf() ?? 0),
  );
}

export async function getAllPosts(): Promise<Post[]> {
  return (await getPublishedEssays()).map(toPost);
}

export async function getPostBySlug(slug: string): Promise<Post | undefined> {
  return (await getAllPosts()).find((p) => p.slug === slug);
}

/**
 * Precomputed semantic neighbours (RELATED) first, topped up with shared
 * taxonomy (categories weighted above tags), then recency — so a brand-new
 * essay not yet in the embedding map still gets sensible related posts.
 */
export async function getRelatedPosts(post: Post, size = 3): Promise<Post[]> {
  const all = await getAllPosts();
  const bySlug = new Map(all.map((p) => [p.slug, p]));
  const picked: Post[] = [];
  const seen = new Set<string>([post.slug]);

  for (const slug of RELATED[post.slug] ?? []) {
    if (seen.has(slug)) continue;
    const p = bySlug.get(slug);
    if (!p) continue; // slug not published (yet)
    picked.push(p);
    seen.add(slug);
    if (picked.length >= size) return picked;
  }

  const scored = all
    .filter((p) => !seen.has(p.slug))
    .map((p) => ({
      post: p,
      score:
        p.categories.filter((c) => post.categories.includes(c)).length * 2 +
        p.tags.filter((t) => post.tags.includes(t)).length,
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(b.post.date).valueOf() - new Date(a.post.date).valueOf(),
    );
  for (const { post: p } of scored) {
    picked.push(p);
    if (picked.length >= size) break;
  }
  return picked;
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
 * Taxonomy terms co-occurring across a set of posts, most common first — the
 * topics inside a section, or the sections a topic spans. `count` is the
 * co-occurrence count within `posts`, not the site-wide total, which is what
 * makes it the right number to label a cross-link with.
 *
 * Takes posts rather than a term name so archive pages can pass the set they
 * have already filtered in getStaticPaths instead of re-reading the collection.
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
