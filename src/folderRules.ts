import type { FolderInterval } from "./settingsTypes";

interface FolderReviewRuleSettings {
  excludedFolders: string[];
  includedFolders: string[];
  folderIntervals: FolderInterval[];
}

function normalizeFolderPath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function migrateFolderPath(
  folderPath: string,
  oldFolderPath: string,
  newFolderPath: string
): string {
  if (folderPath === oldFolderPath) return newFolderPath;

  const oldPrefix = oldFolderPath + "/";
  if (folderPath.startsWith(oldPrefix)) {
    return newFolderPath + "/" + folderPath.slice(oldPrefix.length);
  }

  return folderPath;
}

function dedupeFolderList(paths: string[]): { paths: string[]; changed: boolean } {
  const seen = new Set<string>();
  const deduped: string[] = [];
  let changed = false;

  for (const path of paths) {
    const normalized = normalizeFolderPath(path);
    if (!normalized || seen.has(normalized)) {
      changed = true;
      continue;
    }

    if (normalized !== path) changed = true;
    seen.add(normalized);
    deduped.push(normalized);
  }

  return { paths: deduped, changed };
}

function dedupeFolderIntervals(rules: FolderInterval[]): {
  rules: FolderInterval[];
  changed: boolean;
} {
  const seen = new Set<string>();
  const deduped: FolderInterval[] = [];
  let changed = false;

  for (const rule of rules) {
    const folder = normalizeFolderPath(rule.folder);
    if (!folder || seen.has(folder)) {
      changed = true;
      continue;
    }

    if (folder !== rule.folder) changed = true;
    seen.add(folder);
    deduped.push(folder === rule.folder ? rule : { ...rule, folder });
  }

  return { rules: deduped, changed };
}

export function normalizeFolderReviewRules(
  settings: FolderReviewRuleSettings
): boolean {
  const excludedFolders = dedupeFolderList(settings.excludedFolders);
  const includedFolders = dedupeFolderList(settings.includedFolders);
  const folderIntervals = dedupeFolderIntervals(settings.folderIntervals);
  const changed =
    excludedFolders.changed || includedFolders.changed || folderIntervals.changed;

  if (!changed) return false;

  settings.excludedFolders = excludedFolders.paths;
  settings.includedFolders = includedFolders.paths;
  settings.folderIntervals = folderIntervals.rules;
  return true;
}

export function migrateRenamedFolderReviewRules(
  settings: FolderReviewRuleSettings,
  oldPath: string,
  newPath: string
): boolean {
  const oldFolderPath = normalizeFolderPath(oldPath);
  const newFolderPath = normalizeFolderPath(newPath);
  if (!oldFolderPath || !newFolderPath || oldFolderPath === newFolderPath) {
    return false;
  }

  let changed = false;
  const migrate = (folderPath: string): string => {
    const migrated = migrateFolderPath(
      normalizeFolderPath(folderPath),
      oldFolderPath,
      newFolderPath
    );
    if (migrated !== folderPath) changed = true;
    return migrated;
  };

  const excludedFolders = settings.excludedFolders.map(migrate);
  const includedFolders = settings.includedFolders.map(migrate);
  const folderIntervals = settings.folderIntervals.map((rule) => {
    const folder = migrate(rule.folder);
    return folder === rule.folder ? rule : { ...rule, folder };
  });

  if (!changed) return false;

  settings.excludedFolders = excludedFolders;
  settings.includedFolders = includedFolders;
  settings.folderIntervals = folderIntervals;
  normalizeFolderReviewRules(settings);
  return true;
}
