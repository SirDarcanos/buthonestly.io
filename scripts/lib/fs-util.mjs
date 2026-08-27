import { stat } from "node:fs/promises";
import path from "node:path";

export const ESSAY_ROOTS = ["src/content/essays", "src/content/drafts"];

export async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export function die(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

export async function resolveEssay(arg) {
  if (/\.mdx?$/.test(arg) && (await exists(arg))) {
    const dir = path.dirname(arg);
    return { slug: path.basename(dir), dir, file: arg };
  }
  const slug = arg
    .replace(/\/+$/, "")
    .split("/")
    .pop()
    .replace(/\.mdx?$/, "");
  for (const root of ESSAY_ROOTS) {
    const dir = path.join(root, slug);
    const extensions = root.endsWith("/drafts") ? [".mdx", ".md"] : [".mdx"];
    for (const extension of extensions) {
      const file = path.join(dir, `${slug}${extension}`);
      if (await exists(file)) return { slug, dir, file };
    }
  }
  die(`Could not find essay "${arg}" under ${ESSAY_ROOTS.join(" or ")}.`);
}
