import { describe, expect, it } from "vitest";

import { computeKeyboardInset } from "../src/hooks/useVirtualKeyboardInset";

describe("computeKeyboardInset", () => {
  it("returns 0 when the visual viewport fills the layout viewport", () => {
    expect(
      computeKeyboardInset({
        innerHeight: 900,
        viewportHeight: 900,
        viewportOffsetTop: 0,
      }),
    ).toBe(0);
  });

  it("returns the keyboard height when the visual viewport has shrunk", () => {
    // iOS Safari: keyboard takes 320px at the bottom.
    expect(
      computeKeyboardInset({
        innerHeight: 900,
        viewportHeight: 580,
        viewportOffsetTop: 0,
      }),
    ).toBe(320);
  });

  it("accounts for the viewport offset when the page scrolls under the keyboard", () => {
    // iOS shifts the visual viewport up by `offsetTop` to fit the
    // focused input above the keyboard — the bottom-occluded area is
    // innerHeight - height - offsetTop.
    expect(
      computeKeyboardInset({
        innerHeight: 900,
        viewportHeight: 580,
        viewportOffsetTop: 100,
      }),
    ).toBe(220);
  });

  it("clamps 1px noise to 0 (Android with interactive-widget=resizes-content)", () => {
    expect(
      computeKeyboardInset({
        innerHeight: 900,
        viewportHeight: 899.5,
        viewportOffsetTop: 0,
      }),
    ).toBe(0);
  });

  it("never returns a negative value", () => {
    // Defensive: visual viewport reports larger than inner height
    // (shouldn't happen, but guard against rounding noise).
    expect(
      computeKeyboardInset({
        innerHeight: 900,
        viewportHeight: 920,
        viewportOffsetTop: 0,
      }),
    ).toBe(0);
  });
});
