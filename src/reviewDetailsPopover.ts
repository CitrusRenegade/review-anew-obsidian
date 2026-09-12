import { Component, setIcon } from "obsidian";
import {
  formatCalculationMode,
  formatCalculationRows,
  getReviewTimingPresentation,
  type ReviewDetails,
} from "./reviewDetails";
import {
  calculateCalculationRowMinimumWidth,
  calculatePopoverContentWidth,
  calculatePopoverMinimumRequiredWidth,
  calculatePopoverPosition,
  calculatePopoverStackMinimumWidth,
  calculatePopoverWidth,
} from "./reviewDetailsPopoverPosition";
import { runReviewDetailsAction } from "./reviewDetailsAction";

export class ReviewDetailsPopover extends Component {
  private popoverEl: HTMLElement | null = null;
  private calculationEl: HTMLDetailsElement | null = null;
  private calculationMeasureEl: HTMLDetailsElement | null = null;
  private primaryEl: HTMLElement | null = null;
  private markButtonEl: HTMLButtonElement | null = null;
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
    this.primaryEl = primaryEl;
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
    this.markButtonEl = markButton;
    this.registerDomEvent(markButton, "click", () => {
      void this.confirmReview(markButton);
    });

    const calculationEl = root.createEl("details", {
      cls: "review-details-calculation",
    });
    this.calculationEl = calculationEl;
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
    const calculationMeasureEl = calculationEl.cloneNode(
      true
    ) as HTMLDetailsElement;
    calculationMeasureEl.open = true;
    calculationMeasureEl.addClass("review-details-calculation-measure");
    calculationMeasureEl.setAttribute("aria-hidden", "true");
    root.append(calculationMeasureEl);
    this.calculationMeasureEl = calculationMeasureEl;

    doc.body.append(root);
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
      this.registerDomEvent(viewWindow, "scroll", () => this.position(), true);
    }
  }

  onunload(): void {
    this.popoverEl?.remove();
    this.popoverEl = null;
    this.calculationEl = null;
    this.calculationMeasureEl = null;
    this.primaryEl = null;
    this.markButtonEl = null;
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
    const parsedRootFontSize = Number.parseFloat(
      viewWindow.getComputedStyle(this.popupDocument.documentElement).fontSize
    );
    const rootFontSize =
      Number.isFinite(parsedRootFontSize) && parsedRootFontSize > 0
        ? parsedRootFontSize + this.fontSizeAdjustment
        : 16 + this.fontSizeAdjustment;
    root.removeClass("is-width-constrained");
    const rootStyle = viewWindow.getComputedStyle(root);
    const primaryWidth = this.primaryEl?.scrollWidth ?? 0;
    const buttonWidth = this.markButtonEl?.getBoundingClientRect().width ?? 0;
    const horizontalPadding =
      Number.parseFloat(rootStyle.paddingLeft) +
      Number.parseFloat(rootStyle.paddingRight);
    const horizontalBorder =
      Number.parseFloat(rootStyle.borderLeftWidth) +
      Number.parseFloat(rootStyle.borderRightWidth);
    const headerContentWidth = calculatePopoverStackMinimumWidth({
      itemWidths: [primaryWidth, buttonWidth],
    });
    const calculationContentWidth = this.calculateCalculationContentWidth(
      viewWindow,
      rootFontSize
    );
    const contentWidth = calculatePopoverContentWidth({
      headerContentWidth,
      calculationContentWidth
    });
    const minimumRequiredWidthWithoutScrollbar =
      calculatePopoverMinimumRequiredWidth({
        contentWidth,
        horizontalPadding,
        horizontalBorder,
        verticalScrollbarGutter: 0,
      });
    const preliminaryWidth = calculatePopoverWidth({
      viewportWidth: viewWindow.innerWidth,
      minimumRequiredWidth: minimumRequiredWidthWithoutScrollbar,
    });
    root.style.width = `${preliminaryWidth}px`;
    root.toggleClass(
      "is-width-constrained",
      preliminaryWidth < minimumRequiredWidthWithoutScrollbar
    );
    this.applyPosition(root, anchorRect, viewWindow);

    const verticalScrollbarGutter = Math.max(
      0,
      root.offsetWidth - root.clientWidth - horizontalBorder
    );
    const minimumRequiredWidth = calculatePopoverMinimumRequiredWidth({
      contentWidth,
      horizontalPadding,
      horizontalBorder,
      verticalScrollbarGutter,
    });
    const finalWidth = calculatePopoverWidth({
      viewportWidth: viewWindow.innerWidth,
      minimumRequiredWidth,
    });
    root.style.width = `${finalWidth}px`;
    root.toggleClass("is-width-constrained", finalWidth < minimumRequiredWidth);
    this.applyPosition(root, anchorRect, viewWindow);
  }

  private calculateCalculationContentWidth(
    viewWindow: Window,
    rootFontSize: number
  ): number {
    const calculationEl = this.calculationMeasureEl;
    if (!calculationEl) return 0;
    const calculationSummary = calculationEl.querySelector<HTMLElement>(
      "summary"
    );
    const mode = calculationEl.querySelector<HTMLElement>(
      ".review-details-mode"
    );
    let calculationContentWidth = Math.max(
      calculationSummary?.scrollWidth ?? 0,
      mode?.scrollWidth ?? 0
    );
    const rows = Array.from(
      calculationEl.querySelectorAll<HTMLElement>(
        ".review-details-calculation-row"
      )
    );
    for (const row of rows) {
      const label = row.querySelector<HTMLElement>(
        ".review-details-calculation-label"
      );
      const value = row.querySelector<HTMLElement>(
        ".review-details-calculation-value"
      );
      const applied = row.querySelector<HTMLElement>(
        ".review-details-calculation-applied"
      );
      const columnGap = Number.parseFloat(
        viewWindow.getComputedStyle(row).columnGap
      );
      calculationContentWidth = Math.max(
        calculationContentWidth,
        calculateCalculationRowMinimumWidth({
          positionWidth: rootFontSize,
          labelWidth: label?.scrollWidth ?? 0,
          valueWidth: value?.scrollWidth ?? 0,
          appliedWidth: applied?.scrollWidth ?? 0,
          columnGap,
        })
      );
    }
    return calculationContentWidth;
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
    root.style.maxHeight = `${Math.max(0, viewWindow.innerHeight - position.bottom - 8)}px`;
  }
}
