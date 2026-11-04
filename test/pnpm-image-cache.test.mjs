import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { stringify } from "yaml";
import { imageCacheKey } from "../scripts/image-cache-key.mjs";

const platform =
  process.platform === "linux" &&
  !process.report.getReport().header.glibcVersionRuntime
    ? "linuxmusl"
    : process.platform;
const binding = `@img/sharp-${platform}-${process.arch}`;
const library = `@img/sharp-libvips-${platform}-${process.arch}`;

function lockfile() {
  return {
    lockfileVersion: "9.0",
    importers: {
      ".": {
        dependencies: { astro: { specifier: "^7.4.0", version: "7.4.0" } },
      },
    },
    packages: {
      "astro@7.4.0": { resolution: { integrity: "astro" } },
      "sharp@0.35.5": { resolution: { integrity: "sharp" } },
      "detect-libc@2.1.2": { resolution: { integrity: "libc" } },
      [`${binding}@0.35.5`]: { resolution: { integrity: "binding" } },
      [`${library}@1.3.3`]: { resolution: { integrity: "library" } },
    },
    snapshots: {
      "astro@7.4.0": { optionalDependencies: { sharp: "0.35.5" } },
      "sharp@0.35.5": {
        dependencies: { "detect-libc": "2.1.2" },
        optionalDependencies: { [binding]: "0.35.5" },
      },
      "detect-libc@2.1.2": {},
      [`${binding}@0.35.5`]: { optionalDependencies: { [library]: "1.3.3" } },
      [`${library}@1.3.3`]: {},
    },
  };
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "pnpm-image-cache-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "astro.config.mjs"), "export default {};");
  return root;
}

const save = (root, lock) =>
  writeFile(path.join(root, "pnpm-lock.yaml"), stringify(lock));

test("pnpm image identity includes native dependencies but ignores unrelated changes", async (t) => {
  const root = await fixture(t);
  const lock = lockfile();
  await save(root, lock);
  const key = await imageCacheKey(root);
  assert.match(key ?? "", /^[a-f0-9]{64}$/);
  lock.packages["unrelated@1.0.0"] = { resolution: { integrity: "other" } };
  lock.packages["sharp@0.35.5"].peerDependencies = { "@types/node": "*" };
  lock.snapshots["sharp@0.35.5"].optionalDependencies["@types/node"] = "24.0.0";
  lock.packages["@types/node@24.0.0"] = { resolution: { integrity: "types" } };
  lock.snapshots["@types/node@24.0.0"] = {};
  await save(root, lock);
  assert.equal(await imageCacheKey(root), key);
  lock.packages[`${library}@1.3.3`].resolution.integrity = "changed";
  await save(root, lock);
  assert.notEqual(await imageCacheKey(root), key);
});

test("missing native pnpm dependencies and malformed locks disable caching", async (t) => {
  const root = await fixture(t);
  const lock = lockfile();
  delete lock.snapshots[`${binding}@0.35.5`];
  await save(root, lock);
  assert.equal(await imageCacheKey(root), null);
  await writeFile(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: [");
  assert.equal(await imageCacheKey(root), null);
});

test("pnpm and npm snapshots of the same image toolchain share an identity", async (t) => {
  const root = await fixture(t);
  const lock = lockfile();
  await save(root, lock);
  const pnpmKey = await imageCacheKey(root);
  assert.match(pnpmKey ?? "", /^[a-f0-9]{64}$/);
  await rm(path.join(root, "pnpm-lock.yaml"));
  const packages = {};
  for (const [id, snapshot] of Object.entries(lock.snapshots)) {
    const separator = id.lastIndexOf("@");
    const name = id.slice(0, separator);
    packages[`node_modules/${name}`] = {
      version: id.slice(separator + 1),
      integrity: lock.packages[id].resolution.integrity,
      ...snapshot,
    };
  }
  await writeFile(
    path.join(root, "package-lock.json"),
    JSON.stringify({ lockfileVersion: 3, packages }),
  );
  assert.equal(await imageCacheKey(root), pnpmKey);
});
