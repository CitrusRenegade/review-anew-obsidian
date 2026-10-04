import { isWithinFolder } from "./folderRules";

export type RenamedReviewTargetKind = "file" | "folder" | "other";

export function shouldRefreshActiveReviewAfterRename(
  targetKind: RenamedReviewTargetKind,
  renamedFileIsActive: boolean,
  activeFilePath?: string,
  renamedFolderPath?: string
): boolean {
  if (targetKind === "file") return renamedFileIsActive;

  return targetKind === "folder" &&
    activeFilePath !== undefined &&
    renamedFolderPath !== undefined &&
    isWithinFolder(activeFilePath, renamedFolderPath);
}
