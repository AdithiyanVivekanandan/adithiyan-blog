import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  site: "https://example.com",
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
