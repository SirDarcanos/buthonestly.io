import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const essays = defineCollection({
  loader: glob({
    pattern: "**/*.mdx",
    base: "./src/content/essays",
    generateId: ({ entry }) => entry.replace(/\/[^/]+\.mdx$/, ""),
  }),
  schema: ({ image }) => z.object({ cover: image() }).passthrough(),
});

export const collections = { essays };
