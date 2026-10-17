import { cp, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function shareLighthouseImages(source, destination) {
  for (const file of ["package-lock.json", "astro.config.mjs"]) {
    const [from, to] = await Promise.all(
      [source, destination].map((root) => readFile(path.join(root, file))),
    );
    if (!from.equals(to)) return "incompatible";
  }
  const assets = path.join("node_modules", ".astro", "assets");
  try {
    await mkdir(path.join(destination, assets), { recursive: true });
    await cp(path.join(source, assets), path.join(destination, assets), {
      recursive: true,
    });
    return "shared";
  } catch (error) {
    if (error.code === "ENOENT") return "missing";
    throw error;
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  console.log(
    `Astro image assets: ${await shareLighthouseImages(...process.argv.slice(2))}`,
  );
}
