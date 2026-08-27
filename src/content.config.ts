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

const isDateOnly = (value: string | Date) => {
  if (value instanceof Date) {
    return (
      !Number.isNaN(+value) &&
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(+parsed) && parsed.toISOString().slice(0, 10) === value;
};

const dateOnly = z
  .union([z.string(), z.date()])
  .refine(isDateOnly, "must use the YYYY-MM-DD date-only format")
  .transform((value) => publishDate(value)!);

const essays = defineCollection({
  loader: glob({
    pattern: "**/*.mdx",
    base: "./src/content/essays",
    generateId: ({ entry }) => entry.replace(/\/[^/]+\.mdx?$/, ""),
  }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string(),
        date: dateOnly,
        updated: optional(dateOnly.optional()),
        sticky: optional(z.boolean().default(false)),
        cornerstone: optional(z.boolean().default(false)),
        cover: optional(image().optional()),
        coverAlt: optional(z.string().optional()),
        coverCaption: optional(z.string().optional()),
        excerpt: optional(z.string().optional()),
        newsletterIntro: z.string().trim().min(1),
        tags: stringList,
        categories: stringList,
        downloads: optional(
          z
            .array(z.object({ file: z.string(), label: z.string().optional() }))
            .optional(),
        ),
        audio: optional(
          z
            .string()
            .trim()
            .min(1)
            .regex(/^[^/\\]+$/, "must be a filename without a directory")
            .optional(),
        ),
      })
      .strict()
      .superRefine((d, ctx) => {
        const need = (ok: unknown, path: string, message: string) => {
          if (!ok) ctx.addIssue({ code: "custom", path: [path], message });
        };
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
