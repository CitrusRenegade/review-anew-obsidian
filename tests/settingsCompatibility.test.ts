import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import { DEFAULT_SETTINGS, loadReviewSettings } from "../src/settings";
import { getEffectiveInterval } from "../src/review";

describe("persisted settings compatibility", () => {
  it("preserves unknown JSON settings through loading, serialization and reload", () => {
    const raw = {
      globalIntervalDays: 60, renameNoticeHandled: true,
      futureReviewMode: { enabled: false, strategy: "ordered", weights: [0, 2], pausedAt: null },
      futureEmptyList: [], futureLabel: "", futureLimit: 0,
    };
    const loaded = loadReviewSettings(raw);
    const persisted: unknown = JSON.parse(JSON.stringify(loaded));
    const reloaded = loadReviewSettings(persisted);
    expect(persisted).toMatchObject(raw);
    expect(reloaded).toMatchObject(raw);
    expect(reloaded.renameNoticeHandled).toBe(true);
    expect(reloaded.globalIntervalDays).toBe(60);
    expect(reloaded.frontmatterReviewedKey).toBe("reviewed");
  });

  it("validates known fields even when unknown JSON fields are retained", () => {
    const loaded = loadReviewSettings({
      globalIntervalDays: -1, folderFilterMode: "future-mode",
      showDueCounter: "false", folderIntervals: [null],
      futureReviewMode: { version: 2 },
    });
    const reloaded = loadReviewSettings(JSON.parse(JSON.stringify(loaded)));
    expect(reloaded).toMatchObject({
      globalIntervalDays: 45, folderFilterMode: "excluded",
      showDueCounter: true, folderIntervals: [], futureReviewMode: { version: 2 },
    });
  });

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
