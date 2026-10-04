import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.eslint.json" },
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "obsidianmd/no-tfile-tfolder-cast": "off",
    },
  },
  {
    files: ["tests/browser/**/*.mjs", "tests/native/**/*.mjs", "tests/runTimezones.mjs"],
    languageOptions: { globals: { process: "readonly" } },
    rules: {
      // Test runners execute in Node, outside the plugin bundle.
      "obsidianmd/no-nodejs-modules": "off",
    },
  },
]);
