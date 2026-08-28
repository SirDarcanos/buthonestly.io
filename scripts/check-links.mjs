import fs from "node:fs";
import path from "node:path";
import { loadEssayInventory } from "../src/lib/essay-inventory.mjs";
import {
  contentWithoutMarkdownCode,
  extractInternalMarkdownLinks,
} from "../src/lib/internal-prose-links.mjs";

const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
};

const essaysDirectory = valueAfter("--essays-dir") ?? "src/content/essays";
const pagesDirectory = valueAfter("--pages-dir") ?? "src/pages";
const publicDirectory = valueAfter("--public-dir") ?? "public";
if (!essaysDirectory || !pagesDirectory || !publicDirectory) {
  console.error(
    "Usage: node scripts/check-links.mjs [--essays-dir <path>] [--pages-dir <path>] [--public-dir <path>]",
  );
  process.exit(2);
}

let inventory;
try {
  inventory = loadEssayInventory({ essaysDirectory });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const staticRoutes = (directory, relative = "") => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      return staticRoutes(path.join(directory, entry.name), relativePath);
    }
    if (relativePath.split("/").some((segment) => segment.includes("["))) {
      return [];
    }
    const routeFile = relativePath.replace(/\.(?:astro|ts)$/, "");
    if (routeFile === relativePath) return [];
    const withoutIndex = routeFile.replace(/(?:^|\/)index$/, "");
    const pathname = `/${withoutIndex}`.replace(/\/{2,}/g, "/");
    return [
      pathname === "/" || path.posix.extname(pathname)
        ? pathname
        : `${pathname}/`,
    ];
  });
};

const routes = new Set(["/essays/", ...staticRoutes(pagesDirectory)]);
for (const essay of inventory.essays) {
  routes.add(essay.pathname);
  for (const category of essay.categories) routes.add(category.pathname);
  for (const tag of essay.tags) routes.add(tag.pathname);
}

const downloads = new Set(
  inventory.essays.flatMap((essay) =>
    essay.downloads.map(({ file }) => `/downloads/${file}`),
  ),
);
const publishedSlugs = new Set(inventory.published.map(({ slug }) => slug));
const issues = [];
const addIssue = (essay, kind, value) => issues.push([essay.slug, kind, value]);
const pathnameFrom = (url) => url.split(/[?#]/, 1)[0];
const canonicalPath = (pathname) =>
  pathname === "/" || pathname.endsWith("/") || path.posix.extname(pathname)
    ? pathname
    : `${pathname}/`;

for (const essay of inventory.essays) {
  const essayDirectory = path.dirname(essay.sourcePath);
  if (
    !/^https?:\/\//i.test(essay.cover) &&
    !fs.existsSync(path.resolve(essayDirectory, essay.cover))
  ) {
    addIssue(essay, "cover", essay.cover);
  }

  const scannableBody = contentWithoutMarkdownCode(essay.body);
  for (const match of scannableBody.matchAll(
    /^import(?:\s+[\s\S]*?\s+from\s+)?["']([^"']+)["'];?[ \t]*$/gm,
  )) {
    const importedPath = match[1];
    if (
      importedPath.startsWith(".") &&
      !fs.existsSync(path.resolve(essayDirectory, importedPath))
    ) {
      addIssue(essay, "asset", importedPath);
    }
  }

  for (const match of scannableBody.matchAll(
    /https?:\/\/[^\s)"'<>]*(?:\.wp\.com|wp-content\/uploads|wpcomstaging\.com)[^\s)"'<>]*/gi,
  )) {
    addIssue(essay, "wordpress url", match[0].slice(0, 90));
  }

  for (const match of scannableBody.matchAll(
    /(?:<img[^>]+src=["']|!\[[^\]]*\]\(\s*)([^"'\s)>]+)/gi,
  )) {
    const assetPath = match[1].replace(/^<|>$/g, "").split(/[?#]/, 1)[0];
    if (
      !assetPath ||
      /^(?:https?:)?\/\//i.test(assetPath) ||
      assetPath.startsWith("data:")
    ) {
      continue;
    }
    const resolvedAsset = assetPath.startsWith("/")
      ? path.resolve(publicDirectory, assetPath.replace(/^\/+/, ""))
      : path.resolve(essayDirectory, assetPath);
    if (!fs.existsSync(resolvedAsset)) {
      addIssue(essay, "asset", assetPath);
    }
  }

  for (const url of extractInternalMarkdownLinks(essay.body)) {
    const pathname = pathnameFrom(url);
    if (pathname.startsWith("/downloads/")) {
      if (!downloads.has(pathname)) addIssue(essay, "download", pathname);
      continue;
    }

    const expectedPath = canonicalPath(pathname);
    if (routes.has(pathname)) {
      const targetSlug = pathname.match(/^\/([^/]+)\/$/)?.[1];
      if (
        publishedSlugs.has(essay.slug) &&
        targetSlug &&
        inventory.get(targetSlug) &&
        !publishedSlugs.has(targetSlug)
      ) {
        addIssue(essay, "unpublished", `${pathname} is not live yet`);
      }
      continue;
    }
    if (routes.has(expectedPath)) {
      addIssue(essay, "canonical", `${pathname} should be ${expectedPath}`);
      continue;
    }
    addIssue(essay, "internal", pathname);
  }
}

if (issues.length === 0) {
  console.log(
    `✓ Links OK — ${inventory.essays.length} essays; internal links and local assets resolve.`,
  );
  process.exit(0);
}

console.error(`✗ ${issues.length} problem(s):\n`);
for (const [slug, kind, value] of issues) {
  console.error(`  ${slug}  [${kind}]  ${value}`);
}
process.exit(1);
