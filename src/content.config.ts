import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { publishDate } from "./lib/publish-time.mjs";

// Derived from `z` rather than written as `z.ZodTypeAny`: zod 4 dropped the
// type-level `z` namespace, so that spelling fails to compile.
type Schema = Parameters<typeof z.preprocess>[1];

// The template ships every property, so blanks arrive as YAML null, which
// `.optional()` rejects (it allows only `undefined`).
const optional = <T extends Schema>(schema: T) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), schema);

const stringList = z.preprocess(
  (v) => (Array.isArray(v) ? v.filter((x) => x != null && x !== "") : []),
  z.array(z.string()),
);

// Frontmatter dates are UTC regardless of the machine reading them, and a bare
// date takes the standard publish slot. See src/lib/publish-time.mjs.
const utcDate = z.preprocess((v) => publishDate(v) ?? undefined, z.date());

// One folder per essay: src/content/essays/<slug>/<slug>.{md,mdx}, images colocated.
const essays = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/essays",
    generateId: ({ entry }) => entry.replace(/\/[^/]+\.mdx?$/, ""),
  }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string(),
        date: optional(utcDate.optional()),
        updated: optional(utcDate.optional()),
        sticky: optional(z.boolean().default(false)),
        cornerstone: optional(z.boolean().default(false)),
        cover: optional(image().optional()),
        coverAlt: optional(z.string().optional()),
        coverCaption: optional(z.string().optional()),
        excerpt: optional(z.string().optional()),
        tags: stringList,
        categories: stringList,
        downloads: optional(
          z
            .array(z.object({ file: z.string(), label: z.string().optional() }))
            .optional(),
        ),
        // Flat rather than a nested `audio:` map because Obsidian's Properties
        // editor shows nested objects as "Unknown format". Loose by design: the
        // audio script validates these, so a typo never fails the site build.
        audioVoice: optional(z.string().optional()),
        audioStyle: optional(z.string().optional()),
        audioPace: optional(z.string().optional()),
      })
      .superRefine((d, ctx) => {
        const need = (ok: unknown, path: string, message: string) => {
          if (!ok) ctx.addIssue({ code: "custom", path: [path], message });
        };
        need(d.date, "date", "published date required once live/scheduled");
        need(d.cover, "cover", "a local cover required once live/scheduled");
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
