import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function resolveLockedPackage(packages, name, from = "") {
  let directory = from;
  while (true) {
    const candidate = path.posix.join(directory, "node_modules", name);
    if (packages[candidate]) return candidate;
    if (!directory || directory === ".") return null;
    directory = path.posix.dirname(directory);
  }
}

function imagePackages(lock) {
  if (lock?.lockfileVersion !== 3 || !lock.packages) return null;
  const packages = lock.packages;
  const astro = resolveLockedPackage(packages, "astro");
  if (!astro) return null;
  const sharp = resolveLockedPackage(packages, "sharp", astro);
  if (!sharp) return null;
  const selected = new Map();

  function collect(location, dependencies = true) {
    if (selected.has(location)) return true;
    const entry = packages[location];
    if (!entry?.version || !entry.integrity || entry.link) return false;
    selected.set(location, {
      version: entry.version,
      integrity: entry.integrity,
    });
    if (!dependencies) return true;
    const required = Object.keys(entry.dependencies ?? {});
    const optional = Object.keys(entry.optionalDependencies ?? {});
    for (const name of new Set([...required, ...optional])) {
      const dependency = resolveLockedPackage(packages, name, location);
      if (!dependency) {
        if (optional.includes(name)) continue;
        return false;
      }
      if (!collect(dependency)) return false;
    }
    return true;
  }

  if (!collect(astro, false) || !collect(sharp)) return null;
  return [...selected].sort(([left], [right]) => left.localeCompare(right));
}

export async function imageCacheKey(root) {
  try {
    const [lock, configuration] = await Promise.all([
      readFile(path.join(root, "package-lock.json"), "utf8"),
      readFile(path.join(root, "astro.config.mjs")),
    ]);
    const packages = imagePackages(JSON.parse(lock));
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
