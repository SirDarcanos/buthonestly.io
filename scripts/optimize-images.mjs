import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

import { readEssayCoverPath } from "../src/lib/essay-inventory.mjs";
import { die, exists, resolveEssay, ESSAY_ROOTS } from "./lib/fs-util.mjs";

const MAX_WIDTH = 1376;
const COLUMN_WIDTH = 688;
const JPEG_QUALITY = 80;
const IMAGE_RE = /\.(jpe?g|png|webp|avif|tiff?|bmp)$/i;
const RATIO_16_9 = 16 / 9;
const RATIO_TOLERANCE = 0.02;

export async function optimizeEssayImages({
  directory,
  sourcePath,
  log = console.log,
}) {
  return optimizeEssays({
    essays: [{ dir: directory, file: sourcePath }],
    log,
  });
}

export async function optimizeEssays({ essays, log = console.log }) {
  const batches = [];
  for (const essay of essays) {
    batches.push(await prepareEssayImages(essay));
  }

  const totals = { optimized: 0, converted: 0, skipped: 0, savedBytes: 0 };
  for (const batch of batches) {
    const result = await optimizePreparedImages(batch, log);
    for (const key of Object.keys(totals)) totals[key] += result[key];
  }
  return totals;
}

async function prepareEssayImages({ dir, file }) {
  const files = await collectImages(dir);
  if (!files.length) {
    throw new Error("No optimizable images found (GIF/SVG are exempt).");
  }

  const coverPath = readEssayCoverPath(file);
  const prepared = [];
  const outputSources = new Map();

  for (const inputPath of files) {
    const input = await readFile(inputPath);
    const metadata = await sharp(input).metadata();
    const dimensions = metadata.autoOrient ?? metadata;
    const width = dimensions.width ?? 0;
    const height = dimensions.height ?? 0;
    if (!width || !height) {
      throw new Error(`${displayPath(inputPath)} has unreadable dimensions.`);
    }

    const isCover = path.resolve(inputPath) === coverPath;
    if (isCover && Math.abs(width / height - RATIO_16_9) > RATIO_TOLERANCE) {
      throw new Error(
        `${displayPath(inputPath)} is ${width}×${height}; covers must be 16:9.`,
      );
    }

    if ((metadata.pages ?? 1) > 1) {
      prepared.push({ inputPath, input, width, skipped: true });
      continue;
    }

    const transparent =
      metadata.hasAlpha && (await imageHasTransparency(input));
    const extension = path.extname(inputPath).toLowerCase();
    const isJpeg = extension === ".jpg" || extension === ".jpeg";
    const targetExtension = transparent ? ".png" : ".jpg";
    const converting = transparent
      ? extension !== ".png"
      : !isJpeg || extension === ".jpeg";
    const outputPath = converting
      ? inputPath.replace(/\.[^.]+$/, targetExtension)
      : inputPath;
    const resolvedOutputPath = path.resolve(outputPath);
    const previousSource = outputSources.get(resolvedOutputPath);

    if (previousSource && previousSource !== inputPath) {
      throw new Error(
        `Cannot convert ${displayPath(inputPath)} because it shares ${displayPath(outputPath)} with ${displayPath(previousSource)}.`,
      );
    }
    outputSources.set(resolvedOutputPath, inputPath);

    if (outputPath !== inputPath && (await exists(outputPath))) {
      throw new Error(
        `Cannot convert ${displayPath(inputPath)} because ${displayPath(outputPath)} already exists.`,
      );
    }

    prepared.push({
      inputPath,
      outputPath,
      input,
      width,
      transparent,
      converting,
      resizing: width > MAX_WIDTH,
      narrow: !isCover && width < COLUMN_WIDTH,
    });
  }

  return prepared;
}

async function optimizePreparedImages(prepared, log) {
  let optimized = 0;
  let converted = 0;
  let skipped = 0;
  let savedBytes = 0;
  const narrow = prepared.filter((image) => image.narrow);

  for (const image of prepared) {
    if (image.skipped || (!image.converting && !image.resizing)) {
      skipped += 1;
      continue;
    }

    let pipeline = sharp(image.input, { failOn: "none" }).rotate();
    if (image.resizing) {
      pipeline = pipeline.resize({ width: MAX_WIDTH });
    }
    pipeline = image.transparent
      ? pipeline.png({ compressionLevel: 9 })
      : pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });

    const output = await pipeline.toBuffer();
    await writeFile(image.outputPath, output);
    if (image.converting) {
      await unlink(image.inputPath);
      converted += 1;
      log(
        `${displayPath(image.inputPath)} -> ${displayPath(image.outputPath)}  ${kilobytes(image.input.length)} -> ${kilobytes(output.length)}`,
      );
    } else {
      optimized += 1;
      log(
        `${displayPath(image.inputPath)}${image.resizing ? ` (resized to ${MAX_WIDTH}px)` : ""}  ${kilobytes(image.input.length)} -> ${kilobytes(output.length)}`,
      );
    }
    savedBytes += image.input.length - output.length;
  }

  if (narrow.length) {
    log(
      `\nNote: ${narrow.length} body image(s) narrower than the ${COLUMN_WIDTH}px reading column:`,
    );
    for (const image of narrow) {
      log(`  ${displayPath(image.inputPath)} (${image.width}px wide)`);
    }
  }

  return { optimized, converted, skipped, savedBytes };
}

async function main() {
  const args = process.argv
    .slice(2)
    .filter((argument) => !argument.startsWith("-"));
  const essays = args.length
    ? [await resolveEssay(args[0])]
    : await findEssaysWithImages();

  if (!essays.length) {
    throw new Error("No optimizable images found (GIF/SVG are exempt).");
  }

  const totals = await optimizeEssays({ essays });
  console.log(
    `\nDone: ${totals.optimized} optimized, ${totals.converted} converted, ${totals.skipped} unchanged. Saved ${kilobytes(totals.savedBytes)}.`,
  );
}

async function imageHasTransparency(input) {
  const { channels } = await sharp(input).stats();
  return channels.at(-1).min < 255;
}

async function collectImages(directory) {
  const images = [];
  await collect(directory, images);
  return images.sort();
}

async function collect(directory, images) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(entryPath, images);
    else if (IMAGE_RE.test(entry.name)) images.push(entryPath);
  }
}

async function findEssaysWithImages() {
  const essays = [];
  for (const root of ESSAY_ROOTS) {
    if (!(await exists(root))) continue;
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      const extensions = root.endsWith("/drafts") ? [".mdx", ".md"] : [".mdx"];
      const file = (
        await Promise.all(
          extensions.map(async (extension) => {
            const candidate = path.join(dir, `${entry.name}${extension}`);
            return (await exists(candidate)) ? candidate : null;
          }),
        )
      ).find(Boolean);
      if (file && (await collectImages(dir)).length) {
        essays.push({ dir, file });
      }
    }
  }
  return essays;
}

const displayPath = (filePath) => path.relative(process.cwd(), filePath);
const kilobytes = (bytes) => `${(bytes / 1024).toFixed(0)}KB`;

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error) => die(error.message));
}
