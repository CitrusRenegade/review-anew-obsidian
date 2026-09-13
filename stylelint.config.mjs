import obsidian from "stylelint-config-obsidianmd";

const [enabled, browserOptions] =
  obsidian.rules["plugin/no-unsupported-browser-features"];

export default {
  extends: ["stylelint-config-obsidianmd"],
  rules: {
    // Match the Electron 39 / Obsidian 1.11.4 baseline reported by Community preview.
    "plugin/no-unsupported-browser-features": [
      enabled,
      { ...browserOptions, browsers: ["electron >= 39"] },
    ],
  },
};
