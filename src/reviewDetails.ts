import type { App, TFile } from "obsidian";
import {
  getLastReviewedDay,
  getReviewIntervalCalculation,
  type ReviewIntervalCandidate,
  type ReviewIntervalCalculation,
} from "./review";
import type { ReviewSettings } from "./settings";

export type ReviewTiming =
  | { kind: "never-reviewed"; days: null }
  | { kind: "overdue"; days: number }
  | { kind: "due-today"; days: 0 }
  | { kind: "upcoming"; days: number };

export type ReviewTimingTone =
  | "not-reviewed"
  | "due"
  | "overdue"
  | "reviewed";

export interface ReviewTimingPresentation {
  text: string;
  tone: ReviewTimingTone;
}

export interface ReviewDetails {
  calculation: ReviewIntervalCalculation;
  lastReviewedDay: string | null;
  nextReviewDay: string | null;
  timing: ReviewTiming;
}

export interface ReviewCalculationRow {
  position: number;
  label: string;
  value: string;
  applied: boolean;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function addCalendarDays(day: string, days: number): string | null {
  const [year, month, date] = day.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, date + days));
  if (Number.isNaN(result.getTime())) return null;
  return `${result.getUTCFullYear()}-${pad2(result.getUTCMonth() + 1)}-${pad2(
    result.getUTCDate()
  )}`;
}

function getCalendarDaysSince(day: string, now: Date): number {
  const [year, month, date] = day.split("-").map(Number);
  const reviewedDay = Date.UTC(year, month - 1, date);
  const currentDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((currentDay - reviewedDay) / (24 * 60 * 60 * 1000));
}

export function getReviewTimingPresentation(
  timing: ReviewTiming
): ReviewTimingPresentation {
  if (timing.kind === "never-reviewed") {
    return { text: "Not reviewed", tone: "not-reviewed" };
  }
  if (timing.kind === "due-today") {
    return { text: "Due today", tone: "due" };
  }
  const unit = timing.days === 1 ? "day" : "days";
  if (timing.kind === "overdue") {
    return { text: `Overdue · ${timing.days} ${unit}`, tone: "overdue" };
  }
  return { text: `Due in ${timing.days} ${unit}`, tone: "reviewed" };
}

export function formatCalculationMode(
  mode: ReviewSettings["folderFilterMode"]
): string {
  return mode === "included"
    ? "Mode: Include Folders"
    : "Mode: Exclude Folders";
}

export function formatCalculationRows(
  candidates: ReviewIntervalCandidate[]
): ReviewCalculationRow[] {
  return candidates.map((candidate, index) => {
    if (candidate.kind === "note") {
      return {
        position: index + 1,
        label: "Note override",
        value: `${candidate.days} days`,
        applied: candidate.applied,
      };
    }
    if (candidate.kind === "folder") {
      return {
        position: index + 1,
        label: "Folder interval",
        value: `${candidate.folder} · ${candidate.days} days`,
        applied: candidate.applied,
      };
    }
    return {
      position: index + 1,
      label: "Global interval",
      value: `${candidate.days} days`,
      applied: candidate.applied,
    };
  });
}

export function getReviewDetails(
  file: TFile,
  app: App,
  settings: ReviewSettings,
  now = new Date()
): ReviewDetails | null {
  const calculation = getReviewIntervalCalculation(file, app, settings);
  const interval = calculation.effectiveIntervalDays;
  if (interval === null) return null;

  const lastReviewedDay = getLastReviewedDay(file, app, settings);
  if (!lastReviewedDay) {
    return {
      calculation,
      lastReviewedDay: null,
      nextReviewDay: null,
      timing: { kind: "never-reviewed", days: null },
    };
  }

  const nextReviewDay = addCalendarDays(lastReviewedDay, interval);
  const daysUntilDue = interval - getCalendarDaysSince(lastReviewedDay, now);
  const timing: ReviewTiming =
    daysUntilDue < 0
      ? { kind: "overdue", days: Math.abs(daysUntilDue) }
      : daysUntilDue === 0
        ? { kind: "due-today", days: 0 }
        : { kind: "upcoming", days: daysUntilDue };

  return {
    calculation,
    lastReviewedDay,
    nextReviewDay,
    timing,
  };
}
