import { defineConfig, fontProviders } from "astro/config";
import icon from "astro-icon";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

import { unified } from "@astrojs/markdown-remark";

import remarkWikiLinks from "./src/lib/remark-wiki-links.mjs";
import remarkCallouts from "./src/lib/remark-callouts.mjs";
import rehypeExternalLinks from "./src/lib/rehype-external-links.mjs";

export default defineConfig({
  site: "https://buthonestly.io/",
  trailingSlash: "always",
  integrations: [sitemap(), icon()],
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
      remarkPlugins: [remarkWikiLinks, remarkCallouts],
      rehypePlugins: [rehypeExternalLinks],
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
