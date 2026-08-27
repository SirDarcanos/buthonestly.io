// Pre-commit: optimize staged essay images and format staged code, re-staging
// the results. Runs via .githooks/pre-commit (wired by the `prepare` script).
// A non-16:9 image makes optimize-images exit non-zero, which aborts the commit.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

// Keep in sync with optimize-images.mjs — GIF/SVG are intentionally excluded.
const IMAGE_RE = /\.(jpe?g|png|webp|avif|tiff?|bmp)$/i;
const CODE_RE = /\.(js|mjs|cjs|ts|astro|css|json)$/i;

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
const node = (script, ...args) =>
  execFileSync(process.execPath, [script, ...args], { stdio: "inherit" });
const add = (...files) => {
  const list = files.filter(Boolean);
  if (list.length) git("add", "--", ...list);
};

const staged = git("diff", "--cached", "--name-only", "--diff-filter=ACMR")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

const imgs = staged.filter(
  (f) => f.startsWith("src/content/") && IMAGE_RE.test(f) && existsSync(f),
);
if (imgs.length) {
  try {
    node("scripts/optimize-images.mjs", ...imgs);
  } catch {
    process.exit(1); // non-16:9 or error — abort the commit
  }
  for (const f of imgs) {
    add(f); // recompressed in place, or stage the deletion if it was converted
    // A conversion renames the file (webp/avif/tiff/bmp/png → .jpg, or → .png
    // when it carries transparency) — stage whichever new file appeared.
    for (const ext of [".jpg", ".png"]) {
      const converted = f.replace(/\.[^.]+$/, ext);
      if (converted !== f && existsSync(converted)) add(converted);
    }
    add(essaySource(f));
  }
  add("data/images-optimized.json");
}

const code = staged.filter((f) => CODE_RE.test(f) && existsSync(f));
if (code.length) {
  node("node_modules/prettier/bin/prettier.cjs", "--write", ...code);
  add(...code);
}

function essaySource(imagePath) {
  const directory = path.dirname(imagePath);
  const basename = path.basename(directory);
  const extensions = directory.includes(`${path.sep}drafts${path.sep}`)
    ? [".mdx", ".md"]
    : [".mdx"];
  return extensions
    .map((extension) => path.join(directory, `${basename}${extension}`))
    .find(existsSync);
}
