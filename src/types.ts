import type { ImageMetadata } from "astro";

export type PostLink = Pick<Post, "title" | "slug">;

export type Post = {
  id: string; // slug
  slug: string;
  url: string;
  type: "post";
  title: string;
  body: string; // raw Markdown
  excerpt: string;
  date: string; // ISO
  modified: string; // ISO
  cover?: ImageMetadata;
  featuredImage?: string; // absolute URL, for og:image / social only
  featuredImageAlt?: string;
  featuredImageCaption?: string;
  tags: string[];
  categories: string[];
  sticky: boolean;
  cornerstone: boolean;
  contentHash: string;
  narrationUrl?: string;
  downloads: { file: string; label?: string }[];
  seo: {
    title: string;
    description: string;
    ogImage?: string;
    canonical: string;
  };
};

export type Feed = {
  title: string;
  href: string;
};

export type Tax = {
  name: string;
  slug: string;
  description?: string;
  count: number;
};
