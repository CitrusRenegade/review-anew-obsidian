import { Component, setIcon } from "obsidian";
import {
  formatCalculationMode,
  formatCalculationRows,
  getReviewTimingPresentation,
  type ReviewDetails,
} from "./reviewDetails";
import {
  calculatePopoverPosition,
  calculatePopoverWidth,
} from "./reviewDetailsPopoverPosition";
import { runReviewDetailsAction } from "./reviewDetailsAction";

export class ReviewDetailsPopover extends Component {
  private popoverEl: HTMLElement | null = null;
  private measureEl: HTMLElement | null = null;
  private confirming = false;
  private opened = false;
  private previouslyFocusedEl: HTMLElement | null = null;
  private restoreFocusOnUnload = true;

  constructor(
    private readonly popupDocument: Document,
    private readonly anchorEl: HTMLElement | null,
    private readonly details: ReviewDetails,
    private readonly fontSizeAdjustment: number,
    private readonly onMarkReviewed: () => Promise<boolean>,
    private readonly onClose: () => void
  ) {
    super();
  }

  onload(): void {
    this.opened = true;
    const doc = this.popupDocument;
    this.previouslyFocusedEl =
      doc.activeElement instanceof doc.defaultView!.HTMLElement
        ? doc.activeElement
        : null;
    const popupWindow = doc.win as Window & { createDiv(): HTMLDivElement };
    const root = popupWindow.createDiv();
    root.addClass("review-details-popover");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Review details");
    root.tabIndex = -1;
    root.style.setProperty(
      "--review-details-font-size-adjustment",
      `${this.fontSizeAdjustment}px`
    );
    this.popoverEl = root;

    const primaryEl = root.createDiv({ cls: "review-details-primary" });
    primaryEl.createDiv({
      cls: "review-details-title",
      text: "Review Anew",
    });
    const headerEl = primaryEl.createDiv({ cls: "review-details-header" });
    const summaryEl = headerEl.createDiv({ cls: "review-details-summary" });
    const timingPresentation = getReviewTimingPresentation(this.details.timing);
    const timingIconEl = summaryEl.createSpan({
      cls: "review-details-timing-icon",
      attr: { "aria-hidden": "true" },
    });
    summaryEl.addClass(`is-${timingPresentation.tone}`);
    setIcon(timingIconEl, "clock-3");
    summaryEl.createDiv({
      cls: "review-details-timing",
      text: timingPresentation.text,
    });
    if (this.details.lastReviewedDay) {
      summaryEl.createDiv({
        cls: "review-details-last-reviewed",
        text: `Last reviewed ${this.details.lastReviewedDay}`,
      });
    }
    const actionsEl = root.createDiv({ cls: "review-details-actions" });
    const markButton = actionsEl.createEl("button", {
      cls: "mod-cta",
      text: "Mark reviewed",
    });
    this.registerDomEvent(markButton, "click", () => {
      void this.confirmReview(markButton);
    });

    const calculationEl = root.createEl("details", {
      cls: "review-details-calculation",
    });
    calculationEl.createEl("summary", { text: "How calculated" });
    calculationEl.createDiv({
      cls: "review-details-mode",
      text: formatCalculationMode(this.details.calculation.mode),
    });

    const rowsEl = calculationEl.createEl("ol", {
      cls: "review-details-calculation-list",
    });
    for (const row of formatCalculationRows(this.details.calculation.candidates)) {
      const rowEl = rowsEl.createEl("li", {
        cls: "review-details-calculation-row",
      });
      rowEl.toggleClass("is-applied", row.applied);
      rowEl.createSpan({
        cls: "review-details-calculation-position",
        text: String(row.position),
        attr: { "aria-hidden": "true" },
      });
      rowEl.createSpan({
        cls: "review-details-calculation-label",
        text: row.label,
      });
      rowEl.createSpan({
        cls: "review-details-calculation-value",
        text: row.value,
      });
      rowEl.createSpan({
        cls: "review-details-calculation-applied",
        text: row.applied ? "✓" : "",
        attr: { "aria-label": row.applied ? "Applied interval" : "" },
      });
    }
    // Measure an independent, unconstrained copy with the calculation expanded.
    // Live children stretch to the assigned width and cannot define intrinsic size.
    const measureEl = root.cloneNode(true) as HTMLElement;
    measureEl.addClass("review-details-popover-measure");
    measureEl.setAttribute("aria-hidden", "true");
    measureEl.inert = true;
    const measureCalculation = measureEl.querySelector("details");
    if (measureCalculation) measureCalculation.open = true;
    this.measureEl = measureEl;

    doc.body.append(root, measureEl);
    this.position();
    root.focus({ preventScroll: true });

    this.registerDomEvent(doc, "pointerdown", (event) => {
      const target = event.target;
      if (!(target instanceof doc.defaultView!.Node)) return;
      if (root.contains(target) || this.anchorEl?.contains(target)) return;
      this.close();
    });
    this.registerDomEvent(doc, "keydown", (event) => {
      if (event.key === "Escape") this.close();
    });

    const viewWindow = doc.defaultView;
    if (viewWindow) {
      this.registerDomEvent(viewWindow, "resize", () => this.position());
      // The status-bar anchor is fixed; editor and popover scrolls do not move it.
    }
  }

  onunload(): void {
    this.popoverEl?.remove();
    this.popoverEl = null;
    this.measureEl?.remove();
    this.measureEl = null;
    if (
      this.restoreFocusOnUnload &&
      this.previouslyFocusedEl?.isConnected
    ) {
      this.previouslyFocusedEl.focus({ preventScroll: true });
    }
    this.previouslyFocusedEl = null;
  }

  close(restoreFocus = true): void {
    if (!this.opened) return;
    this.opened = false;
    this.restoreFocusOnUnload = restoreFocus;
    this.unload();
    this.onClose();
  }

  private async confirmReview(markButton: HTMLButtonElement): Promise<void> {
    if (this.confirming) return;

    this.confirming = true;
    markButton.disabled = true;
    const outcome = await runReviewDetailsAction(
      this.onMarkReviewed,
      () => this.close()
    );
    if (outcome === "close") return;

    this.confirming = false;
    if (markButton.isConnected) {
      markButton.disabled = false;
      markButton.focus({ preventScroll: true });
    }
  }

  private position(): void {
    const root = this.popoverEl;
    const viewWindow = this.popupDocument.defaultView;
    if (!root || !viewWindow) return;

    const anchorRect = this.anchorEl?.getBoundingClientRect() ?? {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
    const minimumRequiredWidth = Math.ceil(
      this.measureEl?.getBoundingClientRect().width ?? 0
    );
    const width = calculatePopoverWidth({
      viewportWidth: viewWindow.innerWidth,
      minimumRequiredWidth,
    });
    root.style.width = `${width}px`;
    root.toggleClass("is-width-constrained", width < minimumRequiredWidth);
    this.applyPosition(root, anchorRect, viewWindow);
  }

  private applyPosition(
    root: HTMLElement,
    anchorRect: DOMRect,
    viewWindow: Window
  ): void {
    const popoverRect = root.getBoundingClientRect();
    const position = calculatePopoverPosition({
      anchor: anchorRect,
      popoverWidth: popoverRect.width,
      viewportWidth: viewWindow.innerWidth,
      viewportHeight: viewWindow.innerHeight,
    });

    root.style.left = `${position.left}px`;
    root.style.bottom = `${position.bottom}px`;
    root.style.setProperty(
      "--review-details-available-height",
      `${Math.max(0, viewWindow.innerHeight - position.bottom - 8)}px`
    );
  }
}

