import rss from "@astrojs/rss";
import type { APIContext, GetStaticPaths } from "astro";

import { getAllPosts, getCategories } from "../../../lib/essays";
import { SITE_TITLE } from "../../../consts.ts";
import { taxDescription } from "../../../taxonomies.ts";

export const getStaticPaths = (async () => {
  const categories = await getCategories();
  return categories.map((category) => ({
    params: { slug: category.slug },
    props: { category },
  }));
}) satisfies GetStaticPaths;

export async function GET(context: APIContext) {
  const { category } = context.props;
  const posts = await getAllPosts();
  const inCategory = posts.filter((post) =>
    post.categories.includes(category.name),
  );

  return rss({
    title: `${category.name} — ${SITE_TITLE}`,
    description:
      taxDescription(category.slug) ??
      `Essays filed under ${category.name} on ${SITE_TITLE}.`,
    site: context.site ?? "https://buthonestly.io",
    items: inCategory.map((post) => ({
      title: post.title,
      link: post.url,
      pubDate: post.date ? new Date(post.date) : undefined,
      description: post.excerpt,
      categories: post.categories,
    })),
    customData: "<language>en</language>",
  });
}
