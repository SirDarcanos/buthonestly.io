// Builds a path → last-modified map for the sitemap's <lastmod>.
//
// Google uses lastmod to prioritise recrawls, but only where it trusts the
// value — a date that doesn't correspond to a real change trains it to ignore
// the signal site-wide. So this only returns a date for pages whose freshness we
// genuinely know (essays, and the archives that list them) and returns nothing
// for the static pages. An absent lastmod is better than an invented one.
//
// Imported by astro.config.mjs, which runs in plain Node before the content
// layer exists — hence reading the Markdown directly rather than via
// getCollection. Frontmatter parsing is duplicated from the standalone scripts
// for the same reason; they can't import the TS lib either.

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
  /** Keep the newest date seen for a path. */
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
    // A listing is as fresh as the newest thing on it.
    bump("/", lastmod);
    bump("/essays/", lastmod);
    for (const c of asList(data.categories))
      bump(`/section/${slugify(c)}/`, lastmod);
    for (const t of asList(data.tags)) bump(`/topic/${slugify(t)}/`, lastmod);
  }

  // The hub indexes list every term, so they change whenever anything does.
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
