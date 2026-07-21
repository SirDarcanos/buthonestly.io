import type { ImageMetadata } from "astro";

export type PostLink = Pick<Post, "title" | "slug">;

export type Post = {
  id: string; // slug
  slug: string;
  url: string;
  type: "post";
  title: string;
  body: string; // raw Markdown (used for reading-time; the page renders <Content />)
  excerpt: string;
  date: string; // ISO
  modified: string; // ISO
  // The cover for the Picture component — a local imported image, optimized to
  // AVIF/WebP at build time.
  cover?: ImageMetadata;
  featuredImage?: string; // absolute URL string, for og:image / social only
  featuredImageAlt?: string;
  featuredImageCaption?: string;
  tags: string[];
  categories: string[];
  sticky: boolean;
  cornerstone: boolean;
  seo: {
    title: string;
    description: string;
    ogImage?: string;
    canonical: string;
  };
};

export type Tax = {
  name: string;
  slug: string;
  description?: string;
  count: number;
};
