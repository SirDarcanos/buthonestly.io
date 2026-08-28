import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { SITE_URL } from "../consts.ts";
import { STATIC_BASE } from "./cdn.mjs";
import { narrationUrl } from "./narration.mjs";
import { publishDate } from "./publish-time.mjs";

const ESSAY_EXTENSION = ".mdx";
const METADATA_FIELDS = new Set([
  "title",
  "date",
  "updated",
  "sticky",
  "cornerstone",
  "cover",
  "coverAlt",
  "coverCaption",
  "excerpt",
  "newsletterIntro",
  "tags",
  "categories",
  "downloads",
  "audio",
]);

export class EssayInventoryError extends Error {
  constructor(diagnostics) {
    super(
      `Essay inventory contains ${diagnostics.length} problem(s):\n${diagnostics
        .map(({ file, message }) => `  ${file ?? "inventory"}: ${message}`)
        .join("\n")}`,
    );
    this.name = "EssayInventoryError";
    this.diagnostics = diagnostics;
  }
}

const diagnostic = (code, file, message, field) => ({
  code,
  file,
  field,
  message,
});

const frontmatterScalar = (frontmatter, key) =>
  frontmatter
    .match(new RegExp(`^${key}:[ \\t]*(.*?)[ \\t]*$`, "m"))?.[1]
    ?.replace(/^(["'])(.*)\1$/, "$2");

const strictDateOnly = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(+parsed) && parsed.toISOString().slice(0, 10) === value;
};

const normalizedDate = (
  data,
  frontmatter,
  key,
  file,
  diagnostics,
  { optional = false } = {},
) => {
  const authored = frontmatterScalar(frontmatter, key);
  if (optional && !authored && (data[key] == null || data[key] === "")) {
    return null;
  }
  if (authored && strictDateOnly(authored)) return publishDate(authored);

  diagnostics.push(
    diagnostic(
      "invalid-date",
      file,
      `${key} must use the YYYY-MM-DD date-only format`,
      key,
    ),
  );
  return null;
};

const requiredString = (data, field, file, diagnostics) => {
  const value = typeof data[field] === "string" ? data[field].trim() : "";
  if (value) return value;
  diagnostics.push(
    diagnostic(
      "invalid-metadata",
      file,
      `${field} must be a non-empty string`,
      field,
    ),
  );
  return "";
};

export const resolveEssayCoverPath = (sourcePath, cover) =>
  typeof cover === "string" && cover.trim()
    ? path.resolve(path.dirname(sourcePath), cover.trim())
    : null;

export const readEssayCoverPath = (sourcePath) =>
  resolveEssayCoverPath(
    sourcePath,
    matter(readFileSync(sourcePath, "utf8")).data.cover,
  );

export const taxonomySlug = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeTaxonomy = (value, kind, siteBase, file, field, diagnostics) => {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push(
      diagnostic(
        "invalid-metadata",
        file,
        `${field} must contain at least one term`,
        field,
      ),
    );
    return [];
  }

  const terms = [];
  const seenNames = new Set();
  const namesBySlug = new Map();
  for (const item of value) {
    const name = typeof item === "string" ? item.trim() : "";
    if (!name) {
      diagnostics.push(
        diagnostic(
          "invalid-metadata",
          file,
          `${field} terms must be non-empty strings`,
          field,
        ),
      );
      continue;
    }
    if (seenNames.has(name)) continue;
    seenNames.add(name);

    const slug = taxonomySlug(name);
    const collidingName = namesBySlug.get(slug);
    if (!slug || (collidingName && collidingName !== name)) {
      diagnostics.push(
        diagnostic(
          "taxonomy-collision",
          file,
          `${field} terms must have distinct URL slugs`,
          field,
        ),
      );
      continue;
    }
    namesBySlug.set(slug, name);
    const pathname = `/${kind}/${slug}/`;
    terms.push({
      name,
      slug,
      pathname,
      canonicalUrl: new URL(pathname, siteBase).toString(),
    });
  }
  return terms;
};

const normalizeBoolean = (value, field, file, diagnostics) => {
  if (value == null || value === "") return false;
  if (typeof value === "boolean") return value;
  diagnostics.push(
    diagnostic(
      "invalid-metadata",
      file,
      `${field} must be true or false`,
      field,
    ),
  );
  return false;
};

const normalizeDownloads = (value, file, diagnostics) => {
  if (value == null || value === "") return [];
  if (!Array.isArray(value)) {
    diagnostics.push(
      diagnostic(
        "invalid-metadata",
        file,
        "downloads must be a list",
        "downloads",
      ),
    );
    return [];
  }

  return value.flatMap((download) => {
    const filename =
      download && typeof download.file === "string" ? download.file.trim() : "";
    const label =
      download && typeof download.label === "string"
        ? download.label.trim()
        : undefined;
    if (!filename) {
      diagnostics.push(
        diagnostic(
          "invalid-metadata",
          file,
          "each download must name a file",
          "downloads",
        ),
      );
      return [];
    }
    return [{ file: filename, ...(label ? { label } : {}) }];
  });
};

const normalizeBaseUrl = (value, name) => {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new TypeError(`${name} must use HTTP or HTTPS`);
  }
  url.search = "";
  url.hash = "";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/`;
  return url;
};

const publicContentHash = (essay) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        slug: essay.slug,
        title: essay.title,
        excerpt: essay.excerpt,
        body: essay.body,
        publishedAt: essay.publishedAt.toISOString(),
        freshnessAt: essay.freshnessAt.toISOString(),
        canonicalUrl: essay.canonicalUrl,
        categories: essay.categories.map(({ name }) => name),
        tags: essay.tags.map(({ name }) => name),
        narrationUrl: essay.narrationUrl ?? null,
        cover: essay.cover,
        coverAlt: essay.coverAlt,
        coverCaption: essay.coverCaption ?? null,
        downloads: essay.downloads,
        sticky: essay.sticky,
      }),
    )
    .digest("hex");

export function getPublicationState(
  essay,
  { at = new Date(), productionContentHash } = {},
) {
  if (essay.publishedAt > at) return "scheduled";
  return productionContentHash &&
    productionContentHash === essay.publicContentHash
    ? "live"
    : "published";
}

const discoverSources = (essaysDirectory) => {
  if (!existsSync(essaysDirectory)) return { sources: [], diagnostics: [] };

  const sources = [];
  const diagnostics = [];
  for (const entry of readdirSync(essaysDirectory, {
    withFileTypes: true,
  }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(essaysDirectory, entry.name);
    const candidates = readdirSync(directory, { withFileTypes: true })
      .filter(
        (file) =>
          file.isFile() &&
          [".md", ESSAY_EXTENSION].includes(path.extname(file.name)),
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const candidate of candidates) {
      const extension = path.extname(candidate.name);
      const basename = path.basename(candidate.name, extension);
      const sourcePath = path.join(directory, candidate.name);
      if (extension !== ESSAY_EXTENSION) {
        diagnostics.push(
          diagnostic(
            "invalid-source-format",
            sourcePath,
            "essay sources must use the .mdx extension",
          ),
        );
        continue;
      }
      if (basename !== entry.name) {
        diagnostics.push(
          diagnostic(
            "invalid-layout",
            sourcePath,
            `source basename must match its directory slug "${entry.name}"`,
          ),
        );
        continue;
      }
      sources.push({ slug: entry.name, sourcePath });
    }
  }

  return { sources, diagnostics };
};

export function loadEssayInventory({
  essaysDirectory = "src/content/essays",
  siteUrl = SITE_URL,
  staticBase = STATIC_BASE,
  now = new Date(),
} = {}) {
  const { sources, diagnostics } = discoverSources(essaysDirectory);
  if (diagnostics.length) throw new EssayInventoryError(diagnostics);

  const siteBase = normalizeBaseUrl(siteUrl, "siteUrl");
  const staticBaseUrl = normalizeBaseUrl(staticBase, "staticBase");
  const essays = [];
  for (const source of sources) {
    const sourceContent = readFileSync(source.sourcePath, "utf8");
    const parsed = matter(sourceContent);
    for (const field of Object.keys(parsed.data)) {
      if (!METADATA_FIELDS.has(field)) {
        diagnostics.push(
          diagnostic(
            "invalid-metadata",
            source.sourcePath,
            `${field} is not supported essay metadata`,
            field,
          ),
        );
      }
    }
    const rawFrontmatter = sourceContent.match(
      /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
    )?.[1];
    const publishedAt = normalizedDate(
      parsed.data,
      rawFrontmatter ?? "",
      "date",
      source.sourcePath,
      diagnostics,
    );
    const updatedAt = normalizedDate(
      parsed.data,
      rawFrontmatter ?? "",
      "updated",
      source.sourcePath,
      diagnostics,
      { optional: true },
    );
    const title = requiredString(
      parsed.data,
      "title",
      source.sourcePath,
      diagnostics,
    );
    const excerpt = requiredString(
      parsed.data,
      "excerpt",
      source.sourcePath,
      diagnostics,
    );
    const newsletterIntro = requiredString(
      parsed.data,
      "newsletterIntro",
      source.sourcePath,
      diagnostics,
    );
    const cover = requiredString(
      parsed.data,
      "cover",
      source.sourcePath,
      diagnostics,
    );
    const coverAlt = requiredString(
      parsed.data,
      "coverAlt",
      source.sourcePath,
      diagnostics,
    );
    const categories = normalizeTaxonomy(
      parsed.data.categories,
      "section",
      siteBase,
      source.sourcePath,
      "categories",
      diagnostics,
    );
    const tags = normalizeTaxonomy(
      parsed.data.tags,
      "topic",
      siteBase,
      source.sourcePath,
      "tags",
      diagnostics,
    );
    const downloads = normalizeDownloads(
      parsed.data.downloads,
      source.sourcePath,
      diagnostics,
    );
    const sticky = normalizeBoolean(
      parsed.data.sticky,
      "sticky",
      source.sourcePath,
      diagnostics,
    );
    const cornerstone = normalizeBoolean(
      parsed.data.cornerstone,
      "cornerstone",
      source.sourcePath,
      diagnostics,
    );
    const narrationFile =
      typeof parsed.data.audio === "string" && parsed.data.audio.trim()
        ? parsed.data.audio.trim()
        : undefined;
    if (narrationFile && /[\\/]/.test(narrationFile)) {
      diagnostics.push(
        diagnostic(
          "invalid-metadata",
          source.sourcePath,
          "audio must be a filename without a directory",
          "audio",
        ),
      );
    }
    if (!publishedAt) continue;

    const pathname = `/${source.slug}/`;
    const essay = {
      ...source,
      sourceContent,
      body: parsed.content.replace(/\r\n?/g, "\n"),
      title,
      excerpt,
      newsletterIntro,
      publishedAt,
      publicationDay: publishedAt.toISOString().slice(0, 10),
      updatedAt,
      freshnessAt:
        updatedAt && updatedAt > publishedAt ? updatedAt : publishedAt,
      pathname,
      canonicalUrl: new URL(pathname, siteBase).toString(),
      categories,
      tags,
      narrationUrl:
        narrationFile && !/[\\/]/.test(narrationFile)
          ? narrationUrl(narrationFile, staticBaseUrl.toString())
          : undefined,
      cover,
      coverPath: resolveEssayCoverPath(source.sourcePath, cover),
      coverAlt,
      coverCaption:
        typeof parsed.data.coverCaption === "string"
          ? parsed.data.coverCaption.trim()
          : undefined,
      downloads,
      sticky,
      cornerstone,
    };
    essays.push({
      ...essay,
      publicContentHash: publicContentHash(essay),
    });
  }
  if (diagnostics.length) throw new EssayInventoryError(diagnostics);

  const bySlug = new Map(essays.map((essay) => [essay.slug, essay]));
  const published = essays.filter((essay) => essay.publishedAt <= now);
  const scheduled = essays.filter((essay) => essay.publishedAt > now);

  return {
    essays,
    published,
    scheduled,
    bySlug,
    get: (slug) => bySlug.get(slug),
  };
}
