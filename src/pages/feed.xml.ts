import rss from "@astrojs/rss";
import type { APIContext } from "astro";

import { getAllPosts } from "../lib/essays";

// The static /feed/ redirect points here, so this path cannot change without
// stranding existing subscribers.
export async function GET(context: APIContext) {
  const posts = await getAllPosts();

  return rss({
    title: "BUT. Honestly",
    description:
      "New essays each month on leadership, programming, and the messy overlap between humans and tech.",
    site: context.site ?? "https://buthonestly.io",
    items: posts.map((post) => ({
      title: post.title,
      link: post.url,
      pubDate: post.date ? new Date(post.date) : undefined,
      description: post.excerpt,
      categories: post.categories,
    })),
    customData: "<language>en</language>",
  });
}
