import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import {
  formatCalculationMode,
  formatCalculationRows,
  formatReviewTiming,
  getReviewDetails,
} from "../src/reviewDetails";
import type { ReviewSettings } from "../src/settings";

const settings: ReviewSettings = {
  globalIntervalDays: 30,
  folderFilterMode: "included",
  excludedFolders: [],
  includedFolders: ["Projects"],
  folderIntervals: [],
  showReviewStatus: true,
  showDueCounter: true,
  showRibbonIcon: false,
  reviewDetailsFontSizeAdjustment: 0,
  frontmatterIntervalKey: "review_interval",
  frontmatterReviewedKey: "reviewed",
};

function file(path: string): TFile {
  return { path, extension: "md" } as TFile;
}

function appWithFrontmatter(
  target: TFile,
  frontmatter: Record<string, unknown>
): App {
  return {
    metadataCache: {
      getFileCache: (fileToRead: TFile) =>
        fileToRead.path === target.path ? { frontmatter } : null,
    },
  } as unknown as App;
}

describe("getReviewDetails", () => {
  it("reports the exact next review day and remaining calendar days", () => {
    const target = file("Projects/a.md");

    expect(
      getReviewDetails(
        target,
        appWithFrontmatter(target, { reviewed: "2026-08-10" }),
        settings,
        new Date(2026, 7, 28, 12)
      )
    ).toMatchObject({
      lastReviewedDay: "2026-08-10",
      nextReviewDay: "2026-09-09",
      timing: { kind: "upcoming", days: 12 },
    });
  });

  it("reports how many calendar days a review is overdue", () => {
    const target = file("Projects/a.md");

    expect(
      getReviewDetails(
        target,
        appWithFrontmatter(target, { reviewed: "2026-08-10" }),
        settings,
        new Date(2026, 8, 12, 12)
      )
    ).toMatchObject({
      nextReviewDay: "2026-09-09",
      timing: { kind: "overdue", days: 3 },
    });
  });

  it("keeps the remaining-day label consistent with a future reviewed day", () => {
    const target = file("Projects/a.md");

    expect(
      getReviewDetails(
        target,
        appWithFrontmatter(target, { reviewed: "2026-09-10" }),
        settings,
        new Date(2026, 7, 28, 12)
      )
    ).toMatchObject({
      nextReviewDay: "2026-10-10",
      timing: { kind: "upcoming", days: 43 },
    });
  });

  it("keeps very large valid intervals readable when the next date exceeds the Date range", () => {
    const target = file("Projects/a.md");
    const details = getReviewDetails(
      target,
      appWithFrontmatter(target, { reviewed: "2026-08-10" }),
      { ...settings, globalIntervalDays: 100_000_000 },
      new Date(2026, 7, 28, 12)
    );

    expect(details).toMatchObject({
      nextReviewDay: null,
      timing: { kind: "upcoming", days: 99_999_982 },
    });
    expect(
      details && formatReviewTiming(details.timing, details.nextReviewDay)
    ).toBe("Due in 99999982 days");
  });

  it("treats a note without a reviewed day as due now", () => {
    const target = file("Projects/a.md");

    expect(
      getReviewDetails(
        target,
        appWithFrontmatter(target, {}),
        settings,
        new Date(2026, 7, 28, 12)
      )
    ).toMatchObject({
      lastReviewedDay: null,
      nextReviewDay: null,
      timing: { kind: "never-reviewed", days: null },
    });
  });
});

describe("review details presentation", () => {
  it("shows only an overdue count in one line", () => {
    expect(
      formatReviewTiming(
        { kind: "overdue", days: 20 },
        "2026-08-19"
      )
    ).toBe("20 days overdue");
  });

  it("formats the compact upcoming review status", () => {
    expect(
      formatReviewTiming(
        { kind: "upcoming", days: 12 },
        "2026-09-09"
      )
    ).toBe("Due 2026-09-09 · in 12 days");
  });

  it("formats the configured folder mode separately from interval candidates", () => {
    expect(formatCalculationMode("included")).toBe("Mode: Include Folders");
    expect(formatCalculationMode("excluded")).toBe("Mode: Exclude Folders");
  });

  it("formats only candidate labels, values, and the applied marker", () => {
    expect(
      formatCalculationRows([
        { kind: "note", days: 60, applied: true },
        {
          kind: "folder",
          folder: "Projects/Active",
          days: 30,
          applied: false,
        },
        {
          kind: "folder",
          folder: "Projects",
          days: 20,
          applied: false,
        },
        { kind: "default", days: 90, applied: false },
      ])
    ).toEqual([
      { position: 1, label: "Note override", value: "60 days", applied: true },
      {
        position: 2,
        label: "Folder interval",
        value: "Projects/Active · 30 days",
        applied: false,
      },
      {
        position: 3,
        label: "Folder interval",
        value: "Projects · 20 days",
        applied: false,
      },
      {
        position: 4,
        label: "Global interval",
        value: "90 days",
        applied: false,
      },
    ]);
  });
});
