// Optimize essay source images in place so you can drop in full-size originals
// (no more iloveimg). Resizes, recompresses, and normalizes formats to JPEG;
// Astro re-encodes to AVIF at build, so this only keeps the committed SOURCES
// predictable. A content-hash manifest makes re-runs idempotent. Local tool.
//
//   npm run images                 # all essays + drafts
//   npm run images -- <slug|path>  # just one essay
//
// Covers must be 16:9 (that's the shape the cover layout renders) — a non-16:9
// cover is flagged and skipped, since resizing by width never crops and would
// ship distorted; fix the source instead. Body images can be any shape; only
// their width matters, and anything narrower than the reading column gets a
// non-blocking note. WebP/AVIF/TIFF/BMP are converted to JPEG (PNG when they
// carry transparency), with Markdown references rewritten to match.

import { readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";

import { exists, die, resolveEssay, ESSAY_ROOTS } from "./lib/fs-util.mjs";

const MANIFEST = "data/images-optimized.json";
const MAX_WIDTH = 1376; // 2× the 688px body column; ≥ the cover's 1160 need
const JPEG_QUALITY = 80;
const PNG_TO_JPEG_MIN_BYTES = 100_000; // only big opaque PNGs become JPEG
const COLUMN_WIDTH = 688; // the reading column — body images below this look soft
// Formats handled here. WebP/AVIF/TIFF/BMP are normalized to JPEG (or PNG when
// they carry transparency) so essays ship two predictable source formats.
// GIFs and SVGs are deliberately absent — they're served as-is (Astro emits
// animated WebP for GIFs; see rehype-image-format.mjs) and exempt from all of
// this. Animated sources of any format are skipped rather than flattened.
const IMAGE_RE = /\.(jpe?g|png|webp|avif|tiff?|bmp)$/i;
const RATIO_16_9 = 16 / 9;
const RATIO_TOLERANCE = 0.02;

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  // Explicit image paths (the pre-commit hook passes staged files); otherwise a
  // slug/essay; otherwise everything.
  const fileMode = args.length > 0 && args.every((a) => IMAGE_RE.test(a));
  const manifest = await loadManifest();
  const files = fileMode
    ? args
    : args.length
      ? await filesForArg(args[0])
      : await allFiles();
  if (!files.length) {
    if (fileMode) return; // nothing to do (e.g. hook with no staged images)
    die("No optimizable images found (GIF/SVG are exempt by design).");
  }

  let optimized = 0,
    converted = 0,
    skipped = 0,
    savedBytes = 0;
  const flagged = [];
  const narrow = [];

  for (const abs of files) {
    const rel = path.relative(".", abs);
    const r = await processFile(abs, rel, manifest);
    if (r.flagged) {
      flagged.push(`${rel} (${r.dims})`);
      continue;
    }
    if (r.narrow) narrow.push(`${rel} (${r.width}px wide)`);
    if (r.skipped) {
      skipped++;
      continue;
    }
    if (r.converted) converted++;
    else optimized++;
    savedBytes += r.saved;
    console.log(
      `${r.converted ? `→${r.to}`.padEnd(6) : "opt   "}${rel}` +
        `${r.converted ? ` (from ${r.from})` : ""}` +
        `${r.resized ? ` (resized to ${MAX_WIDTH}px)` : ""}` +
        `  ${kb(r.before)} → ${kb(r.after)}`,
    );
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  if (narrow.length) {
    console.log(
      `\nNote: ${narrow.length} body image(s) narrower than the ${COLUMN_WIDTH}px reading column —` +
        ` they'll look soft. Not blocking:`,
    );
    for (const n of narrow) console.log(`  ${n}`);
  }
  if (flagged.length) {
    console.log(
      `\n⚠ Skipped ${flagged.length} cover(s) that aren't 16:9 — fix these:`,
    );
    for (const f of flagged) console.log(`  ${f}`);
  }
  console.log(
    `\nDone: ${optimized} optimized, ${converted} converted, ${skipped} unchanged. ` +
      `Saved ${kb(savedBytes)}.`,
  );
  if (flagged.length) process.exitCode = 1; // non-zero so the pre-commit blocks
}

// The essay's `cover:` filename, so only that image is held to the 16:9 rule.
// Body images carry whatever shape the content needs (a wide dataset strip, a
// tall diagram) — width is what matters for them. Cached per essay folder.
const coverCache = new Map();
async function coverBasename(dir) {
  if (coverCache.has(dir)) return coverCache.get(dir);
  let name = null;
  try {
    const text = await readFile(
      path.join(dir, `${path.basename(dir)}.md`),
      "utf8",
    );
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const m = fm?.[1].match(/^cover:\s*(.+?)\s*$/m);
    if (m) name = path.basename(m[1].replace(/^["']|["']$/g, ""));
  } catch {
    // No essay markdown beside the image — treat everything as a body image.
  }
  coverCache.set(dir, name);
  return name;
}

async function processFile(abs, rel, manifest) {
  const buf = await readFile(abs);
  const inputHash = sha256(buf);
  if (manifest[rel] === inputHash) return { skipped: true };

  const meta = await sharp(buf).metadata();
  const { width = 0, height = 0 } = meta;
  if (!width || !height) return { flagged: true, dims: "unreadable" };

  // Animated sources (animated WebP, multi-page TIFF) would lose their frames
  // in a still re-encode — leave them exactly as they are.
  if ((meta.pages ?? 1) > 1) {
    manifest[rel] = inputHash;
    return { skipped: true };
  }

  // Only the cover must be 16:9 — that's the shape the cover layout renders.
  const isCover =
    path.basename(abs) === (await coverBasename(path.dirname(abs)));
  if (isCover && Math.abs(width / height - RATIO_16_9) > RATIO_TOLERANCE) {
    return { flagged: true, dims: `${width}×${height}` };
  }

  const alpha = meta.hasAlpha && (await hasTransparency(buf));
  const curExt = path.extname(abs).toLowerCase();
  const curIsJpeg = curExt === ".jpg" || curExt === ".jpeg";

  // Transparency survives as PNG; everything else normalizes to JPEG. A PNG
  // only becomes JPEG once it's big enough to be worth it (existing rule).
  let targetExt;
  if (alpha) targetExt = ".png";
  else if (meta.format === "png")
    targetExt = buf.length >= PNG_TO_JPEG_MIN_BYTES ? ".jpg" : ".png";
  else targetExt = ".jpg";

  const toJpeg = targetExt === ".jpg";
  const renaming = toJpeg ? !curIsJpeg : curExt !== targetExt;
  const resized = width > MAX_WIDTH;

  let pipeline = sharp(buf, { failOn: "none" }).rotate();
  if (resized) pipeline = pipeline.resize({ width: MAX_WIDTH });
  pipeline = toJpeg
    ? pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    : pipeline.png({ compressionLevel: 9 });
  const out = await pipeline.toBuffer();

  // Nothing structural changed and recompression didn't help: record the hash
  // so we skip it next run, and leave the file untouched.
  if (!renaming && !resized && out.length >= buf.length) {
    manifest[rel] = inputHash;
    return { skipped: true, narrow: !isCover && width < COLUMN_WIDTH, width };
  }

  const outAbs = renaming ? abs.replace(/\.[^.]+$/, targetExt) : abs;
  const outRel = renaming ? rel.replace(/\.[^.]+$/, targetExt) : rel;
  await writeFile(outAbs, out);
  if (renaming) {
    await unlink(abs);
    delete manifest[rel];
    await updateMarkdownRefs(
      path.dirname(abs),
      path.basename(abs),
      path.basename(outAbs),
    );
  }
  manifest[outRel] = sha256(out);

  return {
    converted: renaming,
    from: renaming ? curExt.slice(1) : null,
    to: renaming ? targetExt.slice(1) : null,
    resized,
    narrow: !isCover && width < COLUMN_WIDTH,
    width,
    before: buf.length,
    after: out.length,
    saved: buf.length - out.length,
  };
}

// A pixel that isn't fully opaque means real transparency — keep it a PNG.
async function hasTransparency(buf) {
  const { channels } = await sharp(buf).stats();
  return channels[channels.length - 1].min < 255;
}

async function updateMarkdownRefs(dir, oldName, newName) {
  for (const md of (await readdir(dir)).filter((f) => f.endsWith(".md"))) {
    const file = path.join(dir, md);
    const text = await readFile(file, "utf8");
    if (!text.includes(oldName)) continue;
    await writeFile(file, text.split(oldName).join(newName));
    console.log(
      `  updated ${path.relative(".", file)} (${oldName} → ${newName})`,
    );
  }
}

async function allFiles() {
  const out = [];
  for (const root of ESSAY_ROOTS) {
    if (await exists(root)) await collect(root, out);
  }
  return out;
}

async function filesForArg(arg) {
  const { dir } = await resolveEssay(arg);
  const out = [];
  await collect(dir, out);
  return out;
}

async function collect(dir, out) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(p, out);
    else if (IMAGE_RE.test(entry.name)) out.push(p);
  }
}

async function loadManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST, "utf8"));
  } catch {
    return {};
  }
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`;

main().catch((e) => die(e.message));
