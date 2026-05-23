import { describe, expect, it } from "vitest";

import { computeViewportBottomOffset } from "../src/hooks/useVisualViewportOffset";

describe("computeViewportBottomOffset", () => {
  it("returns 0 when the visual viewport fills the layout viewport", () => {
    expect(
      computeViewportBottomOffset({
        innerHeight: 932,
        viewportHeight: 932,
        viewportOffsetTop: 0,
      }),
    ).toBe(0);
  });

  it("returns the clipped strip height on iOS 26 PWA with visualViewport regression", () => {
    // Repro of WebKit #297779: layout viewport reports the full
    // screen, visual viewport clipped by ~200px (home indicator +
    // Quick Actions accessory band the OS doesn't release until the
    // user drags).
    expect(
      computeViewportBottomOffset({
        innerHeight: 932,
        viewportHeight: 732,
        viewportOffsetTop: 0,
      }),
    ).toBe(200);
  });

  it("subtracts the visual viewport's offsetTop", () => {
    // When the page scrolls under a focused input on iOS, the
    // visual viewport shifts up by `offsetTop`. The remaining
    // bottom gap is innerHeight - height - offsetTop.
    expect(
      computeViewportBottomOffset({
        innerHeight: 932,
        viewportHeight: 600,
        viewportOffsetTop: 100,
      }),
    ).toBe(232);
  });

  it("clamps 1px noise to 0 (Android with interactive-widget=resizes-content)", () => {
    expect(
      computeViewportBottomOffset({
        innerHeight: 932,
        viewportHeight: 931.5,
        viewportOffsetTop: 0,
      }),
    ).toBe(0);
  });

  it("never returns a negative value", () => {
    expect(
      computeViewportBottomOffset({
        innerHeight: 932,
        viewportHeight: 940,
        viewportOffsetTop: 0,
      }),
    ).toBe(0);
  });
});
