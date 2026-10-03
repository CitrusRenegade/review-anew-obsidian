import type { App } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  PluginSettingTab: class {
    update = vi.fn();

    constructor(_app: unknown, _plugin: unknown) {}
  },
  Setting: class {},
  normalizePath: (path: string) => path,
}));

import {
  loadReviewSettings,
  ReviewSettingTab,
  type ReviewSettings,
} from "../src/settings";

type Definition = {
  name?: string;
  aliases?: string[];
  render?: (setting: ModeSetting) => void;
  control?: {
    type: string;
    key: string;
    min?: number;
    step?: number | "any";
    validate?: (value: unknown) => string | void;
  };
  items?: Definition[];
};

type ModeToggle = {
  setValue(value: boolean): ModeToggle;
  onChange(callback: (value: boolean) => Promise<void>): ModeToggle;
};

type ModeSetting = {
  addToggle(callback: (toggle: ModeToggle) => unknown): void;
};

const settings: ReviewSettings = {
  globalIntervalDays: 45,
  folderFilterMode: "excluded",
  excludedFolders: [],
  includedFolders: [],
  folderIntervals: [],
  showReviewStatus: true,
  showDueCounter: true,
  showRibbonIcon: false,
  reviewDetailsFontSizeAdjustment: 0,
  frontmatterIntervalKey: "review_interval",
  frontmatterReviewedKey: "reviewed",
};

function flatten(definitions: Definition[]): Definition[] {
  return definitions.flatMap((definition) => [
    definition,
    ...(definition.items ? flatten(definition.items) : []),
  ]);
}

function definitionByName(definitions: Definition[], name: string): Definition {
  const definition = flatten(definitions).find((item) => item.name === name);
  if (!definition) throw new Error(`Missing setting definition: ${name}`);
  return definition;
}

function createTab() {
  const plugin = {
    settings: { ...settings },
    saveSettings: vi.fn(async () => undefined),
    refreshReviewState: vi.fn(),
    updateRibbonIcon: vi.fn(),
  };
  const update = vi.fn();
  const tab = new ReviewSettingTab({} as App, plugin as never);
  tab.update = update;
  return { plugin, tab, update };
}

beforeEach(() => {
  vi.stubGlobal("createFragment", (callback: (el: HTMLElement) => void) => {
    const element = {
      appendText: vi.fn(),
      createEl: vi.fn(() => ({ appendText: vi.fn() })),
    };
    callback(element as never);
    return element;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReviewSettingTab declarative controls", () => {
  it("rejects matching frontmatter keys in either control without saving", async () => {
    const { tab, plugin } = createTab();
    const definitions = tab.getSettingDefinitions() as Definition[];
    const interval = definitionByName(definitions, "Frontmatter interval key");
    const reviewed = definitionByName(definitions, "Frontmatter reviewed key");

    expect(interval.control?.validate?.(" reviewed ")).toBe(
      "Use different fields for the interval and review date."
    );
    expect(reviewed.control?.validate?.(" review_interval ")).toBe(
      "Use different fields for the interval and review date."
    );
    await tab.setControlValue("frontmatterIntervalKey", " reviewed ");
    await tab.setControlValue("frontmatterReviewedKey", " review_interval ");
    expect(plugin.settings.frontmatterIntervalKey).toBe("review_interval");
    expect(plugin.settings.frontmatterReviewedKey).toBe("reviewed");
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(plugin.refreshReviewState).not.toHaveBeenCalled();

    await tab.setControlValue("frontmatterIntervalKey", "custom_interval");
    expect(reviewed.control?.validate?.("custom_interval")).toBe(
      "Use different fields for the interval and review date."
    );
    expect(reviewed.control?.validate?.("review_interval")).toBeUndefined();
  });

  it("preserves saved colliding fields and allows changing one to resolve them", async () => {
    const { tab, plugin } = createTab();
    plugin.settings = loadReviewSettings({
      frontmatterIntervalKey: "custom",
      frontmatterReviewedKey: "custom",
    });
    expect(plugin.settings.frontmatterIntervalKey).toBe("custom");
    expect(plugin.settings.frontmatterReviewedKey).toBe("custom");
    await tab.setControlValue("frontmatterReviewedKey", "review_date");
    expect(plugin.settings.frontmatterReviewedKey).toBe("review_date");
    expect(plugin.settings.frontmatterIntervalKey).toBe("custom");
    expect(plugin.saveSettings).toHaveBeenCalledOnce();
  });

  it("keeps the future review-details font adjustment within its slider range", () => {
    const defaultSettings = loadReviewSettings({}) as unknown as Record<string, unknown>;
    const largerSettings = loadReviewSettings({
      reviewDetailsFontSizeAdjustment: 2,
    }) as unknown as Record<string, unknown>;
    const outOfRangeSettings = loadReviewSettings({
      reviewDetailsFontSizeAdjustment: 3,
    }) as unknown as Record<string, unknown>;
    const fractionalSettings = loadReviewSettings({
      reviewDetailsFontSizeAdjustment: 0.5,
    }) as unknown as Record<string, unknown>;

    expect(defaultSettings.reviewDetailsFontSizeAdjustment).toBe(0);
    expect(largerSettings.reviewDetailsFontSizeAdjustment).toBe(2);
    expect(outOfRangeSettings.reviewDetailsFontSizeAdjustment).toBe(2);
    expect(fractionalSettings.reviewDetailsFontSizeAdjustment).toBe(0);
  });

  it("exposes validated native controls and search aliases for simple settings", () => {
    const { tab } = createTab();
    const definitions = tab.getSettingDefinitions() as Definition[];

    const interval = definitionByName(definitions, "Global review interval");
    expect(interval.aliases).toEqual(expect.arrayContaining(["days", "due", "schedule"]));
    expect(interval.control).toMatchObject({
      type: "number",
      key: "globalIntervalDays",
      min: 1,
      step: 1,
    });
    expect(interval.control?.validate?.(0)).toBe("Enter a whole number of days.");
    expect(interval.control?.validate?.(7)).toBeUndefined();

    const reviewStatus = definitionByName(definitions, "Review status in status bar");
    expect(reviewStatus.aliases).toEqual(expect.arrayContaining(["status", "indicator"]));
    expect(reviewStatus.control).toMatchObject({
      type: "toggle",
      key: "showReviewStatus",
    });
    const dueCounter = definitionByName(definitions, "Due counter in status bar");
    expect(dueCounter.aliases).toEqual(expect.arrayContaining(["due", "pending", "count"]));
    expect(dueCounter.control).toMatchObject({
      type: "toggle",
      key: "showDueCounter",
    });
    const ribbon = definitionByName(definitions, "Ribbon icon");
    expect(ribbon.aliases).toEqual(expect.arrayContaining(["ribbon", "button"]));
    expect(ribbon.control).toMatchObject({
      type: "toggle",
      key: "showRibbonIcon",
    });
    const intervalKey = definitionByName(definitions, "Frontmatter interval key");
    expect(intervalKey.aliases).toEqual(
      expect.arrayContaining(["YAML", "metadata", "review_interval"])
    );
    expect(intervalKey.control).toMatchObject({
      type: "text",
      key: "frontmatterIntervalKey",
    });
    const reviewedKey = definitionByName(definitions, "Frontmatter reviewed key");
    expect(reviewedKey.aliases).toEqual(
      expect.arrayContaining(["YAML", "metadata", "reviewed"])
    );
    expect(reviewedKey.control).toMatchObject({
      type: "text",
      key: "frontmatterReviewedKey",
    });
    expect(definitionByName(definitions, "Mode: Exclude").aliases).toEqual(
      expect.arrayContaining(["mode", "include", "exclude"])
    );
  });

  it("updates the folder filter label after its toggle changes mode", async () => {
    const { tab, update } = createTab();
    const mode = definitionByName(tab.getSettingDefinitions() as Definition[], "Mode: Exclude");
    let onChange: ((value: boolean) => Promise<void>) | undefined;
    const toggle: ModeToggle = {
      setValue: () => toggle,
      onChange: (callback) => {
        onChange = callback;
        return toggle;
      },
    };

    mode.render?.({
      addToggle: (callback) => {
        callback(toggle);
      },
    });

    if (!onChange) throw new Error("Mode toggle did not register a change handler");

    await onChange(true);

    expect(update).toHaveBeenCalledTimes(1);
    expect(definitionByName(tab.getSettingDefinitions() as Definition[], "Mode: Include")).toBeDefined();
  });

  it("persists declarative control changes and keeps their UI side effects", async () => {
    const { plugin, tab } = createTab();

    await tab.setControlValue("globalIntervalDays", 30);
    expect(plugin.settings.globalIntervalDays).toBe(30);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.refreshReviewState).toHaveBeenCalledTimes(1);
    expect(plugin.updateRibbonIcon).not.toHaveBeenCalled();

    await tab.setControlValue("showRibbonIcon", true);
    expect(plugin.settings.showRibbonIcon).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
    expect(plugin.updateRibbonIcon).toHaveBeenCalledTimes(1);
  });

  it("persists a future review-details font slider step and rejects values outside its range", async () => {
    const { plugin, tab } = createTab();

    await tab.setControlValue("reviewDetailsFontSizeAdjustment", 2);

    expect(plugin.settings.reviewDetailsFontSizeAdjustment).toBe(2);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.refreshReviewState).toHaveBeenCalledTimes(1);

    await tab.setControlValue("reviewDetailsFontSizeAdjustment", 3);

    expect(plugin.settings.reviewDetailsFontSizeAdjustment).toBe(2);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.refreshReviewState).toHaveBeenCalledTimes(1);
  });
});
