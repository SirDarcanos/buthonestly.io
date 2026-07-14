import { getCollection, type CollectionEntry } from "astro:content";
import { SITE_URL } from "../consts.ts";
import { type Post, type Tax } from "../types.ts";

type Essay = CollectionEntry<"essays">;

/** Clamp to ~160 chars at a word boundary for a meta description. */
function truncate(text: string, max = 160): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > 0 ? lastSpace : max).trimEnd()}…`;
}

/** Matches the WordPress taxonomy slugs for this blog's simple names. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function toPost(entry: Essay): Post {
  const d = entry.data;
  const slug = entry.id;
  const date = d.date ? d.date.toISOString() : "";
  const modified = (d.updated ?? d.date)?.toISOString() ?? date;
  // Local cover wins; fall back to the migrated WP URL until it's rebuilt.
  const featuredImage = d.originalCover ?? d.cover?.src;
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

/** Ranked by shared taxonomy (categories weighted above tags), then recency. */
export async function getRelatedPosts(post: Post, size = 3): Promise<Post[]> {
  const others = (await getAllPosts()).filter((p) => p.slug !== post.slug);
  const scored = others.map((p) => ({
    post: p,
    score:
      p.categories.filter((c) => post.categories.includes(c)).length * 2 +
      p.tags.filter((t) => post.tags.includes(t)).length,
  }));
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      new Date(b.post.date).valueOf() - new Date(a.post.date).valueOf(),
  );
  return scored.slice(0, size).map((s) => s.post);
}

function taxFrom(names: string[]): Tax[] {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({
      name,
      slug: slugify(name),
      description: "",
      count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCategories(): Promise<Tax[]> {
  const posts = await getAllPosts();
  return taxFrom(posts.flatMap((p) => p.categories));
}

export async function getTags(): Promise<Tax[]> {
  const posts = await getAllPosts();
  return taxFrom(posts.flatMap((p) => p.tags));
}
