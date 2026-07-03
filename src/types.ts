export type PostLink = Pick<Post, "title" | "slug">;

export type Post = {
  id: number;
  slug: string;
  url: string;
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
