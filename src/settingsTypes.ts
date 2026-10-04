/** Persisted review settings, independent of the Obsidian settings UI. */
export interface FolderInterval {
  folder: string;
  days: number;
}

export type FolderFilterMode = "excluded" | "included";

export interface ReviewSettings {
  renameNoticeHandled?: boolean;
  globalIntervalDays: number;
  folderFilterMode: FolderFilterMode;
  excludedFolders: string[];
  includedFolders: string[];
  folderIntervals: FolderInterval[];
  showReviewStatus: boolean;
  showDueCounter: boolean;
  showRibbonIcon: boolean;
  reviewDetailsFontSizeAdjustment: number;
  frontmatterIntervalKey: string;
  frontmatterReviewedKey: string;
}
