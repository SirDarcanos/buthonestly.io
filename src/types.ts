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
  featuredImage?: string;
  featuredImageAlt?: string;
  featuredImageCaption?: string;
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
