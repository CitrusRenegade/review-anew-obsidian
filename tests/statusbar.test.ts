import type { App, TFile } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

const popoverSpy = vi.hoisted(() => ({
  close: vi.fn(),
  construct: vi.fn(),
  load: vi.fn(),
}));

vi.mock("obsidian", () => ({
  setIcon: vi.fn(),
}));

vi.mock("../src/reviewDetails", () => ({
  getReviewDetails: vi.fn(() => ({})),
}));

vi.mock("../src/reviewDetailsPopover", () => ({
  ReviewDetailsPopover: class {
    constructor(...args: unknown[]) {
      popoverSpy.construct(...args);
    }

    close(): void {
      popoverSpy.close();
    }

    load(): void {
      popoverSpy.load();
    }
  },
}));

import {
  formatDueStatus,
  getReviewStatusPresentation,
  ReviewStatusBar,
} from "../src/statusbar";
import type { ReviewDetails } from "../src/reviewDetails";
import type { ReviewSettings } from "../src/settings";

function createStatusBarElement(): HTMLElement {
  return {
    addClass: vi.fn(),
    addEventListener: vi.fn(),
    ownerDocument: {} as Document,
    setAttribute: vi.fn(),
    tabIndex: 0,
  } as unknown as HTMLElement;
}

function createSettings(fontSizeAdjustment: number): ReviewSettings {
  return {
    globalIntervalDays: 45,
    folderFilterMode: "excluded",
    excludedFolders: [],
    includedFolders: [],
    folderIntervals: [],
    showReviewStatus: true,
    showDueCounter: true,
    showRibbonIcon: false,
    reviewDetailsFontSizeAdjustment: fontSizeAdjustment,
    frontmatterIntervalKey: "review_interval",
    frontmatterReviewedKey: "reviewed",
  };
}

describe("ReviewStatusBar review details", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([-2, 0, 2])(
    "passes the %i font adjustment from settings to the popover",
    (fontSizeAdjustment) => {
      const anchorEl = createStatusBarElement();
      const statusBar = new ReviewStatusBar(
        anchorEl,
        {} as App,
        () => createSettings(fontSizeAdjustment),
        vi.fn()
      );

      statusBar.openDetails(
        { extension: "md" } as TFile,
        {} as Document,
        anchorEl
      );

      expect(popoverSpy.construct).toHaveBeenCalledWith(
        expect.anything(),
        anchorEl,
        expect.anything(),
        fontSizeAdjustment,
        expect.any(Function),
        expect.any(Function)
      );
      expect(popoverSpy.load).toHaveBeenCalledOnce();
    }
  );
});

describe("formatDueStatus", () => {
  it("shows the overdue day count instead of a review date", () => {
    expect(formatDueStatus({ kind: "overdue", days: 59 })).toBe(
      "⚠ Overdue · 59d"
    );
  });
});

describe("getReviewStatusPresentation", () => {
  it.each([
    [
      { lastReviewedDay: null, timing: { kind: "never-reviewed", days: null } },
      "⚠ Not reviewed",
    ],
    [
      { lastReviewedDay: "2026-09-10", timing: { kind: "upcoming", days: 2 } },
      "✓ 2026-09-10",
    ],
    [
      { lastReviewedDay: "2026-09-10", timing: { kind: "due-today", days: 0 } },
      "⚠ due today",
    ],
    [
      { lastReviewedDay: "2026-09-10", timing: { kind: "overdue", days: 59 } },
      "⚠ Overdue · 59d",
    ],
  ] as const)("renders %o without relying on caller-side state branches", (state, text) => {
    expect(getReviewStatusPresentation(state as ReviewDetails)).toBe(text);
  });
});
