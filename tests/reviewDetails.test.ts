import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import {
  formatCalculationMode,
  formatCalculationRows,
  getReviewTimingPresentation,
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
      details && getReviewTimingPresentation(details.timing).text
    ).toBe("Due in 99999982 days");
  });

  it("identifies a note without a reviewed day as never reviewed", () => {
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

describe("getReviewTimingPresentation", () => {
  it.each([
    [{ kind: "never-reviewed", days: null }, "Not reviewed", "never-reviewed"],
    [{ kind: "due-today", days: 0 }, "Due today", "due"],
    [{ kind: "overdue", days: 2 }, "Overdue · 2 days", "overdue"],
    [{ kind: "upcoming", days: 2 }, "Due in 2 days", "reviewed"],
  ] as const)("maps %o to its stable text and semantic tone", (timing, text, tone) => {
    expect(getReviewTimingPresentation(timing)).toEqual({ text, tone });
  });
});

describe("review details presentation", () => {
  it("maps every review timing state to one presentation and visual tone", () => {
    expect(getReviewTimingPresentation({ kind: "never-reviewed", days: null })).toEqual({
      text: "Not reviewed",
      tone: "never-reviewed",
    });
    expect(getReviewTimingPresentation({ kind: "due-today", days: 0 })).toEqual({
      text: "Due today",
      tone: "due",
    });
    expect(getReviewTimingPresentation({ kind: "overdue", days: 2 })).toEqual({
      text: "Overdue · 2 days",
      tone: "overdue",
    });
    expect(getReviewTimingPresentation({ kind: "upcoming", days: 1 })).toEqual({
      text: "Due in 1 day",
      tone: "reviewed",
    });
  });

  it("puts the overdue label before the overdue duration", () => {
    expect(
      getReviewTimingPresentation({ kind: "overdue", days: 20 }).text
    ).toBe("Overdue · 20 days");
  });

  it("shows only the remaining days for an upcoming review", () => {
    expect(
      getReviewTimingPresentation({ kind: "upcoming", days: 12 }).text
    ).toBe("Due in 12 days");
  });

  it("labels a note without a review date as not reviewed", () => {
    expect(
      getReviewTimingPresentation({ kind: "never-reviewed", days: null }).text
    ).toBe("Not reviewed");
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
