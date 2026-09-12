import type { App, TFile } from "obsidian";
import { parsePositiveDayCount } from "./interval";
import type { FolderInterval, ReviewSettings } from "./settings";

const DAY_MS = 24 * 60 * 60 * 1000;
export const NEVER_REVIEWED_RANDOM_SCORE = 1.5;

export type ReviewDay = string;

type RandomSource = () => number;

export type ReviewIntervalCandidate =
  | { kind: "note"; days: number; applied: boolean }
  | { kind: "folder"; folder: string; days: number; applied: boolean }
  | { kind: "default"; days: number; applied: boolean };

export interface ReviewIntervalCalculation {
  mode: ReviewSettings["folderFilterMode"];
  effectiveIntervalDays: number | null;
  candidates: ReviewIntervalCandidate[];
}

type CachedDueState = {
  file: TFile;
  due: boolean;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatReviewDay(year: number, month: number, day: number): ReviewDay {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function reviewDayFromParts(
  year: number,
  month: number,
  day: number
): ReviewDay | null {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return formatReviewDay(year, month, day);
}

function reviewDayFromDate(date: Date): ReviewDay | null {
  if (isNaN(date.getTime())) return null;
  return formatReviewDay(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  );
}

function localDayKey(date: Date): string {
  return formatReviewDay(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function parseDateOnly(value: string): ReviewDay | null | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return reviewDayFromParts(year, month, day);
}

function parseLeadingReviewDay(value: string): ReviewDay | null | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/.exec(value.trim());
  if (!match) return undefined;
  return parseDateOnly(match[1]);
}

function parseReviewDay(value: unknown): ReviewDay | null {
  if (!value) return null;

  if (typeof value === "string") {
    const parsed = parseLeadingReviewDay(value);
    return parsed === undefined ? null : parsed;
  }

  if (value instanceof Date) return reviewDayFromDate(value);

  if (typeof value === "number" && Number.isFinite(value)) {
    return reviewDayFromDate(new Date(value));
  }

  return null;
}

function getFrontmatter(file: TFile, app: App): Record<string, unknown> {
  return app.metadataCache.getFileCache(file)?.frontmatter ?? {};
}

function getRandomIndex(length: number, random: RandomSource): number {
  const value = random();
  if (value <= 0) return 0;
  if (value >= 1) return length - 1;
  return Math.floor(value * length);
}

export function getOverdueRatioScore(
  lastReviewedDay: ReviewDay | null,
  intervalDays: number,
  now = new Date()
): number {
  if (!lastReviewedDay) return NEVER_REVIEWED_RANDOM_SCORE;
  return getCalendarDaysSince(lastReviewedDay, now) / intervalDays;
}

export function addCalendarDays(
  reviewDay: ReviewDay,
  days: number
): ReviewDay | null {
  const parsed = parseDateOnly(reviewDay);
  if (!parsed) return null;
  const [year, month, day] = parsed.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  if (Number.isNaN(result.getTime())) return null;
  return formatReviewDay(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    result.getUTCDate()
  );
}

export function getCalendarDayDelta(
  reviewDay: ReviewDay,
  now = new Date()
): number {
  const parsed = parseDateOnly(reviewDay);
  if (!parsed) return 0;
  const [year, month, day] = parsed.split("-").map(Number);
  const reviewedDay = Date.UTC(year, month - 1, day);
  const nowDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((nowDay - reviewedDay) / DAY_MS);
}

export function getCalendarDaysSince(
  lastReviewedDay: ReviewDay,
  now = new Date()
): number {
  return Math.max(0, getCalendarDayDelta(lastReviewedDay, now));
}

export function pickTournamentWinner<T>(
  items: T[],
  getScore: (item: T) => number,
  random: RandomSource = Math.random
): T | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];

  const firstIndex = getRandomIndex(items.length, random);
  let secondIndex = getRandomIndex(items.length - 1, random);
  if (secondIndex >= firstIndex) secondIndex += 1;

  const first = items[firstIndex];
  const second = items[secondIndex];
  return getScore(second) > getScore(first) ? second : first;
}

export function isExcluded(file: TFile, settings: ReviewSettings): boolean {
  const list =
    settings.folderFilterMode === "included"
      ? settings.includedFolders
      : settings.excludedFolders;
  const inList = list.some((folder) => file.path.startsWith(folder + "/"));
  return settings.folderFilterMode === "included" ? !inList : inList;
}

export function getLocalInterval(
  file: TFile,
  app: App,
  settings: ReviewSettings
): number | "never" | null {
  const fm = getFrontmatter(file, app);
  const val = fm[settings.frontmatterIntervalKey];
  if (typeof val === "string" && val.trim().toLowerCase() === "never") {
    return "never";
  }
  return parsePositiveDayCount(val);
}

export function getFolderInterval(
  file: TFile,
  settings: ReviewSettings
): number | null {
  let best: FolderInterval | null = null;
  for (const rule of settings.folderIntervals) {
    if (file.path.startsWith(rule.folder + "/")) {
      if (!best || rule.folder.length > best.folder.length) {
        best = rule;
      }
    }
  }
  return best ? best.days : null;
}

export function getReviewIntervalCalculation(
  file: TFile,
  app: App,
  settings: ReviewSettings
): ReviewIntervalCalculation {
  const local = getLocalInterval(file, app, settings);
  const matchingFolderRules = settings.folderIntervals
    .filter((rule) => file.path.startsWith(rule.folder + "/"))
    .sort((left, right) => right.folder.length - left.folder.length);
  const effectiveIntervalDays =
    typeof local === "number"
      ? local
      : local === "never" || isExcluded(file, settings)
        ? null
        : matchingFolderRules[0]?.days ?? settings.globalIntervalDays;
  const candidates: ReviewIntervalCandidate[] = [];

  if (typeof local === "number") {
    candidates.push({ kind: "note", days: local, applied: true });
  }

  matchingFolderRules.forEach((rule, index) => {
    candidates.push({
      kind: "folder",
      folder: rule.folder,
      days: rule.days,
      applied: typeof local !== "number" && effectiveIntervalDays !== null && index === 0,
    });
  });

  candidates.push({
    kind: "default",
    days: settings.globalIntervalDays,
    applied:
      typeof local !== "number" &&
      effectiveIntervalDays !== null &&
      matchingFolderRules.length === 0,
  });

  return {
    mode: settings.folderFilterMode,
    effectiveIntervalDays,
    candidates,
  };
}

export function getEffectiveInterval(
  file: TFile,
  app: App,
  settings: ReviewSettings
): number | null {
  const local = getLocalInterval(file, app, settings);
  if (local === "never") return null;
  if (typeof local === "number") return local;

  if (isExcluded(file, settings)) return null;

  const folderInterval = getFolderInterval(file, settings);
  if (folderInterval !== null) return folderInterval;

  return settings.globalIntervalDays;
}

export function getLastReviewedDay(
  file: TFile,
  app: App,
  settings: ReviewSettings
): ReviewDay | null {
  const fm = getFrontmatter(file, app);
  return parseReviewDay(fm[settings.frontmatterReviewedKey]);
}

export function isDue(
  file: TFile,
  app: App,
  settings: ReviewSettings,
  now = new Date()
): boolean {
  const interval = getEffectiveInterval(file, app, settings);
  if (interval === null) return false;
  const lastReviewedDay = getLastReviewedDay(file, app, settings);
  if (!lastReviewedDay) return true;
  return getCalendarDaysSince(lastReviewedDay, now) >= interval;
}

export function getReviewableFiles(
  app: App,
  settings: ReviewSettings
): TFile[] {
  return app.vault.getMarkdownFiles().filter((f) => {
    const local = getLocalInterval(f, app, settings);
    if (local === "never") return false;
    if (typeof local === "number") return true;
    if (isExcluded(f, settings)) return false;
    return true;
  });
}

export function getDueFiles(
  app: App,
  settings: ReviewSettings,
  now = new Date()
): TFile[] {
  return getReviewableFiles(app, settings).filter((f) =>
    isDue(f, app, settings, now)
  );
}

export function pickRandomDue(
  app: App,
  settings: ReviewSettings,
  random: RandomSource = Math.random
): TFile | null {
  const now = new Date();
  const due = getDueFiles(app, settings, now);
  return pickTournamentWinner(
    due,
    (file) => {
      const interval = getEffectiveInterval(file, app, settings);
      if (interval === null) return Number.NEGATIVE_INFINITY;
      return getOverdueRatioScore(
        getLastReviewedDay(file, app, settings),
        interval,
        now
      );
    },
    random
  );
}

export function countDue(app: App, settings: ReviewSettings): number {
  return getDueFiles(app, settings).length;
}

export class DueCounterCache {
  private app: App;
  private getSettings: () => ReviewSettings;
  private entriesByPath = new Map<string, CachedDueState>();
  private dirtyFilesByPath = new Map<string, TFile>();
  private dueCount: number | null = null;
  private countedDay: string | null = null;

  constructor(
    app: App,
    getSettings: () => ReviewSettings
  ) {
    this.app = app;
    this.getSettings = getSettings;
  }

  invalidateAll(): void {
    this.entriesByPath.clear();
    this.dirtyFilesByPath.clear();
    this.dueCount = null;
    this.countedDay = null;
  }

  invalidateFile(file: TFile): void {
    if (file.extension !== "md" || this.dueCount === null) return;

    const previous = this.entriesByPath.get(file.path);
    if (previous?.due) {
      this.dueCount -= 1;
    }

    this.entriesByPath.delete(file.path);
    this.dirtyFilesByPath.set(file.path, file);
  }

  removeFile(pathOrFile: string | TFile): void {
    if (this.dueCount === null) return;

    const path = typeof pathOrFile === "string" ? pathOrFile : pathOrFile.path;
    const previous = this.entriesByPath.get(path);
    if (previous?.due) {
      this.dueCount -= 1;
    }

    this.entriesByPath.delete(path);
    this.dirtyFilesByPath.delete(path);
  }

  renameFile(file: TFile, oldPath: string): void {
    this.removeFile(oldPath);
    this.invalidateFile(file);
  }

  countDue(now = new Date()): number {
    if (this.dueCount !== null && this.countedDay !== localDayKey(now)) {
      this.invalidateAll();
    }

    if (this.dueCount === null) {
      return this.rebuild(now);
    }

    this.processDirtyFiles(now);
    return this.dueCount;
  }

  private rebuild(now: Date): number {
    this.entriesByPath.clear();
    this.dirtyFilesByPath.clear();
    this.dueCount = 0;
    this.countedDay = localDayKey(now);

    for (const file of this.app.vault.getMarkdownFiles()) {
      const due = isDue(file, this.app, this.getSettings(), now);
      this.entriesByPath.set(file.path, { file, due });
      if (due) {
        this.dueCount += 1;
      }
    }

    return this.dueCount;
  }

  private processDirtyFiles(now: Date): void {
    if (this.dirtyFilesByPath.size === 0 || this.dueCount === null) return;

    for (const [path, file] of this.dirtyFilesByPath) {
      const due = isDue(file, this.app, this.getSettings(), now);
      this.entriesByPath.set(path, { file, due });
      if (due) {
        this.dueCount += 1;
      }
    }

    this.dirtyFilesByPath.clear();
  }
}
