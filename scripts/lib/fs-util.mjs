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

// Resolve a slug, a folder, or a path to `<slug>.md` to the essay's folder,
// searching essays then drafts. Returns { slug, dir, file }.
export async function resolveEssay(arg) {
  if (arg.endsWith(".md") && (await exists(arg))) {
    const dir = path.dirname(arg);
    return { slug: path.basename(dir), dir, file: arg };
  }
  const slug = arg.replace(/\/+$/, "").split("/").pop().replace(/\.md$/, "");
  for (const root of ESSAY_ROOTS) {
    const dir = path.join(root, slug);
    if (await exists(dir)) {
      return { slug, dir, file: path.join(dir, `${slug}.md`) };
    }
  }
  die(`Could not find essay "${arg}" under ${ESSAY_ROOTS.join(" or ")}.`);
}
