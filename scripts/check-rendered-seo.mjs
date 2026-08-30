import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createWindow } from "@mixmark-io/domino";
import { loadEssayInventory } from "../src/lib/essay-inventory.mjs";

const SITE_URL = "https://buthonestly.io";

const htmlFiles = (directory) =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => path.join(entry.parentPath, entry.name));

const pathnameForFile = (siteDirectory, file) => {
  const relative = path.relative(siteDirectory, file).split(path.sep).join("/");
  if (relative === "index.html") return "/";
  if (relative.endsWith("/index.html")) {
    return `/${relative.slice(0, -"index.html".length)}`;
  }
  return `/${relative.replace(/\.html$/, "/")}`;
};

const sitemapUrls = (siteDirectory) => {
  const index = readFileSync(
    path.join(siteDirectory, "sitemap-index.xml"),
    "utf8",
  );
  const sitemapFiles = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    ([, url]) => path.join(siteDirectory, new URL(url).pathname.slice(1)),
  );

  return new Set(
    sitemapFiles.flatMap((file) => {
      const sitemap = readFileSync(file, "utf8");
      return [
        ...sitemap.matchAll(/<url>.*?<loc>([^<]+)<\/loc>.*?<\/url>/gs),
      ].map(([, url]) => url);
    }),
  );
};

const schemas = (document) =>
  Array.from(
    document.querySelectorAll('script[type="application/ld+json"]'),
  ).map((script) => JSON.parse(script.textContent));

const duplicateWarnings = (pages, field) => {
  const pagesByValue = new Map();
  for (const page of pages) {
    const value = page[field];
    pagesByValue.set(value, [
      ...(pagesByValue.get(value) ?? []),
      page.pathname,
    ]);
  }

  return [...pagesByValue.entries()]
    .filter(([, pathnames]) => pathnames.length > 1)
    .map(
      ([value, pathnames]) =>
        `Duplicate ${field} on ${pathnames.join(", ")}: ${JSON.stringify(value)}`,
    );
};

export function checkRenderedSeo({
  siteDirectory,
  inventory = loadEssayInventory(),
}) {
  const urlsInSitemap = sitemapUrls(siteDirectory);
  const pages = htmlFiles(siteDirectory).map((file) => {
    const pathname = pathnameForFile(siteDirectory, file);
    const document = createWindow(readFileSync(file, "utf8")).document;
    const titles = document.querySelectorAll("title");
    const descriptions = document.querySelectorAll('meta[name="description"]');
    const canonicals = document.querySelectorAll('link[rel="canonical"]');
    const headings = document.querySelectorAll("h1");

    assert.equal(titles.length, 1, `${pathname} must render one title`);
    assert.equal(
      descriptions.length,
      1,
      `${pathname} must render one meta description`,
    );
    assert.equal(canonicals.length, 1, `${pathname} must render one canonical`);
    assert.equal(headings.length, 1, `${pathname} must render one H1`);

    const title = titles[0].textContent.trim();
    const description = descriptions[0].getAttribute("content").trim();
    const canonical = canonicals[0].getAttribute("href");

    assert.ok(title, `${pathname} must render a non-empty title`);
    assert.ok(description, `${pathname} must render a non-empty description`);
    assert.equal(
      canonical,
      new URL(pathname, SITE_URL).href,
      `${pathname} must self-canonicalize`,
    );

    const robots = document.querySelector('meta[name="robots"]');
    const isCanonicalEntryPoint =
      pathname !== "/404/" &&
      !/^\/(?:essays|section|topic)\/(?:[^/]+\/)?\d+\/$/.test(pathname);

    if (isCanonicalEntryPoint) {
      assert.doesNotMatch(
        robots?.getAttribute("content") ?? "",
        /(?:^|[,\s])noindex(?:$|[,\s])/i,
        `${pathname} must remain indexable`,
      );
      assert.ok(
        urlsInSitemap.has(canonical),
        `${pathname} is a canonical entry point missing from the sitemap`,
      );
    }

    return { pathname, title, description, canonical, document };
  });

  const pagesByCanonical = new Map(pages.map((page) => [page.canonical, page]));
  for (const url of urlsInSitemap) {
    const page = pagesByCanonical.get(url);
    assert.ok(page, `${url} is in the sitemap but has no rendered page`);
    assert.equal(
      page.canonical,
      url,
      `${url} must resolve to its canonical form`,
    );
  }

  for (const essay of inventory.published) {
    const page = pagesByCanonical.get(essay.canonicalUrl);
    assert.ok(page, `${essay.pathname} must be rendered when Published`);

    const articleSchemas = schemas(page.document).filter(
      (schema) => schema["@type"] === "Article",
    );
    assert.equal(
      articleSchemas.length,
      1,
      `${essay.pathname} must render one Article schema node`,
    );
    const article = articleSchemas[0];
    const h1 = page.document.querySelector("h1").textContent.trim();
    const lead = page.document.querySelector(".lead")?.textContent.trim();
    const visibleDates = new Set(
      Array.from(page.document.querySelectorAll("time[datetime]")).map((time) =>
        time.getAttribute("datetime"),
      ),
    );

    assert.equal(
      article.headline,
      h1,
      `${essay.pathname} schema must match its H1`,
    );
    assert.equal(article.headline, essay.title);
    assert.equal(article.description, essay.excerpt);
    assert.equal(
      lead,
      essay.excerpt,
      `${essay.pathname} schema description must match its visible lead`,
    );
    assert.equal(article.url, essay.canonicalUrl);
    assert.equal(article.mainEntityOfPage, essay.canonicalUrl);
    assert.equal(article.datePublished, essay.publishedAt.toISOString());
    assert.equal(article.dateModified, essay.freshnessAt.toISOString());
    assert.ok(
      visibleDates.has(article.datePublished),
      `${essay.pathname} must display its schema publication date`,
    );
    if (article.dateModified !== article.datePublished) {
      assert.ok(
        visibleDates.has(article.dateModified),
        `${essay.pathname} must display its schema modification date`,
      );
    }

    assert.equal(
      existsSync(path.join(siteDirectory, `${essay.slug}.md`)),
      true,
      `${essay.pathname} must have a Markdown alternative`,
    );
  }

  for (const essay of inventory.scheduled) {
    assert.equal(
      pagesByCanonical.has(essay.canonicalUrl),
      false,
      `${essay.pathname} must not render while Scheduled`,
    );
    assert.equal(
      urlsInSitemap.has(essay.canonicalUrl),
      false,
      `${essay.pathname} must not enter the sitemap while Scheduled`,
    );
    assert.equal(
      existsSync(path.join(siteDirectory, `${essay.slug}.md`)),
      false,
      `${essay.pathname} must not have a Markdown alternative while Scheduled`,
    );
  }

  return {
    pages: pages.length,
    sitemapUrls: urlsInSitemap.size,
    warnings: [
      ...duplicateWarnings(pages, "title"),
      ...duplicateWarnings(pages, "description"),
    ],
  };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  const siteDirectory = path.resolve(process.argv[2] ?? "dist");
  const result = checkRenderedSeo({ siteDirectory });
  for (const warning of result.warnings)
    console.warn(`SEO warning: ${warning}`);
  console.log(
    `Rendered SEO checks passed for ${result.pages} pages and ${result.sitemapUrls} sitemap URLs.`,
  );
}
