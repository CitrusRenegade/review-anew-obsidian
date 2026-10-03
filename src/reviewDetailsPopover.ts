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

let nextPopoverTitleId = 0;
const pathSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function pathCharacters(value: string): string[] {
  return Array.from(pathSegmenter.segment(value), (part) => part.segment);
}

// Null means this slot cannot show one complete name character and its marker.
function fitPathText(fullPath: string, fits: (value: string) => boolean): string | null {
  if (fits(fullPath)) return fullPath;
  const slash = fullPath.lastIndexOf("/");
  const basename = fullPath.slice(slash + 1);
  const marker = slash < 0 ? "…" : "…/";
  if (!fits(`${marker}${basename}`)) {
    const nameMarker = slash < 0 ? "…" : "…/…";
    const tail = pathCharacters(basename);
    let low = 0;
    let high = tail.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (fits(`${nameMarker}${tail.slice(tail.length - mid).join("")}`)) low = mid;
      else high = mid - 1;
    }
    return low > 0 ? `${nameMarker}${tail.slice(tail.length - low).join("")}` : null;
  }
  if (slash < 0) return `${marker}${basename}`;
  const prefix = pathCharacters(fullPath.slice(0, slash));
  let low = 0;
  let high = prefix.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(`${prefix.slice(0, mid).join("")}…/${basename}`)) low = mid;
    else high = mid - 1;
  }
  return `${prefix.slice(0, low).join("")}…/${basename}`;
}

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
    const titleId = `review-details-title-${++nextPopoverTitleId}`;
    root.setAttribute("aria-labelledby", titleId);
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
      attr: { id: titleId },
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
    this.registerDomEvent(calculationEl, "toggle", () => this.position());
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
      let appliedParent: HTMLElement = rowEl;
      if (row.folder !== undefined) {
        rowEl.addClass("has-folder-path");
        const group = rowEl.createSpan({ cls: "review-details-folder-value" });
        const pathBox = group.createSpan({ cls: "review-details-folder-path-box" });
        pathBox.createSpan({ cls: "review-details-folder-minimum", text: row.folder, attr: { "aria-hidden": "true" } });
        pathBox.createSpan({
          cls: "review-details-folder-path",
          text: row.folder,
          attr: { title: row.folder, "aria-description": row.folder },
        });
        const suffix = group.createSpan({ cls: "review-details-folder-suffix" });
        appliedParent = suffix;
        suffix.createSpan({
          cls: "review-details-folder-days",
          text: ` · ${row.days} days`,
        });
      } else {
        rowEl.createSpan({
          cls: "review-details-calculation-value",
          text: row.value,
        });
      }
      appliedParent.createSpan({
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
    measureEl.removeAttribute("aria-labelledby");
    measureEl.querySelector(`#${titleId}`)?.removeAttribute("id");
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
      let pendingFrame: number | null = null;
      const schedulePosition = (): void => {
        if (pendingFrame !== null || !this.opened) return;
        pendingFrame = viewWindow.requestAnimationFrame(() => {
          pendingFrame = null;
          if (this.opened) this.position();
        });
      };
      const observer = new viewWindow.ResizeObserver(schedulePosition);
      observer.observe(root);
      observer.observe(measureEl);
      for (const path of Array.from(root.querySelectorAll(".review-details-folder-path"))) {
        observer.observe(path);
      }
      doc.fonts.addEventListener("loadingdone", schedulePosition);
      this.register(() => {
        observer.disconnect();
        doc.fonts.removeEventListener("loadingdone", schedulePosition);
        if (pendingFrame !== null) viewWindow.cancelAnimationFrame(pendingFrame);
      });
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
    ) + 2;
    const width = calculatePopoverWidth({
      viewportWidth: viewWindow.innerWidth,
      minimumRequiredWidth,
    });
    root.style.width = `${width}px`;
    root.toggleClass("is-width-constrained", root.getBoundingClientRect().width < minimumRequiredWidth);
    this.applyPosition(root, anchorRect, viewWindow);
    this.fitFolderPaths(root);
  }

  private fitFolderPaths(root: HTMLElement): void {
    const paths = Array.from(root.querySelectorAll<HTMLElement>(".review-details-folder-path"));
    const measurementPaths = this.measureEl?.querySelectorAll<HTMLElement>(".review-details-folder-path");
    for (const [index, el] of paths.entries()) {
      const fullPath = el.getAttribute("title") ?? "";
      el.textContent = fullPath;
      const textRange = el.ownerDocument.createRange();
      const fits = (value: string): boolean => {
        el.textContent = value;
        textRange.selectNodeContents(el);
        // Integer scrollWidth/clientWidth can round down overflowing text.
        return textRange.getBoundingClientRect().width <= el.getBoundingClientRect().width;
      };
      // Supply intrinsic text, not a guessed em threshold, for CSS flex wrapping.
      const slash = fullPath.lastIndexOf("/");
      const basename = fullPath.slice(slash + 1);
      const tail = pathCharacters(basename).at(-1) ?? "";
      const shortest = `${slash < 0 ? "…" : "…/…"}${tail}`;
      const measureText = (value: string): number => {
        const measurement = measurementPaths?.[index] ?? el;
        measurement.textContent = value;
        textRange.selectNodeContents(measurement);
        return textRange.getBoundingClientRect().width;
      };
      const minimum = el.parentElement?.querySelector(".review-details-folder-minimum");
      if (minimum) minimum.textContent = measureText(fullPath) <= measureText(shortest) ? fullPath : shortest;
      if (measurementPaths?.[index]) measurementPaths[index].textContent = fullPath;
      if (!el.getClientRects().length) continue;
      const fitted = fitPathText(fullPath, fits);
      el.textContent = fitted ?? (fits("…") ? "…" : "");
    }
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
