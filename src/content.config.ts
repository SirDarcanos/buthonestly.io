import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// The template ships every property, so blanks arrive as YAML null. `.optional()`
// allows `undefined` (missing) but NOT `null` (present-but-empty), so normalise
// "" / null to absent before each optional validator, and clean list values.
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), schema);

// null / "" / non-array → []; also drops blank items (e.g. an empty bullet).
const stringList = z.preprocess(
  (v) => (Array.isArray(v) ? v.filter((x) => x != null && x !== "") : []),
  z.array(z.string()),
);

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
        date: optional(z.coerce.date().optional()),
        updated: optional(z.coerce.date().optional()),
        sticky: optional(z.boolean().default(false)),
        cornerstone: optional(z.boolean().default(false)),
        cover: optional(image().optional()),
        coverAlt: optional(z.string().optional()),
        coverCaption: optional(z.string().optional()),
        originalCover: optional(z.string().url().optional()), // migrated WP image, until a local cover exists
        excerpt: optional(z.string().optional()),
        tags: stringList,
        categories: stringList,
        downloads: optional(
          z
            .array(z.object({ file: z.string(), label: z.string().optional() }))
            .optional(),
        ),
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
