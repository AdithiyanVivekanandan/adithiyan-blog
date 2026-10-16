import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  site: "https://blog.adithiyan.me",
  markdown: {
    shikiConfig: {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
      defaultColor: false,
    },
  },
});
