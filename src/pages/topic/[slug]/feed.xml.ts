import rss from "@astrojs/rss";
import type { APIContext, GetStaticPaths } from "astro";

import { getAllPosts, getTags } from "../../../lib/essays";
import { SITE_TITLE } from "../../../consts.ts";
import { taxDescription } from "../../../taxonomies.ts";

export const getStaticPaths = (async () => {
  const tags = await getTags();
  return tags.map((tag) => ({
    params: { slug: tag.slug },
    props: { tag },
  }));
}) satisfies GetStaticPaths;

export async function GET(context: APIContext) {
  const { tag } = context.props;
  const posts = await getAllPosts();
  const tagged = posts.filter((post) => post.tags.includes(tag.name));

  return rss({
    title: `${tag.name} — ${SITE_TITLE}`,
    description:
      taxDescription(tag.slug) ?? `Essays tagged ${tag.name} on ${SITE_TITLE}.`,
    site: context.site ?? "https://buthonestly.io",
    items: tagged.map((post) => ({
      title: post.title,
      link: post.url,
      pubDate: post.date ? new Date(post.date) : undefined,
      description: post.excerpt,
      categories: post.tags,
    })),
    customData: "<language>en</language>",
  });
}
