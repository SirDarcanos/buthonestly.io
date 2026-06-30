/**
 * Packages every WordPress component under wordpress/ (plugins and themes) into
 * its own installable zip — one per folder, e.g.
 * wordpress/nmcom-project-fields/ → nmcom-project-fields.zip.
 *
 * Uses the system `zip` with -X (no macOS resource forks) and excludes .DS_Store,
 * so the archives are clean — unlike Finder's "Compress".
 */
import { readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../wordpress", import.meta.url));

const plugins = readdirSync(dir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

if (plugins.length === 0) {
  console.log("No plugin folders found under wordpress/.");
}

for (const name of plugins) {
  const zip = `${name}.zip`;
  rmSync(`${dir}/${zip}`, { force: true });
  execFileSync("zip", ["-rqX", zip, name, "-x", "*.DS_Store"], {
    cwd: dir,
    stdio: "inherit",
  });
  console.log(`Zipped ${name} → wordpress/${zip}`);
}
