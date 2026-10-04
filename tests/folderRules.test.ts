import { describe, expect, it } from "vitest";
import { migrateRenamedFolderReviewRules } from "../src/folderRules";

describe("folder rename boundaries", () => {
  it("migrates the folder itself and descendants without touching a shared prefix", () => {
    const settings = {
      includedFolders: ["Archive", "Archive/Sub", "Archived"],
      excludedFolders: ["Archive/Hidden", "Archive-copy"],
      folderIntervals: [
        { folder: "Archive", days: 7 },
        { folder: "Archive/Sub", days: 14 },
        { folder: "Archived", days: 30 },
      ],
    };
    expect(migrateRenamedFolderReviewRules(settings, "Archive", "Moved")).toBe(true);
    expect(settings).toEqual({
      includedFolders: ["Moved", "Moved/Sub", "Archived"],
      excludedFolders: ["Moved/Hidden", "Archive-copy"],
      folderIntervals: [
        { folder: "Moved", days: 7 },
        { folder: "Moved/Sub", days: 14 },
        { folder: "Archived", days: 30 },
      ],
    });
  });

  it("preserves first-wins collisions when a folder is moved onto an existing rule", () => {
    const settings = {
      includedFolders: ["Moved", "Archive"], excludedFolders: [],
      folderIntervals: [{ folder: "Moved", days: 30 }, { folder: "Archive", days: 7 }],
    };
    migrateRenamedFolderReviewRules(settings, "Archive", "Moved");
    expect(settings.includedFolders).toEqual(["Moved"]);
    expect(settings.folderIntervals).toEqual([{ folder: "Moved", days: 30 }]);
  });
});
