import { describe, expect, it } from "vitest";
import {
  calculateCalculationRowMinimumWidth,
  calculatePopoverContentWidth,
  calculatePopoverMinimumRequiredWidth,
  calculatePopoverPosition,
  calculatePopoverStackMinimumWidth,
  calculatePopoverWidth,
} from "../src/reviewDetailsPopoverPosition";

describe("calculateCalculationRowMinimumWidth", () => {
  it("uses the measured tracks instead of reserving space for short labels", () => {
    expect(
      calculateCalculationRowMinimumWidth({
      positionWidth: 16,
      labelWidth: 100,
      valueWidth: 220,
      appliedWidth: 10,
      columnGap: 8,
      })
    ).toBe(370);
  });
});

describe("calculatePopoverMinimumRequiredWidth", () => {
  it("reserves the vertical scrollbar gutter for one-line content", () => {
    expect(
      calculatePopoverMinimumRequiredWidth({
        contentWidth: 352,
        horizontalPadding: 28,
        horizontalBorder: 2,
        verticalScrollbarGutter: 15,
      })
    ).toBe(397);
  });
});

describe("calculatePopoverStackMinimumWidth", () => {
  it("uses the widest stacked header item without reserving a horizontal action gap", () => {
    expect(
      calculatePopoverStackMinimumWidth({
        itemWidths: [112, 234, 176, 168],
      })
    ).toBe(234);
  });
});

describe("calculatePopoverContentWidth", () => {
  it("reserves the full calculation width before the disclosure is expanded", () => {
    expect(
      calculatePopoverContentWidth({
        headerContentWidth: 234,
        calculationContentWidth: 360,
      })
    ).toBe(360);
  });
});

describe("calculatePopoverWidth", () => {
  it("uses the measured content width without adding empty space", () => {
    expect(
      calculatePopoverWidth({
        viewportWidth: 1440,
        minimumRequiredWidth: 178,
      })
    ).toBe(178);
  });

  it("expands to the measured one-line header width until the viewport constrains it", () => {
    expect(
      calculatePopoverWidth({
        viewportWidth: 1440,
        minimumRequiredWidth: 390,
      })
    ).toBe(390);
    expect(
      calculatePopoverWidth({
        viewportWidth: 360,
        minimumRequiredWidth: 390,
      })
    ).toBe(344);
  });
});

describe("calculatePopoverPosition", () => {
  it("anchors the popup by its bottom edge so expanding content grows upward", () => {
    expect(
      calculatePopoverPosition({
        anchor: {
          top: 1000,
          right: 1400,
          bottom: 1020,
          width: 20,
          height: 20,
        },
        popoverWidth: 360,
        viewportWidth: 1440,
        viewportHeight: 1080,
      })
    ).toEqual({ left: 1040, bottom: 88 });
  });

  it("uses a centered bottom position when the status item is not visible", () => {
    expect(
      calculatePopoverPosition({
        anchor: {
          top: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
        },
        popoverWidth: 360,
        viewportWidth: 1440,
        viewportHeight: 1080,
      })
    ).toEqual({ left: 540, bottom: 8 });
  });
});
