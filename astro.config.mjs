import { defineConfig, fontProviders } from "astro/config";
import icon from "astro-icon";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://buthonestly.io/",
  trailingSlash: "always",
  integrations: [sitemap(), icon()],
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Newsreader",
      cssVariable: "--font-newsreader",
      weights: [300, 380, 400, 500],
    },
    {
      provider: fontProviders.google(),
      name: "Archivo",
      cssVariable: "--font-archivo",
      weights: [400, 500, 600],
    },
  ],
});
