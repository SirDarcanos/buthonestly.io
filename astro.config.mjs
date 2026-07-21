import { defineConfig, fontProviders } from "astro/config";
import icon from "astro-icon";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

import { unified } from "@astrojs/markdown-remark";

import remarkAudioEmbed from "./src/lib/remark-audio-embed.mjs";
import remarkWikiLinks from "./src/lib/remark-wiki-links.mjs";
import remarkCallouts from "./src/lib/remark-callouts.mjs";
import rehypeImageFormat from "./src/lib/rehype-image-format.mjs";
import rehypeFigure from "./src/lib/rehype-figure.mjs";
import rehypeExternalLinks from "./src/lib/rehype-external-links.mjs";
import { buildLastmodMap } from "./src/lib/sitemap-lastmod.mjs";

// Read once at config load, not per URL — serialize() runs for all 69 entries.
const LASTMOD = buildLastmodMap();

export default defineConfig({
  site: "https://buthonestly.io/",
  trailingSlash: "always",
  integrations: [
    // Page 2+ of the paginated archives stays crawlable and indexable — the
    // "Older →" links reach it, and its titles/descriptions are unique. It just
    // doesn't belong in the sitemap, which advertises canonical entry points.
    sitemap({
      // The middle segment is optional: /section/web/2/ has one, /essays/2/
      // doesn't.
      filter: (page) =>
        !/\/(section|topic|essays)\/([^/]+\/)?\d+\/$/.test(page),
      // <lastmod> from the essays' own dates, so Google can prioritise what
      // actually changed. Only set where it's genuinely known — a date that
      // doesn't track real changes teaches Google to distrust the signal, so
      // the static pages deliberately carry none. No changefreq or priority:
      // Google has said publicly that it ignores both.
      serialize: (item) => {
        const lastmod = LASTMOD.get(new URL(item.url).pathname);
        return lastmod ? { ...item, lastmod: lastmod.toISOString() } : item;
      },
    }),
    icon(),
  ],
  // Responsive images: Markdown body images get an auto srcset + sizes, clamped
  // to the source width (no upscaling), so a large source isn't shipped at full
  // size for a narrow column. The cover's explicit widths/sizes in Picture.astro
  // still win where set.
  image: { layout: "constrained" },
  markdown: {
    shikiConfig: {
      // Single theme — the site has no dark mode. `github-light-high-contrast`
      // rather than `github-light` because code sits on the warm paper surface
      // (#e7e1d5), not white: against that, plain github-light drops six token
      // colours below AA, including keywords at 3.51 and comments at 3.70.
      // Comments still need a nudge, done in global.css.
      theme: "github-light-high-contrast",
    },
    processor: unified({
      remarkPlugins: [remarkAudioEmbed, remarkWikiLinks, remarkCallouts],
      rehypePlugins: [rehypeImageFormat, rehypeFigure, rehypeExternalLinks],
    }),
  },
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Newsreader",
      cssVariable: "--font-newsreader",
      weights: [300, 400, 500],
    },
    {
      provider: fontProviders.google(),
      name: "Archivo",
      cssVariable: "--font-archivo",
      weights: [400, 500, 600],
    },
  ],
});
