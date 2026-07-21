// Static pages get no lastmod on purpose: Google discounts the signal site-wide
// if it doesn't track real changes, so absent beats invented.
//
// Reads Markdown directly because astro.config.mjs runs before the content layer.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const ESSAYS_DIR = "src/content/essays";

const slugify = (name) =>
  String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/** @returns {Map<string, Date>} site-relative path (with trailing slash) → date */
export function buildLastmodMap() {
  const now = new Date();
  const map = new Map();
  const bump = (p, d) => {
    const current = map.get(p);
    if (!current || d > current) map.set(p, d);
  };

  if (!existsSync(ESSAYS_DIR)) return map;

  for (const slug of readdirSync(ESSAYS_DIR)) {
    const file = path.join(ESSAYS_DIR, slug, `${slug}.md`);
    if (!existsSync(file)) continue;

    const { data } = matter(readFileSync(file, "utf8"));
    const published = data.date ? new Date(data.date) : null;
    if (!published || Number.isNaN(published.valueOf()) || published > now) {
      continue; // mirrors getPublishedEssays — future-dated essays aren't built
    }

    const updated = data.updated ? new Date(data.updated) : null;
    const lastmod =
      updated && !Number.isNaN(updated.valueOf()) && updated > published
        ? updated
        : published;

    bump(`/${slug}/`, lastmod);
    bump("/", lastmod);
    bump("/essays/", lastmod);
    for (const c of asList(data.categories))
      bump(`/section/${slugify(c)}/`, lastmod);
    for (const t of asList(data.tags)) bump(`/topic/${slugify(t)}/`, lastmod);
  }

  const newest = [...map.values()].reduce(
    (a, b) => (b > a ? b : a),
    new Date(0),
  );
  if (newest > new Date(0)) {
    bump("/section/", newest);
    bump("/topic/", newest);
  }

  return map;
}
