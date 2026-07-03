/**
 * WordPress.com headless data layer.
 *
 * Fetches published content from the public WordPress.com REST API at build
 * time and normalizes it so templates never touch raw API noise.
 */

import { SITE_URL, API_BASE, WPCOM_API_BASE } from "../consts.ts";
import { type PostLink, type Post, type Tax } from "../types.ts";

type WpTerm = {
  id: number;
  name: string;
  slug: string;
  taxonomy: string;
};

/** Raw shape of the WordPress.com REST post objects we consume. */
type WpPost = {
  id: number;
  slug: string;
  date: string;
  modified: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  content: { rendered: string };
  jetpack_featured_media_url?: string;
  _embedded?: {
    "wp:featuredmedia"?: Array<{
      alt_text?: string;
      caption?: { rendered?: string };
      media_details?: { width?: number; height?: number };
    }>;
    "wp:term"?: WpTerm[][];
  };
};

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#039;": "'",
  "&#39;": "'",
  "&#8217;": "’",
  "&#8216;": "‘",
  "&#8220;": "“",
  "&#8221;": "”",
  "&#8211;": "–",
  "&#8212;": "—",
  "&hellip;": "…",
  "&nbsp;": " ",
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(
      /&[a-z0-9#]+;/gi,
      (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity,
    );
}

/** Strip HTML tags + decode entities + collapse whitespace → plain text. */
function toPlainText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/** Clamp to ~160 chars at a word boundary for use as a meta description. */
function truncate(text: string, max = 160): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > 0 ? lastSpace : max).trimEnd()}…`;
}

function normalize(post: WpPost): Post {
  const media = post._embedded?.["wp:featuredmedia"]?.[0];
  const featuredImageAlt = media?.alt_text || undefined;
  const featuredImageCaption = media?.caption?.rendered
    ? toPlainText(media.caption.rendered)
    : undefined;

  const terms = (post._embedded?.["wp:term"] ?? []).flat();
  const tags = terms
    .filter((t) => t.taxonomy === "post_tag")
    .map((t) => t.name);
  const cats = terms
    .filter((t) => t.taxonomy === "category" && t.slug !== "uncategorized")
    .map((t) => t.name);

  return {
    id: post.id,
    slug: post.slug,
    url: `/${post.slug}/`,
    type: "post",
    title: decodeEntities(post.title.rendered),
    contentHtml: post.content.rendered,
    excerpt: toPlainText(post.excerpt.rendered),
    date: post.date,
    modified: post.modified,
    featuredImage: post.jetpack_featured_media_url || undefined,
    featuredImageAlt: featuredImageAlt,
    featuredImageCaption: featuredImageCaption,
    tags: tags,
    categories: cats,
    seo: {
      title: decodeEntities(post.title.rendered),
      description: truncate(toPlainText(post.excerpt.rendered)),
      ogImage: post.jetpack_featured_media_url || undefined,
      canonical: `${SITE_URL}/${post.slug}/`,
    },
  };
}

let postsCache: Promise<Post[]> | undefined;

/**
 * Every published post, newest first. Memoized — the network fetch runs once
 * per build and every caller (homepage, [slug], getPostBySlug) reuses it.
 */
export function getAllPosts(): Promise<Post[]> {
  return (postsCache ??= fetchAllPosts());
}

async function fetchAllPosts(): Promise<Post[]> {
  const perPage = 100;
  let page = 1;
  const all: Post[] = [];

  while (true) {
    const url = `${API_BASE}/posts?per_page=${perPage}&page=${page}&_fields=id,slug,date,modified,title,excerpt,content,featured_media,jetpack_featured_media_url,_links,_embedded&_embed=wp:featuredmedia,wp:term`;
    const res = await fetch(url);

    if (res.status === 400) break; // WP returns 400 past the last page
    if (!res.ok) {
      throw new Error(`WordPress API error ${res.status} fetching ${url}`);
    }

    const batch = (await res.json()) as WpPost[];
    if (batch.length === 0) break;

    all.push(...batch.map((post) => normalize(post)));
    if (batch.length < perPage) break;
    page += 1;
  }

  return all;
}

export async function getPostBySlug(slug: string): Promise<Post | undefined> {
  const posts = await getAllPosts();
  return posts.find((p) => p.slug === slug);
}

type RelatedResponse = {
  hits?: Array<{ fields?: { post_id?: number } }>;
};

/**
 * Related posts for a given post, newest-relevance first.
 *
 * Uses Jetpack's Elasticsearch-backed related endpoint (WP.com v1.1) purely to
 * rank post IDs, then maps them back onto our already-normalized posts so the
 * cards reuse the same title/url/image/excerpt as everywhere else. Falls back to
 * same-category posts (newest first) when the endpoint returns too few, so the
 * section never renders short.
 */
export async function getRelatedPosts(post: Post, size = 3): Promise<Post[]> {
  const all = await getAllPosts();
  const byId = new Map(all.map((p) => [p.id, p]));

  const related: Post[] = [];
  try {
    const res = await fetch(`${WPCOM_API_BASE}/posts/${post.id}/related`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ size }),
    });
    if (res.ok) {
      const data = (await res.json()) as RelatedResponse;
      for (const hit of data.hits ?? []) {
        const match = byId.get(Number(hit.fields?.post_id));
        if (match && match.id !== post.id) related.push(match);
      }
    }
  } catch {
    // Network/endpoint failure → rely on the category fallback below.
  }

  if (related.length < size) {
    const chosen = new Set(related.map((p) => p.id));
    chosen.add(post.id);
    const sameCategory = all.filter(
      (p) =>
        !chosen.has(p.id) &&
        p.categories.some((c) => post.categories.includes(c)),
    );
    related.push(...sameCategory.slice(0, size - related.length));
  }

  return related.slice(0, size);
}

let tagsCache: Promise<Tax[]> | undefined;
let categoriesCache: Promise<Tax[]> | undefined;

/**
 * Fetch every tag on the site with its slug.
 */
export function getTags(): Promise<Tax[]> {
  return (tagsCache ??= fetchTax("tags"));
}

/**
 * Fetch every category on the site with its slug.
 */
export function getCategories(): Promise<Tax[]> {
  return (categoriesCache ??= fetchTax("categories"));
}

async function fetchTax(tax: string): Promise<Tax[]> {
  if (tax !== "tags" && tax !== "categories") {
    throw new Error(`Unknown taxonomy ${tax}`);
  }

  const res = await fetch(
    `${API_BASE}/${tax}?per_page=100&_fields=name,slug,description,count`,
  );
  if (!res.ok) {
    throw new Error(`WordPress API error ${res.status} fetching ${tax}`);
  }
  const items = (await res.json()) as Array<{
    name: string;
    slug: string;
    description: string;
    count: number;
  }>;
  return items
    .filter((t) => t.slug !== "uncategorized")
    .map((t) => ({
      name: decodeEntities(t.name),
      slug: t.slug,
      description: t.description,
      count: t.count,
    }));
}
