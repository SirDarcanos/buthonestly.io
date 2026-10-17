import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { shareLighthouseImages } from "../scripts/share-lighthouse-images.mjs";

const assets = "node_modules/.astro/assets";

async function revisions(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "lighthouse-images-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directories = [path.join(root, "head"), path.join(root, "base")];
  for (const directory of directories) {
    await mkdir(path.join(directory, assets), { recursive: true });
    for (const file of ["package-lock.json", "astro.config.mjs"]) {
      await writeFile(path.join(directory, file), "same");
    }
  }
  return directories;
}

test("shares only image assets and merges base-only variants back into head", async (t) => {
  const [head, base] = await revisions(t);
  await writeFile(path.join(head, assets, "image.hash.webp"), "transform");
  await writeFile(
    path.join(base, assets, "older.hash.webp"),
    "older transform",
  );
  await writeFile(
    path.join(head, "node_modules/.astro/data-store.json"),
    "head",
  );
  await writeFile(
    path.join(base, "node_modules/.astro/data-store.json"),
    "base",
  );
  assert.equal(await shareLighthouseImages(head, base), "shared");
  assert.equal(await shareLighthouseImages(base, head), "shared");
  assert.equal(
    await readFile(path.join(head, assets, "older.hash.webp"), "utf8"),
    "older transform",
  );
  assert.equal(
    await readFile(path.join(base, assets, "image.hash.webp"), "utf8"),
    "transform",
  );
  assert.equal(
    await readFile(
      path.join(base, "node_modules/.astro/data-store.json"),
      "utf8",
    ),
    "base",
  );
});

for (const file of ["package-lock.json", "astro.config.mjs"]) {
  test(`does not share across incompatible ${file}`, async (t) => {
    const [head, base] = await revisions(t);
    await writeFile(path.join(head, file), "changed");
    assert.equal(await shareLighthouseImages(head, base), "incompatible");
  });
}

test("a missing image cache falls back to fresh transformation", async (t) => {
  const [head, base] = await revisions(t);
  await rm(path.join(head, assets), { recursive: true });
  assert.equal(await shareLighthouseImages(head, base), "missing");
});
