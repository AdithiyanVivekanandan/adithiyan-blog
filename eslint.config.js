import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "dist/",
      ".astro/",
      "node_modules/",
      "docs/",
      "technical_blog_complete_specification_package/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs["flat/recommended"],
  {
    files: ["tests/**/*.mjs", "*.config.mjs", "eslint.config.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ["src/**/*.astro"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];
