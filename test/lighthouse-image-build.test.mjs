import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { parse, stringify } from "yaml";

import { shareLighthouseImages } from "../scripts/share-lighthouse-images.mjs";

const project = path.resolve(import.meta.dirname, "..");
const astro = path.join(project, "node_modules/astro/bin/astro.mjs");
const assets = "node_modules/.astro/assets";
const beforePublication = "2026-09-15T12:59:59.999Z";
const atPublication = "2026-09-15T13:00:00.000Z";

const page = (width = 16) => `---
import { Image } from "astro:assets";
import image from "../image.png";
import { publishDate } from ${JSON.stringify(path.join(project, "src/lib/publish-time.mjs"))};
const published = publishDate("2026-09-15") <= new Date(process.env.TEST_PUBLICATION_TIME);
const preview = (process.env.LIGHTHOUSE_PREVIEW_SLUGS || "").split(",").includes("future");
---
<html><body><Image src={image} alt="fixture" width={${width}} format="webp" /><p>{published ? "published" : preview ? "preview" : "withheld"}</p></body></html>
`;

async function writeImage(directory, background) {
  await sharp({
    create: { width: 32, height: 18, channels: 3, background },
  })
    .png()
    .toFile(path.join(directory, "src/image.png"));
}

async function build(directory, preview = "", now = beforePublication) {
  const output = execFileSync(
    process.execPath,
    [astro, "build", "--root", directory],
    {
      encoding: "utf8",
      timeout: 30000,
      env: {
        ...process.env,
        LIGHTHOUSE_PREVIEW_SLUGS: preview,
        TEST_PUBLICATION_TIME: now,
      },
    },
  );
  return {
    output,
    html: await readFile(path.join(directory, "dist/index.html"), "utf8"),
  };
}

test(
  "real Astro assets reuse across checkouts without stale images or rendered publication state",
  { timeout: 120000 },
  async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "lighthouse-astro-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const main = path.join(root, "main");
    const otherPullRequest = path.join(root, "other-pull-request");
    const head = path.join(root, "head");
    const base = path.join(root, "base");
    for (const directory of [main, otherPullRequest, head, base]) {
      await mkdir(path.join(directory, "src/pages"), { recursive: true });
      await mkdir(path.join(directory, "node_modules"));
      await symlink(
        path.join(project, "node_modules/astro"),
        path.join(directory, "node_modules/astro"),
        "dir",
      );
      await writeFile(
        path.join(directory, "package.json"),
        '{"type":"module"}',
      );
      await writeFile(
        path.join(directory, "pnpm-lock.yaml"),
        await readFile(path.join(project, "pnpm-lock.yaml"), "utf8"),
      );
      await writeFile(
        path.join(directory, "astro.config.mjs"),
        "export default {};",
      );
      await writeFile(path.join(directory, "src/pages/index.astro"), page());
      await writeImage(directory, "red");
    }

    const cold = await build(main);
    assert.doesNotMatch(cold.output, /reused cache entry/);
    assert.match(cold.html, />withheld</);

    const unrelatedUpdate = parse(
      await readFile(path.join(otherPullRequest, "pnpm-lock.yaml"), "utf8"),
    );
    unrelatedUpdate.packages["unrelated@99.0.0"] = {
      resolution: { integrity: "unrelated" },
    };
    await writeFile(
      path.join(otherPullRequest, "pnpm-lock.yaml"),
      stringify(unrelatedUpdate),
    );

    for (const consumer of [head, otherPullRequest]) {
      assert.equal(await shareLighthouseImages(main, consumer), "shared");
      const restored = await build(consumer, "future");
      assert.match(restored.output, /reused cache entry/);
      assert.match(restored.html, />preview</);
    }
    assert.equal(await shareLighthouseImages(head, base), "shared");

    const warm = await build(base);
    assert.match(warm.output, /reused cache entry/);
    assert.match(warm.html, />withheld</);
    assert.doesNotMatch(warm.html, />preview</);

    const publication = await build(base, "", atPublication);
    assert.match(publication.output, /reused cache entry/);
    assert.match(publication.html, />published</);
    assert.doesNotMatch(publication.html, />withheld</);

    await writeImage(base, "blue");
    const changedSource = await build(base);
    assert.doesNotMatch(changedSource.output, /reused cache entry/);
    assert.notEqual(
      changedSource.html.match(/src="([^"]+\.webp)"/)?.[1],
      warm.html.match(/src="([^"]+\.webp)"/)?.[1],
    );

    await writeFile(path.join(base, "src/pages/index.astro"), page(8));
    const changedTransform = await build(base);
    assert.doesNotMatch(changedTransform.output, /reused cache entry/);
    assert.match(changedTransform.html, /width="8"/);

    await rm(path.join(base, assets), { recursive: true });
    const regenerated = await build(base);
    assert.doesNotMatch(regenerated.output, /reused cache entry/);
    assert.equal(regenerated.html, changedTransform.html);
  },
);
