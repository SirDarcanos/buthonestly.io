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

// 1. Optimize staged essay images (resize/recompress/convert; block on non-16:9).
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
    add(essayMd(f)); // markdown ref rewritten on conversion
  }
  add("data/images-optimized.json");
}

// 2. Format staged code (Prettier skips ignored paths like data/ and content).
const code = staged.filter((f) => CODE_RE.test(f) && existsSync(f));
if (code.length) {
  node("node_modules/prettier/bin/prettier.cjs", "--write", ...code);
  add(...code);
}

// The essay markdown sits beside its images as <slug>/<slug>.md.
function essayMd(imgPath) {
  const dir = path.dirname(imgPath);
  const md = path.join(dir, `${path.basename(dir)}.md`);
  return existsSync(md) ? md : null;
}
