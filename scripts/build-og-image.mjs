// Generates public/og-default.png — the Open Graph card for pages that have no
// cover image of their own (home, archives, about, resources).
//
//   npm run og
//
// Run by hand, not in the build: the output is committed, and regenerating on
// every build would churn a binary in git for no reason. Re-run it if the logo
// or the brand colours change.
//
// Composed from the logo's vector paths and flat colour only — no text is
// rendered, so the result doesn't depend on which fonts happen to be installed
// on the machine that runs it.

import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

// Facebook, LinkedIn and X all crop toward 1.91:1; 1200×630 is the size they
// all accept without resampling.
const WIDTH = 1200;
const HEIGHT = 630;

// Mirrors :root in src/styles/global.css (light theme). The logo's paths are
// already ink-coloured, so only the page and accent colours are needed here.
const BACKGROUND = "#f4f0e7";
const ACCENT = "#7e2a1e";

const LOGO_WIDTH = 460;

const logo = await sharp(await readFile("src/assets/buthonestly-logo.svg"))
  .resize({ width: LOGO_WIDTH })
  .png()
  .toBuffer();
const { height: logoHeight } = await sharp(logo).metadata();

// A hairline rule under the mark, in the accent — the same device the site uses
// under its header.
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
  // Drop the alpha channel. The card is fully opaque anyway, and some social
  // scrapers composite transparency onto black rather than white. `flatten`
  // composites onto the background; `removeAlpha` is what actually drops the
  // channel from the output.
  .flatten({ background: BACKGROUND })
  .removeAlpha()
  // Palettised PNG, not JPEG. The card is flat colour plus hard-edged vector
  // letterforms — PNG's best case and JPEG's worst, where it rings around the
  // strokes. Measured on this image: 8-bit PNG 19 KB, JPEG q85 26 KB, and the
  // JPEG has artefacts the PNG doesn't. WebP is smaller still (14 KB) but is
  // unreliable as an og:image, so it isn't worth 5 KB.
  .png({ palette: true, compressionLevel: 9, effort: 10 })
  .toBuffer();

await writeFile("public/og-default.png", png);

const { width, height, size } = await sharp(png).metadata();
console.log(
  `Wrote public/og-default.png — ${width}×${height}, ${Math.round(size / 1024)} KB.`,
);
