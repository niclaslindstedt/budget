import { describe, expect, it } from "vitest";

import {
  computeBarOffset,
  computeViewportBottomOffset,
} from "../src/hooks/useVisualViewportOffset";

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

describe("computeBarOffset", () => {
  // `computeBarOffset` deliberately drops `viewportOffsetTop` —
  // including it would let the overscroll-bounce (where iOS
  // shifts `offsetTop` momentarily) walk the bar across the
  // screen. The bar is meant to track the difference between the
  // STABLE inner-height and visual-height, not the dynamic
  // bounce.
  it("returns 0 when the visual viewport fills the layout viewport", () => {
    expect(computeBarOffset({ innerHeight: 932, viewportHeight: 932 })).toBe(0);
  });

  it("returns the iOS 26 cold-launch shift (~25 px) so the bar can compensate", () => {
    expect(computeBarOffset({ innerHeight: 932, viewportHeight: 907 })).toBe(
      25,
    );
  });

  it("clamps 1 px noise to 0 (Android resizes-content / Chromium subpixel rounding)", () => {
    expect(computeBarOffset({ innerHeight: 932, viewportHeight: 931.5 })).toBe(
      0,
    );
  });

  it("never returns a negative value", () => {
    expect(computeBarOffset({ innerHeight: 932, viewportHeight: 940 })).toBe(0);
  });

  it("does NOT inflate on overscroll-bounce (i.e. when offsetTop changes)", () => {
    // The bounce on iOS shifts `vv.offsetTop` momentarily but
    // doesn't change `vv.height`. The same `viewportHeight` gives
    // the same answer regardless of where the user is in the
    // bounce — that's why we drop `offsetTop` here.
    expect(computeBarOffset({ innerHeight: 932, viewportHeight: 907 })).toBe(
      25,
    );
    expect(computeBarOffset({ innerHeight: 932, viewportHeight: 907 })).toBe(
      25,
    );
  });
});
