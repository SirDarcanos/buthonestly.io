export type PostLink = Pick<Post, "title" | "slug">;

export type Post = {
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
