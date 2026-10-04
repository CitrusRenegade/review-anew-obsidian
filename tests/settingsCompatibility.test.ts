import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import { DEFAULT_SETTINGS, loadReviewSettings } from "../src/settings";
import { getEffectiveInterval } from "../src/review";

describe("persisted settings compatibility", () => {
  it("keeps custom properties and folder meaning through save and reload", () => {
    const saved = {
      globalIntervalDays: 60, folderFilterMode: "included",
      includedFolders: ["Projects/", "Projects"], excludedFolders: ["Archive"],
      folderIntervals: [
        { folder: "Projects", days: 20 }, { folder: "Projects/Active", days: 7 },
        { folder: "Projects/Active/", days: 90 },
      ],
      frontmatterReviewedKey: "checked", frontmatterIntervalKey: "schedule",
      showReviewStatus: false, showDueCounter: true, showRibbonIcon: true,
    };
    const loaded = loadReviewSettings(saved);
    const reloaded = loadReviewSettings(JSON.parse(JSON.stringify(loaded)));
    expect(reloaded).toEqual(loaded);
    expect(reloaded.frontmatterReviewedKey).toBe("checked");
    expect(reloaded.frontmatterIntervalKey).toBe("schedule");
    expect(reloaded.excludedFolders).toEqual(["Archive"]);
    expect(reloaded.showReviewStatus).toBe(false);
    expect(reloaded.showRibbonIcon).toBe(true);
    const app = { metadataCache: { getFileCache: () => ({ frontmatter: {} }) } } as unknown as App;
    expect(getEffectiveInterval({ path: "Projects/Active/a.md" } as TFile, app, reloaded)).toBe(7);
    expect(getEffectiveInterval({ path: "Elsewhere/a.md" } as TFile, app, reloaded)).toBeNull();
    expect(getEffectiveInterval({ path: "Projects/Active/a.md" } as TFile, app,
      loadReviewSettings({ ...saved, includedFolders: [] }))).toBeNull();
  });

  it.each([null, [], "invalid", { globalIntervalDays: -1, folderIntervals: [null], showDueCounter: "false" }])(
    "uses safe defaults for malformed saved data %j", (saved) => {
      const loaded = loadReviewSettings(saved);
      expect(loaded.globalIntervalDays).toBe(DEFAULT_SETTINGS.globalIntervalDays);
      expect(loaded.folderIntervals).toEqual([]);
      expect(loaded.showDueCounter).toBe(true);
    }
  );
});
