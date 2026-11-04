import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readImageLock } from "./lib/image-lock.mjs";

function resolveLockedPackage(packages, name, from = "") {
  let directory = from;
  while (true) {
    const candidate = path.posix.join(directory, "node_modules", name);
    if (packages[candidate]) return candidate;
    if (!directory || directory === ".") return null;
    directory = path.posix.dirname(directory);
  }
}

function hasNativeSharp(packages, sharp) {
  if (!["darwin", "linux", "win32"].includes(process.platform)) return false;
  const platform =
    process.platform === "linux" &&
    !process.report.getReport().header.glibcVersionRuntime
      ? "linuxmusl"
      : process.platform;
  const bindingName = `@img/sharp-${platform}-${process.arch}`;
  const entry = packages[sharp];
  if (
    !(bindingName in { ...entry.dependencies, ...entry.optionalDependencies })
  )
    return false;
  const binding = resolveLockedPackage(packages, bindingName, sharp);
  if (!binding) return false;
  const libraryName = `@img/sharp-libvips-${platform}-${process.arch}`;
  const libraryDeclared =
    libraryName in
    {
      ...packages[binding].dependencies,
      ...packages[binding].optionalDependencies,
    };
  if (!libraryDeclared) return process.platform === "win32";
  return Boolean(resolveLockedPackage(packages, libraryName, binding));
}

function imagePackages(lock) {
  if (lock?.lockfileVersion !== 3 || !lock.packages) return null;
  const packages = lock.packages;
  const astro = resolveLockedPackage(packages, "astro");
  if (!astro) return null;
  const sharp = resolveLockedPackage(packages, "sharp", astro);
  if (!sharp || !hasNativeSharp(packages, sharp)) return null;

  function describe(
    name,
    location,
    ancestors = new Set(),
    includeDependencies = true,
  ) {
    if (ancestors.has(location)) return null;
    const entry = packages[location];
    if (!entry?.version || !entry.integrity || entry.link) return null;
    const dependencies = [];
    if (includeDependencies) {
      const required = Object.keys(entry.dependencies ?? {});
      const optional = Object.keys(entry.optionalDependencies ?? {});
      const parents = new Set([...ancestors, location]);
      for (const dependencyName of [
        ...new Set([...required, ...optional]),
      ].sort()) {
        const dependency = resolveLockedPackage(
          packages,
          dependencyName,
          location,
        );
        if (!dependency) {
          if (optional.includes(dependencyName)) continue;
          return null;
        }
        const identity = describe(dependencyName, dependency, parents);
        if (!identity) return null;
        dependencies.push(identity);
      }
    }
    return {
      name,
      version: entry.version,
      integrity: entry.integrity,
      dependencies,
    };
  }

  const astroIdentity = describe("astro", astro, new Set(), false);
  const sharpIdentity = describe("sharp", sharp);
  return astroIdentity && sharpIdentity ? [astroIdentity, sharpIdentity] : null;
}

export async function imageCacheKey(root) {
  try {
    const [lock, configuration] = await Promise.all([
      readImageLock(root),
      readFile(path.join(root, "astro.config.mjs")),
    ]);
    const packages = imagePackages(lock);
    if (!packages) return null;
    return createHash("sha256")
      .update(
        JSON.stringify({
          schema: 1,
          node: process.versions.node.split(".")[0],
          packages,
        }),
      )
      .update(configuration)
      .digest("hex");
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const key = await imageCacheKey(path.resolve(process.argv[2] ?? "."));
  if (!key)
    console.error(
      "Image toolchain unavailable; image cache disabled for this revision.",
    );
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `key=${key ?? ""}\n`);
  } else {
    console.log(key ?? "");
  }
}
