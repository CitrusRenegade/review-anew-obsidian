import { App, TFile, setIcon } from "obsidian";
import { ReviewSettings } from "./settings";
import {
  DueCounterCache,
  getEffectiveInterval,
} from "./review";
import {
  getReviewDetails,
  type ReviewDetails,
  type ReviewTiming,
} from "./reviewDetails";
import { ReviewDetailsPopover } from "./reviewDetailsPopover";

type DueTiming = Extract<
  ReviewTiming,
  { kind: "overdue" } | { kind: "due-today" }
>;

export function formatDueStatus(timing: DueTiming): string {
  if (timing.kind === "overdue") {
    return `⚠ Overdue · ${timing.days}d`;
  }

  return "⚠ due today";
}

export function getReviewStatusPresentation(details: ReviewDetails): string {
  if (!details.lastReviewedDay) return "⚠ Not reviewed";

  switch (details.timing.kind) {
    case "never-reviewed":
      return "⚠ Not reviewed";
    case "upcoming":
      return `✓ ${details.lastReviewedDay}`;
    case "due-today":
    case "overdue":
      return formatDueStatus(details.timing);
  }
}

export class ReviewStatusBar {
  private el: HTMLElement;
  private app: App;
  private getSettings: () => ReviewSettings;
  private markReviewed: (file: TFile) => Promise<boolean>;
  private currentFile: TFile | null = null;
  private popover: ReviewDetailsPopover | null = null;

  constructor(
    statusBarEl: HTMLElement,
    app: App,
    getSettings: () => ReviewSettings,
    markReviewed: (file: TFile) => Promise<boolean>
  ) {
    this.el = statusBarEl;
    this.app = app;
    this.getSettings = getSettings;
    this.markReviewed = markReviewed;

    this.el.addClass("review-status-bar");
    this.el.setAttribute("role", "button");
    this.el.tabIndex = 0;
    this.el.addEventListener("click", () => this.openDetails());
    this.el.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      this.openDetails();
    });
  }

  update(file: TFile | null, preserveDetails = false): void {
    if (!preserveDetails) this.closeDetails(false);
    this.currentFile = file;
    const settings = this.getSettings();

    if (!settings.showReviewStatus) {
      this.el.addClass("review-hidden");
      return;
    }

    if (!file || file.extension !== "md") {
      this.el.addClass("review-hidden");
      return;
    }

    const interval = getEffectiveInterval(file, this.app, settings);

    if (interval === null) {
      this.el.addClass("review-hidden");
      return;
    }

    this.el.removeClass("review-hidden");
    const details = getReviewDetails(
      file,
      this.app,
      settings,
      new Date()
    );
    if (!details) {
      this.el.addClass("review-hidden");
      return;
    }

    this.el.setText(getReviewStatusPresentation(details));
  }

  openDetails(
    file: TFile | null = this.currentFile,
    popupDocument: Document = this.el.ownerDocument,
    anchorEl: HTMLElement | null = this.el
  ): void {
    if (!file || file.extension !== "md") return;

    const settings = this.getSettings();
    const details = getReviewDetails(
      file,
      this.app,
      settings,
      new Date()
    );
    if (!details) return;

    this.closeDetails(false);
    const popover = new ReviewDetailsPopover(
      popupDocument,
      anchorEl,
      details,
      settings.reviewDetailsFontSizeAdjustment,
      () => this.markReviewed(file),
      () => {
        if (this.popover === popover) this.popover = null;
      }
    );
    this.popover = popover;
    popover.load();
  }

  dispose(): void {
    this.closeDetails(false);
  }

  closeDetails(restoreFocus = true): void {
    this.popover?.close(restoreFocus);
    this.popover = null;
  }
}

export class DueCounterStatusBar {
  private el: HTMLElement;
  private getSettings: () => ReviewSettings;
  private countEl: HTMLElement;
  private cache: DueCounterCache;

  constructor(
    statusBarEl: HTMLElement,
    app: App,
    getSettings: () => ReviewSettings,
    onClick: () => void
  ) {
    this.el = statusBarEl;
    this.getSettings = getSettings;
    this.cache = new DueCounterCache(app, getSettings);

    this.el.addClass("review-due-counter");
    this.el.setAttribute("data-tooltip-position", "top");
    const iconEl = this.el.createSpan({ cls: "review-due-counter-icon" });
    setIcon(iconEl, "clipboard-clock");
    this.countEl = this.el.createSpan({ cls: "review-due-counter-text" });
    this.el.addEventListener("click", onClick);
  }

  update(): void {
    const settings = this.getSettings();
    if (!settings.showDueCounter) {
      this.el.addClass("review-hidden");
      return;
    }

    const n = this.cache.countDue();
    this.countEl.setText(String(n));
    this.el.setAttribute(
      "aria-label",
      `${n} notes due for review across vault. Click to open random one.`
    );
    this.el.toggleClass("review-hidden", n === 0);
  }

  invalidateAll(): void {
    this.cache.invalidateAll();
  }

  invalidateFile(file: TFile): void {
    this.cache.invalidateFile(file);
  }

  removeFile(pathOrFile: string | TFile): void {
    this.cache.removeFile(pathOrFile);
  }

  renameFile(file: TFile, oldPath: string): void {
    this.cache.renameFile(file, oldPath);
  }

}
