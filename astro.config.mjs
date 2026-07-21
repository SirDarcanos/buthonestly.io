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
    }),
    icon(),
  ],
  // Responsive images: Markdown body images get an auto srcset + sizes, clamped
  // to the source width (no upscaling), so a large source isn't shipped at full
  // size for a narrow column. The cover's explicit widths/sizes in Picture.astro
  // still win where set.
  image: { layout: "constrained" },
  markdown: {
    // Dual-theme Shiki: light tokens are inline by default; `--shiki-dark`
    // holds the dark theme's colors, activated by the `.dark` class in
    // global.css. Block backgrounds are overridden to `--color-surface` there
    // so code reads as a warm-paper panel in both modes.
    shikiConfig: {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
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
