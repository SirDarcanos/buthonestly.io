import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// One folder per essay: src/content/essays/<slug>/<slug>.md, images colocated.
const essays = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/essays",
    generateId: ({ entry }) => entry.replace(/\/[^/]+\.md$/, ""),
  }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string(),
        date: z.coerce.date().optional(),
        updated: z.coerce.date().optional(),
        sticky: z.boolean().default(false),
        cornerstone: z.boolean().default(false),
        cover: image().optional(),
        coverAlt: z.string().optional(),
        coverCaption: z.string().optional(),
        originalCover: z.string().url().optional(), // migrated WP image, until a local cover exists
        excerpt: z.string().optional(),
        tags: z.array(z.string()).default([]),
        categories: z.array(z.string()).default([]),
        downloads: z
          .array(z.object({ file: z.string(), label: z.string().optional() }))
          .optional(),
      })
      .superRefine((d, ctx) => {
        const need = (ok: unknown, path: string, message: string) => {
          if (!ok) ctx.addIssue({ code: "custom", path: [path], message });
        };
        need(d.date, "date", "published date required once live/scheduled");
        need(
          d.cover || d.originalCover,
          "cover",
          "a local cover (or migrated originalCover) required once live/scheduled",
        );
        need(d.coverAlt, "coverAlt", "alt text required once live/scheduled");
        need(
          d.categories.length,
          "categories",
          "at least one category required",
        );
        need(d.tags.length, "tags", "at least one tag required");
      }),
});

export const collections = { essays };
