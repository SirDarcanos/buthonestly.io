// Optimize essay source images in place so you can drop in full-size originals
// (no more iloveimg). Resizes, recompresses, and converts big opaque PNGs to
// JPEG; Astro re-encodes to AVIF at build, so this only keeps the committed
// SOURCES small. A content-hash manifest makes re-runs idempotent. Local tool.
//
//   npm run images                 # all essays + drafts
//   npm run images -- <slug|path>  # just one essay
//
// Images must be 16:9 (the cover/body layout is 16:9). Anything else is flagged
// and skipped — resizing by width never crops, so a wrong ratio would ship
// distorted; fix the source instead.

import { readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";

import { exists, die, resolveEssay, ESSAY_ROOTS } from "./lib/fs-util.mjs";

const MANIFEST = "data/images-optimized.json";
const MAX_WIDTH = 1376; // 2× the 688px body column; ≥ the cover's 1160 need
const JPEG_QUALITY = 80;
const PNG_TO_JPEG_MIN_BYTES = 100_000; // only big opaque PNGs become JPEG
// Only JPEG/PNG are optimized here. GIFs (animated) and SVGs are deliberately
// left alone — they're served as-is and exempt from the 16:9 rule (Astro emits
// animated WebP for GIFs; see rehype-image-format.mjs).
const IMAGE_RE = /\.(jpe?g|png)$/i;
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
    die("No JPEG/PNG images found to optimize.");
  }

  let optimized = 0,
    converted = 0,
    skipped = 0,
    savedBytes = 0;
  const flagged = [];

  for (const abs of files) {
    const rel = path.relative(".", abs);
    const r = await processFile(abs, rel, manifest);
    if (r.flagged) {
      flagged.push(`${rel} (${r.dims}, not 16:9)`);
      continue;
    }
    if (r.skipped) {
      skipped++;
      continue;
    }
    if (r.converted) converted++;
    else optimized++;
    savedBytes += r.saved;
    console.log(
      `${r.converted ? "→jpeg " : "opt   "}${rel}` +
        `${r.resized ? ` (resized to ${MAX_WIDTH}px)` : ""}` +
        `  ${kb(r.before)} → ${kb(r.after)}`,
    );
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  if (flagged.length) {
    console.log(`\n⚠ Skipped ${flagged.length} non-16:9 image(s) — fix these:`);
    for (const f of flagged) console.log(`  ${f}`);
  }
  console.log(
    `\nDone: ${optimized} optimized, ${converted} converted, ${skipped} unchanged. ` +
      `Saved ${kb(savedBytes)}.`,
  );
  if (flagged.length) process.exitCode = 1; // non-zero so the pre-commit blocks
}

async function processFile(abs, rel, manifest) {
  const buf = await readFile(abs);
  const inputHash = sha256(buf);
  if (manifest[rel] === inputHash) return { skipped: true };

  const meta = await sharp(buf).metadata();
  const { width = 0, height = 0 } = meta;
  if (
    !width ||
    !height ||
    Math.abs(width / height - RATIO_16_9) > RATIO_TOLERANCE
  ) {
    return { flagged: true, dims: `${width}×${height}` };
  }

  const isPng = meta.format === "png";
  const transparent = isPng && meta.hasAlpha && (await hasTransparency(buf));
  const toJpeg = isPng && !transparent && buf.length >= PNG_TO_JPEG_MIN_BYTES;
  const resized = width > MAX_WIDTH;

  let pipeline = sharp(buf, { failOn: "none" }).rotate();
  if (resized) pipeline = pipeline.resize({ width: MAX_WIDTH });
  pipeline =
    toJpeg || !isPng
      ? pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      : pipeline.png({ compressionLevel: 9 });
  const out = await pipeline.toBuffer();

  // Nothing structural changed and recompression didn't help: record the hash
  // so we skip it next run, and leave the file untouched.
  if (!toJpeg && !resized && out.length >= buf.length) {
    manifest[rel] = inputHash;
    return { skipped: true };
  }

  const outAbs = toJpeg ? abs.replace(/\.png$/i, ".jpg") : abs;
  const outRel = toJpeg ? rel.replace(/\.png$/i, ".jpg") : rel;
  await writeFile(outAbs, out);
  if (toJpeg) {
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
    converted: toJpeg,
    resized,
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
