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

const LASTMOD = buildLastmodMap();

export default defineConfig({
  site: "https://buthonestly.io/",
  trailingSlash: "always",
  integrations: [
    // Paginated pages stay indexable via the "Older →" links; the sitemap just
    // advertises canonical entry points.
    sitemap({
      filter: (page) =>
        !/\/(section|topic|essays)\/([^/]+\/)?\d+\/$/.test(page),
      serialize: (item) => {
        const lastmod = LASTMOD.get(new URL(item.url).pathname);
        return lastmod ? { ...item, lastmod: lastmod.toISOString() } : item;
      },
    }),
    icon(),
  ],
  image: { layout: "constrained" },
  markdown: {
    shikiConfig: {
      // High-contrast because code sits on the paper surface, not white —
      // plain github-light drops six token colours below AA there.
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
