export interface PopoverAnchorRect {
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PopoverPositionInput {
  anchor: PopoverAnchorRect;
  popoverWidth: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface PopoverPosition {
  left: number;
  bottom: number;
}

export interface PopoverWidthInput {
  viewportWidth: number;
  minimumRequiredWidth?: number;
}

export interface CalculationRowWidthInput {
  positionWidth: number;
  labelWidth: number;
  valueWidth: number;
  appliedWidth: number;
  columnGap: number;
}

export interface PopoverMinimumRequiredWidthInput {
  contentWidth: number;
  horizontalPadding: number;
  horizontalBorder: number;
  verticalScrollbarGutter: number;
}

export interface PopoverStackMinimumWidthInput {
  itemWidths: number[];
}

export interface PopoverContentWidthInput {
  headerContentWidth: number;
  calculationContentWidth: number;
}

export function calculateCalculationRowMinimumWidth({
  positionWidth,
  labelWidth,
  valueWidth,
  appliedWidth,
  columnGap,
}: CalculationRowWidthInput): number {
  return (
    positionWidth +
    labelWidth +
    valueWidth +
    appliedWidth +
    columnGap * 3
  );
}

export function calculatePopoverMinimumRequiredWidth({
  contentWidth,
  horizontalPadding,
  horizontalBorder,
  verticalScrollbarGutter,
}: PopoverMinimumRequiredWidthInput): number {
  return Math.ceil(
    contentWidth +
      horizontalPadding +
      horizontalBorder +
      verticalScrollbarGutter
  );
}

export function calculatePopoverStackMinimumWidth({
  itemWidths,
}: PopoverStackMinimumWidthInput): number {
  return Math.max(0, ...itemWidths);
}

export function calculatePopoverContentWidth({
  headerContentWidth,
  calculationContentWidth,
}: PopoverContentWidthInput): number {
  return Math.max(headerContentWidth, calculationContentWidth);
}

export function calculatePopoverWidth({
  viewportWidth,
  minimumRequiredWidth = 0,
}: PopoverWidthInput): number {
  const margin = 8;
  return Math.max(0, Math.min(minimumRequiredWidth, viewportWidth - margin * 2));
}

export function calculatePopoverPosition({
  anchor,
  popoverWidth,
  viewportWidth,
  viewportHeight,
}: PopoverPositionInput): PopoverPosition {
  const margin = 8;
  const gap = 8;
  const hasVisibleAnchor = anchor.width > 0 && anchor.height > 0;
  const preferredLeft = hasVisibleAnchor
    ? anchor.right - popoverWidth
    : (viewportWidth - popoverWidth) / 2;

  return {
    left: Math.max(
      margin,
      Math.min(preferredLeft, viewportWidth - popoverWidth - margin)
    ),
    bottom: hasVisibleAnchor
      ? Math.max(margin, viewportHeight - anchor.top + gap)
      : margin,
  };
}
