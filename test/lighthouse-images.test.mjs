import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { shareLighthouseImages } from "../scripts/share-lighthouse-images.mjs";
import { imageCacheKey } from "../scripts/image-cache-key.mjs";

const assets = "node_modules/.astro/assets";
const imageLock = () => ({
  lockfileVersion: 3,
  packages: {
    "node_modules/astro": {
      version: "7.2.9",
      integrity: "astro",
      optionalDependencies: { sharp: "^0.35.4" },
    },
    "node_modules/sharp": {
      version: "0.35.4",
      integrity: "sharp",
      dependencies: { "detect-libc": "^2.1.2" },
      optionalDependencies: { "@img/sharp-linux-x64": "0.35.4" },
    },
    "node_modules/detect-libc": { version: "2.1.2", integrity: "libc" },
    "node_modules/@img/sharp-linux-x64": {
      version: "0.35.4",
      integrity: "binary",
      optionalDependencies: { "@img/sharp-libvips-linux-x64": "1.3.3" },
    },
    "node_modules/@img/sharp-libvips-linux-x64": {
      version: "1.3.3",
      integrity: "libvips",
    },
    "node_modules/smol-toml": { version: "1.8.0", integrity: "toml" },
  },
});

async function writeLock(directory, lock) {
  await writeFile(
    path.join(directory, "package-lock.json"),
    JSON.stringify(lock),
  );
}

async function revisions(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "lighthouse-images-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directories = [path.join(root, "head"), path.join(root, "base")];
  for (const directory of directories) {
    await mkdir(path.join(directory, assets), { recursive: true });
    await writeLock(directory, imageLock());
    await writeFile(
      path.join(directory, "astro.config.mjs"),
      "export default {};",
    );
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

test("unrelated dependency updates share existing image transforms", async (t) => {
  const [head, base] = await revisions(t);
  const lock = imageLock();
  lock.packages["node_modules/smol-toml"] = {
    version: "1.9.1",
    integrity: "new-toml",
  };
  await writeLock(head, lock);
  await writeFile(path.join(head, assets, "image.hash.webp"), "transform");
  assert.equal(await shareLighthouseImages(head, base), "shared");
  assert.equal(
    await readFile(path.join(base, assets, "image.hash.webp"), "utf8"),
    "transform",
  );
});

for (const file of ["package-lock.json", "astro.config.mjs"]) {
  test(`does not share across incompatible ${file}`, async (t) => {
    const [head, base] = await revisions(t);
    await writeFile(path.join(head, file), "changed");
    assert.equal(await shareLighthouseImages(head, base), "incompatible");
  });
}

for (const name of [
  "astro",
  "sharp",
  "detect-libc",
  "@img/sharp-linux-x64",
  "@img/sharp-libvips-linux-x64",
]) {
  test(`changes to ${name} invalidate image sharing`, async (t) => {
    const [head, base] = await revisions(t);
    const lock = imageLock();
    lock.packages[`node_modules/${name}`].integrity = "changed";
    await writeLock(head, lock);
    assert.equal(await shareLighthouseImages(head, base), "incompatible");
  });
}

test("Sharp resolution follows Astro's nested dependency, not an unrelated root copy", async (t) => {
  const [head, base] = await revisions(t);
  const lock = imageLock();
  lock.packages["node_modules/astro/node_modules/sharp"] =
    lock.packages["node_modules/sharp"];
  await writeLock(base, lock);
  lock.packages["node_modules/sharp"] = {
    version: "0.36.0",
    integrity: "other-sharp",
  };
  await writeLock(head, lock);
  assert.equal(await shareLighthouseImages(head, base), "shared");
});

for (const corrupt of [
  (lock) => delete lock.packages["node_modules/astro"],
  (lock) => delete lock.packages["node_modules/sharp"],
  (lock) => delete lock.packages["node_modules/detect-libc"],
  (lock) => delete lock.packages["node_modules/sharp"].integrity,
  (lock) => {
    lock.lockfileVersion = 1;
  },
]) {
  test("unknown image toolchains never share, even with identical unknown inputs", async (t) => {
    const [head, base] = await revisions(t);
    const lock = imageLock();
    corrupt(lock);
    await writeLock(head, lock);
    await writeLock(base, lock);
    assert.equal(await shareLighthouseImages(head, base), "incompatible");
  });
}

test("cache keys ignore lockfile ordering and unrelated package metadata", async (t) => {
  const [head, base] = await revisions(t);
  const lock = imageLock();
  lock.packages = Object.fromEntries(Object.entries(lock.packages).reverse());
  lock.packages[""] = {
    version: "2.0.0",
    dependencies: { "smol-toml": "^1.9.1" },
  };
  await writeLock(head, lock);
  const key = await imageCacheKey(base);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(await imageCacheKey(head), key);
});

test("the workflow key command disables caching for unknown toolchains without failing the build", async (t) => {
  const [head] = await revisions(t);
  const output = path.join(head, "github-output");
  const command = new URL("../scripts/image-cache-key.mjs", import.meta.url);
  const run = () =>
    execFileSync(process.execPath, [command.pathname, head], {
      env: { ...process.env, GITHUB_OUTPUT: output },
      encoding: "utf8",
    });
  run();
  assert.match(await readFile(output, "utf8"), /^key=[a-f0-9]{64}\n$/);
  await writeFile(output, "");
  await writeFile(path.join(head, "package-lock.json"), "unsupported");
  run();
  assert.equal(await readFile(output, "utf8"), "key=\n");
  assert.equal(await imageCacheKey(head), null);
});

test("a missing image cache falls back to fresh transformation", async (t) => {
  const [head, base] = await revisions(t);
  await rm(path.join(head, assets), { recursive: true });
  assert.equal(await shareLighthouseImages(head, base), "missing");
});
