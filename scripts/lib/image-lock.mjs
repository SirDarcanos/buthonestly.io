import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "yaml";

function normalizePnpmLock(lock) {
  if (
    ![9, "9.0"].includes(lock?.lockfileVersion) ||
    !lock.importers?.["."] ||
    !lock.packages ||
    !lock.snapshots
  )
    return null;

  const importer = lock.importers["."];
  const direct = { ...importer.devDependencies, ...importer.dependencies };
  const astroReference = direct.astro?.version;
  if (typeof astroReference !== "string") return null;
  const astroId = `astro@${astroReference}`;
  const astroSnapshot = lock.snapshots[astroId];
  const astroPackage = lock.packages[astroId.split("(")[0]];
  if (!astroSnapshot || !astroPackage) return null;

  const packages = {
    "node_modules/astro": {
      version: astroReference.split("(")[0],
      integrity: astroPackage.resolution?.integrity,
    },
  };

  function expand(name, reference, location, ancestors = new Set()) {
    if (typeof reference !== "string") return false;
    const id = `${name}@${reference}`;
    const snapshot = lock.snapshots[id];
    const entry = lock.packages[id.split("(")[0]];
    if (!snapshot || !entry?.resolution?.integrity || ancestors.has(id))
      return false;
    const withoutPeers = (dependencies) =>
      Object.fromEntries(
        Object.entries(dependencies ?? {}).filter(
          ([dependency]) => !(dependency in (entry.peerDependencies ?? {})),
        ),
      );
    const dependencies = withoutPeers(snapshot.dependencies);
    const optionalDependencies = withoutPeers(snapshot.optionalDependencies);
    packages[location] = {
      version: reference.split("(")[0],
      integrity: entry.resolution.integrity,
      dependencies,
      optionalDependencies,
    };
    const parents = new Set([...ancestors, id]);
    for (const [dependency, version] of Object.entries({
      ...optionalDependencies,
      ...dependencies,
    })) {
      if (
        !lock.snapshots[`${dependency}@${version}`] &&
        !(dependency in dependencies)
      )
        continue;
      if (
        !expand(
          dependency,
          version,
          `${location}/node_modules/${dependency}`,
          parents,
        )
      )
        return false;
    }
    return true;
  }

  const sharpReference =
    astroSnapshot.dependencies?.sharp ??
    astroSnapshot.optionalDependencies?.sharp ??
    direct.sharp?.version;
  if (!expand("sharp", sharpReference, "node_modules/astro/node_modules/sharp"))
    return null;
  return { lockfileVersion: 3, packages };
}

export async function readImageLock(root) {
  let source;
  try {
    source = await readFile(path.join(root, "pnpm-lock.yaml"), "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return JSON.parse(
      await readFile(path.join(root, "package-lock.json"), "utf8"),
    );
  }
  const document = parseDocument(source);
  if (document.errors.length) return null;
  return normalizePnpmLock(document.toJS());
}
