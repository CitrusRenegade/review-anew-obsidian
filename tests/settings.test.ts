import { describe, expect, it } from "vitest";
import {
  migrateRenamedFolderReviewRules,
  normalizeFolderReviewRules,
} from "../src/folderRules";
import { isValidFrontmatterKey } from "../src/frontmatterKey";
import type { ReviewSettings } from "../src/settingsTypes";

const baseSettings: ReviewSettings = {
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

describe("migrateRenamedFolderReviewRules", () => {
  it("migrates exact folder rules and child folder rules", () => {
    const settings: ReviewSettings = {
      ...baseSettings,
      excludedFolders: ["Projects", "Projects/Archive"],
      includedFolders: ["Projects/Active"],
      folderIntervals: [
        { folder: "Projects", days: 30 },
        { folder: "Projects/Active", days: 7 },
      ],
    };

    expect(
      migrateRenamedFolderReviewRules(settings, "Projects", "Work")
    ).toBe(true);

    expect(settings.excludedFolders).toEqual(["Work", "Work/Archive"]);
    expect(settings.includedFolders).toEqual(["Work/Active"]);
    expect(settings.folderIntervals).toEqual([
      { folder: "Work", days: 30 },
      { folder: "Work/Active", days: 7 },
    ]);
  });

  it("does not migrate sibling paths with the same prefix", () => {
    const settings: ReviewSettings = {
      ...baseSettings,
      excludedFolders: ["Projects Archive", "ProjectsOld"],
      includedFolders: ["Projects"],
      folderIntervals: [{ folder: "ProjectsOld/Sub", days: 14 }],
    };

    expect(
      migrateRenamedFolderReviewRules(settings, "Projects", "Work")
    ).toBe(true);

    expect(settings.excludedFolders).toEqual(["Projects Archive", "ProjectsOld"]);
    expect(settings.includedFolders).toEqual(["Work"]);
    expect(settings.folderIntervals).toEqual([
      { folder: "ProjectsOld/Sub", days: 14 },
    ]);
  });

  it("normalizes renamed folder paths before migrating rules", () => {
    const settings: ReviewSettings = {
      ...baseSettings,
      excludedFolders: ["Projects/Active"],
    };

    expect(
      migrateRenamedFolderReviewRules(settings, "Projects\\Active", "Work\\Now")
    ).toBe(true);

    expect(settings.excludedFolders).toEqual(["Work/Now"]);
  });

  it("returns false when no rules match the renamed folder", () => {
    const settings: ReviewSettings = {
      ...baseSettings,
      excludedFolders: ["Archive"],
    };

    expect(
      migrateRenamedFolderReviewRules(settings, "Projects", "Work")
    ).toBe(false);
    expect(settings.excludedFolders).toEqual(["Archive"]);
  });

  it("returns false when old and new paths normalize to the same folder", () => {
    const settings: ReviewSettings = {
      ...baseSettings,
      excludedFolders: ["Projects"],
    };

    expect(
      migrateRenamedFolderReviewRules(settings, "Projects", "Projects")
    ).toBe(false);
    expect(settings.excludedFolders).toEqual(["Projects"]);
  });

  it("deduplicates folder review settings with first-wins interval behavior", () => {
    const settings: ReviewSettings = {
      ...baseSettings,
      excludedFolders: ["Projects", "Projects", "Archive"],
      includedFolders: ["Notes", "Notes"],
      folderIntervals: [
        { folder: "Projects", days: 30 },
        { folder: "Projects", days: 7 },
        { folder: "Projects/Sub", days: 14 },
      ],
    };

    expect(normalizeFolderReviewRules(settings)).toBe(true);
    expect(settings.excludedFolders).toEqual(["Projects", "Archive"]);
    expect(settings.includedFolders).toEqual(["Notes"]);
    expect(settings.folderIntervals).toEqual([
      { folder: "Projects", days: 30 },
      { folder: "Projects/Sub", days: 14 },
    ]);
  });

  it("normalizes folder rule slash variants before matching", () => {
    const settings: ReviewSettings = {
      ...baseSettings,
      excludedFolders: [" /Projects// ", "Projects\\", "Archive/"],
      includedFolders: ["/Notes/", "Notes\\"],
      folderIntervals: [
        { folder: "/Projects//Active/", days: 30 },
        { folder: "Projects\\Active", days: 7 },
      ],
    };

    expect(normalizeFolderReviewRules(settings)).toBe(true);
    expect(settings.excludedFolders).toEqual(["Projects", "Archive"]);
    expect(settings.includedFolders).toEqual(["Notes"]);
    expect(settings.folderIntervals).toEqual([
      { folder: "Projects/Active", days: 30 },
    ]);
  });

  it("deduplicates renamed folder rule collisions", () => {
    const settings: ReviewSettings = {
      ...baseSettings,
      excludedFolders: ["Work", "Projects"],
      includedFolders: [],
      folderIntervals: [
        { folder: "Work", days: 30 },
        { folder: "Projects", days: 7 },
      ],
    };

    expect(
      migrateRenamedFolderReviewRules(settings, "Projects", "Work")
    ).toBe(true);

    expect(settings.excludedFolders).toEqual(["Work"]);
    expect(settings.folderIntervals).toEqual([{ folder: "Work", days: 30 }]);
  });

});

describe("frontmatter key settings", () => {
  it("accepts simple YAML-safe frontmatter keys", () => {
    expect(isValidFrontmatterKey("reviewed")).toBe(true);
    expect(isValidFrontmatterKey("review_interval")).toBe(true);
    expect(isValidFrontmatterKey("review-interval-2")).toBe(true);
  });

  it("rejects unsafe or confusing frontmatter keys", () => {
    for (const key of ["", "reviewed at", "nested.key", "__proto__", "constructor"]) {
      expect(isValidFrontmatterKey(key)).toBe(false);
    }
  });
});
