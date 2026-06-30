/**
 * WordPress.com headless data layer for nicolamustone.com.
 *
 * Fetches published content from the public WordPress.com REST API at build
 * time and normalizes it so templates never touch raw API noise.
 *
 * Phase 0 findings that shape this file:
 *  - 4 posts, 0 pages. The hub project cards are real posts, so there is no
 *    getAllPages() — everything lives in posts.
 *  - No SEO plugin: the API exposes no populated SEO meta, so `seo` is derived
 *    from title / excerpt / featured image here.
 *  - Canonical is hard-set to the root domain regardless of what WordPress
 *    returns (de-risks the admin-subdomain question, see plan 0.3).
 */

import { SITE_URL, API_BASE } from "../consts.ts";

export type PostLink = Pick<Entry, "title" | "slug">;

export type Entry = {
  id: number;
  slug: string;
  type: "post";
  title: string;
  contentHtml: string;
  excerpt: string;
  date: string; // ISO
  modified: string; // ISO
  featuredImage?: string;
  featuredImageAlt?: string;
  tags: string[];
  categories: string[];
  stack: { name: string; items: string[] }[];
  highlights: string[];
  seo: {
    title: string;
    description: string;
    ogImage?: string;
    canonical: string;
  };
};

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
  meta?: { highlights?: string[] };
  _embedded?: {
    "wp:featuredmedia"?: Array<{
      alt_text?: string;
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

type StackTree = {
  parentName: Map<number, string>;
  childParent: Map<number, number>;
  order: number[];
};

/**
 * Fetch the whole `stack` taxonomy once and build parent/child maps. The post
 * embed strips a term's `parent`, so grouping is resolved from here instead —
 * fully data-driven, so adding parent groups in WordPress needs no code change.
 */
async function getStackTree(): Promise<StackTree> {
  const res = await fetch(
    `${API_BASE}/stack?per_page=100&_fields=id,name,parent`,
  );
  const parentName = new Map<number, string>();
  const childParent = new Map<number, number>();
  const order: number[] = [];
  if (res.ok) {
    const terms = (await res.json()) as Array<{
      id: number;
      name: string;
      parent: number;
    }>;
    for (const t of terms) {
      if (t.parent) {
        childParent.set(t.id, t.parent);
      } else {
        parentName.set(t.id, t.name);
        order.push(t.id);
      }
    }
  }
  return { parentName, childParent, order };
}

/** Group a post's assigned stack child terms under their parent group names. */
function groupStack(
  children: WpTerm[],
  tree: StackTree,
): { name: string; items: string[] }[] {
  const buckets = new Map<number, string[]>();
  for (const c of children) {
    const parentId = tree.childParent.get(c.id);
    if (parentId === undefined) continue; // a parent term itself, skip
    const list = buckets.get(parentId) ?? [];
    list.push(c.name);
    buckets.set(parentId, list);
  }
  return tree.order
    .filter((pid) => buckets.has(pid))
    .map((pid) => ({
      name: tree.parentName.get(pid)!,
      items: buckets.get(pid)!,
    }));
}

function normalize(post: WpPost, stackTree: StackTree): Entry {
  const media = post._embedded?.["wp:featuredmedia"]?.[0];
  const featuredImageAlt = media?.alt_text || undefined;

  const terms = (post._embedded?.["wp:term"] ?? []).flat();
  const tags = terms
    .filter((t) => t.taxonomy === "post_tag")
    .map((t) => t.name);
  const cats = terms
    .filter((t) => t.taxonomy === "category" && t.slug !== "uncategorized")
    .map((t) => t.name);
  const stack = groupStack(
    terms.filter((t) => t.taxonomy === "stack"),
    stackTree,
  );

  return {
    id: post.id,
    slug: post.slug,
    type: "post",
    title: decodeEntities(post.title.rendered),
    contentHtml: post.content.rendered,
    excerpt: toPlainText(post.excerpt.rendered),
    date: post.date,
    modified: post.modified,
    featuredImage: post.jetpack_featured_media_url || undefined,
    featuredImageAlt: featuredImageAlt,
    tags: tags,
    categories: cats,
    stack: stack,
    highlights: post.meta?.highlights ?? [],
    seo: {
      title: decodeEntities(post.title.rendered),
      description: truncate(toPlainText(post.excerpt.rendered)),
      ogImage: post.jetpack_featured_media_url || undefined,
      // Always the root domain, never the admin subdomain (plan 0.3).
      canonical: `${SITE_URL}/${post.slug}/`,
    },
  };
}

/**
 * Fetch every published post, paginating until exhausted.
 * At this site's scale (4 posts) one page suffices, but the pagination loop is
 * the exact mechanism buthonestly.io needs, so it is exercised here.
 */
export async function getAllPosts(): Promise<Entry[]> {
  const perPage = 100;
  let page = 1;
  const all: Entry[] = [];
  const stackTree = await getStackTree();

  while (true) {
    const url = `${API_BASE}/posts?per_page=${perPage}&page=${page}&_fields=id,slug,date,modified,title,excerpt,content,featured_media,jetpack_featured_media_url,meta,_links,_embedded&_embed=wp:featuredmedia,wp:term`;
    const res = await fetch(url);

    if (res.status === 400) break; // WP returns 400 past the last page
    if (!res.ok) {
      throw new Error(`WordPress API error ${res.status} fetching ${url}`);
    }

    const batch = (await res.json()) as WpPost[];
    if (batch.length === 0) break;

    all.push(...batch.map((post) => normalize(post, stackTree)));
    if (batch.length < perPage) break;
    page += 1;
  }

  return all;
}

export async function getPostBySlug(slug: string): Promise<Entry | undefined> {
  const posts = await getAllPosts();
  return posts.find((p) => p.slug === slug);
}
