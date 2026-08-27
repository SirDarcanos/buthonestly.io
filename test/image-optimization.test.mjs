import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import sharp from "sharp";

import {
  optimizeEssayImages,
  optimizeEssays,
} from "../scripts/optimize-images.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

const createEssay = async (directory, slug, cover = "cover.jpg") => {
  await writeFile(
    path.join(directory, `${slug}.mdx`),
    `---\ntitle: Fixture\ncover: ./${cover} # fixture cover\n---\n\nimport opaque from "./opaque.png";\nimport transparent from "./transparent.png";\n`,
  );
};

const createNoise = (width, height, channels) => {
  const data = Buffer.alloc(width * height * channels);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = (index * 31 + Math.floor(index / 17) * 47) % 256;
  }
  return data;
};

const createFixtures = async (directory, slug) => {
  await createEssay(directory, slug);
  await sharp({
    create: {
      width: 900,
      height: 1600,
      channels: 3,
      background: "#c45d3d",
    },
  })
    .jpeg({ quality: 90 })
    .withMetadata({ orientation: 6 })
    .toFile(path.join(directory, "cover.jpg"));
  await sharp(createNoise(320, 180, 3), {
    raw: { width: 320, height: 180, channels: 3 },
  })
    .png()
    .toFile(path.join(directory, "opaque.png"));
  await sharp({
    create: {
      width: 1600,
      height: 1000,
      channels: 4,
      background: { r: 196, g: 93, b: 61, alpha: 0.4 },
    },
  })
    .png()
    .toFile(path.join(directory, "transparent.png"));
  await sharp(createNoise(1600, 1000, 3), {
    raw: { width: 1600, height: 1000, channels: 3 },
  })
    .jpeg({ quality: 100 })
    .toFile(path.join(directory, "oversized.jpg"));
};

test("manual optimization prepares source images without mutating MDX", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "image-optimization-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const slug = "fixture";
  const sourcePath = path.join(root, `${slug}.mdx`);
  await createFixtures(root, slug);

  const sourceBefore = await readFile(sourcePath);
  const oversizedBefore = (await stat(path.join(root, "oversized.jpg"))).size;
  const messages = [];
  const result = await optimizeEssayImages({
    directory: root,
    sourcePath,
    log: (message) => messages.push(message),
  });

  assert.equal(result.converted, 1);
  assert.equal(existsSync(path.join(root, "opaque.png")), false);
  assert.equal(existsSync(path.join(root, "opaque.jpg")), true);
  assert.match(messages.join("\n"), /opaque\.png.*opaque\.jpg/);

  const cover = await sharp(path.join(root, "cover.jpg")).metadata();
  assert.equal(cover.width, 1376);
  assert.equal(cover.height, 774);

  const opaque = await sharp(path.join(root, "opaque.jpg")).metadata();
  assert.equal(opaque.format, "jpeg");

  const transparent = await sharp(
    path.join(root, "transparent.png"),
  ).metadata();
  assert.equal(transparent.format, "png");
  assert.equal(transparent.width, 1376);
  assert.equal(transparent.height, 860);
  assert.equal(transparent.hasAlpha, true);
  const transparentStats = await sharp(
    path.join(root, "transparent.png"),
  ).stats();
  assert.ok(transparentStats.channels.at(-1).min < 255);

  const oversizedPath = path.join(root, "oversized.jpg");
  const oversized = await sharp(oversizedPath).metadata();
  assert.equal(oversized.width, 1376);
  assert.equal(oversized.height, 860);
  assert.ok((await stat(oversizedPath)).size < oversizedBefore);
  assert.deepEqual(await readFile(sourcePath), sourceBefore);
});

test("invalid cover proportions block the command before image mutation", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "invalid-cover-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const slug = "invalid-cover";
  const sourcePath = path.join(root, `${slug}.mdx`);
  await createEssay(root, slug);
  await sharp({
    create: {
      width: 800,
      height: 800,
      channels: 3,
      background: "#c45d3d",
    },
  })
    .jpeg()
    .toFile(path.join(root, "cover.jpg"));
  await sharp({
    create: {
      width: 200,
      height: 100,
      channels: 3,
      background: "#111111",
    },
  })
    .png()
    .toFile(path.join(root, "opaque.png"));

  const result = spawnSync(
    process.execPath,
    ["scripts/optimize-images.mjs", sourcePath],
    { cwd: repositoryRoot, encoding: "utf8" },
  );

  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /cover\.jpg.*800×800.*16:9/);
  assert.equal(existsSync(path.join(root, "opaque.png")), true);
  assert.equal(existsSync(path.join(root, "opaque.jpg")), false);
});

test("conversion collisions fail before deleting either source", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "image-collision-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const slug = "collision";
  const sourcePath = path.join(root, `${slug}.mdx`);
  await createEssay(root, slug);
  await sharp({
    create: {
      width: 160,
      height: 90,
      channels: 3,
      background: "#c45d3d",
    },
  })
    .jpeg()
    .toFile(path.join(root, "cover.jpg"));
  for (const extension of ["png", "webp"]) {
    await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 3,
        background: "#111111",
      },
    })
      .toFormat(extension)
      .toFile(path.join(root, `diagram.${extension}`));
  }

  await assert.rejects(
    optimizeEssayImages({ directory: root, sourcePath }),
    /shares .*diagram\.jpg/,
  );
  assert.equal(existsSync(path.join(root, "diagram.png")), true);
  assert.equal(existsSync(path.join(root, "diagram.webp")), true);
  assert.equal(existsSync(path.join(root, "diagram.jpg")), false);
});

test("multi-essay optimization validates every cover before mutation", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "image-batch-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const valid = path.join(root, "valid");
  const invalid = path.join(root, "invalid");
  await Promise.all([mkdir(valid), mkdir(invalid)]);
  await createEssay(valid, "valid");
  await createEssay(invalid, "invalid");
  await sharp({
    create: {
      width: 160,
      height: 90,
      channels: 3,
      background: "#c45d3d",
    },
  })
    .jpeg()
    .toFile(path.join(valid, "cover.jpg"));
  await sharp({
    create: {
      width: 200,
      height: 100,
      channels: 3,
      background: "#111111",
    },
  })
    .png()
    .toFile(path.join(valid, "opaque.png"));
  await sharp({
    create: {
      width: 800,
      height: 800,
      channels: 3,
      background: "#c45d3d",
    },
  })
    .jpeg()
    .toFile(path.join(invalid, "cover.jpg"));

  await assert.rejects(
    optimizeEssays({
      essays: [
        { dir: valid, file: path.join(valid, "valid.mdx") },
        { dir: invalid, file: path.join(invalid, "invalid.mdx") },
      ],
    }),
    /covers must be 16:9/,
  );
  assert.equal(existsSync(path.join(valid, "opaque.png")), true);
  assert.equal(existsSync(path.join(valid, "opaque.jpg")), false);
});

test("repository installs no hooks and keeps no image manifest", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );

  assert.equal(packageJson.scripts.prepare, undefined);
  assert.equal(existsSync(path.join(repositoryRoot, ".githooks")), false);
  assert.equal(
    existsSync(path.join(repositoryRoot, "scripts/precommit.mjs")),
    false,
  );
  assert.equal(
    existsSync(path.join(repositoryRoot, "data/images-optimized.json")),
    false,
  );
});
