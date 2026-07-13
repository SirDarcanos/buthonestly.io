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
