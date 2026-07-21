// Generates public/email/*.png — the masthead logo and social icons for the Kit
// newsletter. `npm run email-assets` — run by hand; the output is committed.
//
// PNG rather than SVG because Gmail strips inline SVG and Outlook won't render
// it. Emitted at 2× the 22px display size for retina.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  icons,
  width = 24,
  height = 24,
} = require("@iconify-json/simple-icons/icons.json");

const OUT = "public/email";
const ICON_SIZE = 44;
const ICON_COLOR = "#665e51";
const LOGO_WIDTH = 300;

const NAMES = [
  "github",
  "linkedin",
  "bluesky",
  "mastodon",
  "wordpress",
  "x",
  "rss",
];

await mkdir(OUT, { recursive: true });

for (const name of NAMES) {
  const icon = icons[name];
  if (!icon) throw new Error(`simple-icons has no "${name}"`);
  // simple-icons paths carry fill="currentColor", which librsvg resolves to
  // black. Substituting the literal colour avoids depending on inheritance.
  const body = icon.body.replaceAll("currentColor", ICON_COLOR);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${icon.width ?? width} ${icon.height ?? height}">${body}</svg>`;
  const png = await sharp(Buffer.from(svg))
    .resize({
      width: ICON_SIZE,
      height: ICON_SIZE,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(`${OUT}/${name}.png`, png);
  console.log(`  ${name}.png — ${Math.round(png.length / 102.4) / 10} KB`);
}
const logo = await sharp(await readFile("src/assets/buthonestly-logo.svg"))
  .resize({ width: LOGO_WIDTH })
  .png({ compressionLevel: 9 })
  .toBuffer();
await writeFile(`${OUT}/logo.png`, logo);
console.log(`  logo.png — ${Math.round(logo.length / 102.4) / 10} KB`);

console.log(`Wrote ${NAMES.length} icons + logo to ${OUT}/.`);
