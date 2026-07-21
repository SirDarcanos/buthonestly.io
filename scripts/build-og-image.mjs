// Generates public/og-default.png — the Open Graph card for pages with no cover
// of their own. `npm run og`; run by hand after a logo or brand-colour change,
// since the output is committed rather than built.
//
// Vector paths and flat colour only, no rendered text, so it doesn't depend on
// which fonts the generating machine has.

import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const WIDTH = 1200; // 1.91:1 — what every platform crops toward
const HEIGHT = 630;

// Mirrors :root in src/styles/global.css.
const BACKGROUND = "#f4f0e7";
const ACCENT = "#7e2a1e";

const LOGO_WIDTH = 460;

const logo = await sharp(await readFile("src/assets/buthonestly-logo.svg"))
  .resize({ width: LOGO_WIDTH })
  .png()
  .toBuffer();
const { height: logoHeight } = await sharp(logo).metadata();

// Hairline rule under the mark, matching the site header.
const rule = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${LOGO_WIDTH}" height="3">
     <rect width="${LOGO_WIDTH}" height="3" fill="${ACCENT}"/>
   </svg>`,
);

const GAP = 44;
const blockHeight = logoHeight + GAP + 3;
const top = Math.round((HEIGHT - blockHeight) / 2);
const left = Math.round((WIDTH - LOGO_WIDTH) / 2);

const png = await sharp({
  create: {
    width: WIDTH,
    height: HEIGHT,
    channels: 4,
    background: BACKGROUND,
  },
})
  .composite([
    { input: logo, top, left },
    { input: rule, top: top + logoHeight + GAP, left },
  ])
  // No alpha: some scrapers composite transparency onto black.
  .flatten({ background: BACKGROUND })
  .removeAlpha()
  // Palettised PNG beats JPEG here — flat colour and hard vector edges.
  // Measured: 8-bit PNG 19 KB, JPEG q85 26 KB and it rings around the strokes.
  .png({ palette: true, compressionLevel: 9, effort: 10 })
  .toBuffer();

await writeFile("public/og-default.png", png);

const { width, height, size } = await sharp(png).metadata();
console.log(
  `Wrote public/og-default.png — ${width}×${height}, ${Math.round(size / 1024)} KB.`,
);
