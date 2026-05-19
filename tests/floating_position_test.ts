import { describe, expect, it } from "vitest";

import {
  type FloatingPlacement,
  computeFloatingRect,
} from "../src/hooks/useFloatingPosition";

function rectAt(top: number, height = 32, left = 100, width = 200): DOMRect {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON() {
      return {};
    },
  };
}

const VIEWPORT_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 224 },
  anchor: "right",
  coordinateSpace: "viewport",
};

const DOCUMENT_PLACEMENT: FloatingPlacement = {
  width: { kind: "max", maxPx: 280 },
  anchor: "left",
  coordinateSpace: "document",
};

const PHONE_WINDOW = {
  innerWidth: 390,
  innerHeight: 844,
  scrollX: 0,
  scrollY: 0,
};

describe("computeFloatingRect", () => {
  it("places the panel just below the trigger with no keyboard", () => {
    // Trigger sits at y=400 inside a tall viewport. visualViewport
    // matches the layout viewport so no clamping happens.
    const result = computeFloatingRect(
      rectAt(400),
      VIEWPORT_PLACEMENT,
      { offsetTop: 0, height: 844 },
      PHONE_WINDOW,
    );
    expect(result.top).toBe(400 + 32 + 4); // rect.bottom + gap
    // maxHeight uses the room left between the panel top and visible
    // bottom (innerHeight here) minus the viewport margin.
    expect(result.maxHeight).toBe(844 - 436 - 8);
  });

  it("clamps the panel into the visible region when iOS shifts the visual viewport up for the keyboard", () => {
    // iOS scenario: a CategoryCreator input lives inside a panel
    // anchored to a trigger that sits at layout y=500. The soft
    // keyboard pushes visualViewport.offsetTop to 470 so the focused
    // input lands at the top of the visible region. Without clamping
    // the panel would render at layout y=536 — visible — but the
    // focused input at the *top* of the panel ends up at visual y=66.
    // The reporter's screenshot showed it landing above visible top
    // because iOS overshoots; we clamp regardless so the panel never
    // starts above visible top.
    const triggerBottom = 532;
    const result = computeFloatingRect(
      rectAt(500),
      VIEWPORT_PLACEMENT,
      { offsetTop: 470, height: 340 },
      PHONE_WINDOW,
    );
    // Below trigger would be 536, which is inside visible region
    // (470..810). So no clamping needed in this case.
    expect(result.top).toBe(triggerBottom + 4);
  });

  it("pulls the panel down when the trigger is above the visible region (keyboard scrolled it off the top)", () => {
    // Same modal, but iOS shifted visualViewport.offsetTop far enough
    // that the trigger now sits above visible top. The panel would
    // otherwise render off-screen above. Clamp keeps it visible.
    const result = computeFloatingRect(
      rectAt(200),
      VIEWPORT_PLACEMENT,
      { offsetTop: 400, height: 340 },
      PHONE_WINDOW,
    );
    // Clamped to visibleTop + margin = 400 + 8 = 408
    expect(result.top).toBe(408);
    // maxHeight = visibleBottom (740) - top (408) - margin (8) = 324
    expect(result.maxHeight).toBe(324);
  });

  it("returns a usable maxHeight when the keyboard takes most of the space", () => {
    // 200px visible region, trigger near the top. Panel gets a small
    // but workable maxHeight; with `overflow-y: auto` on the panel,
    // its content scrolls instead of overflowing the keyboard.
    const result = computeFloatingRect(
      rectAt(20),
      VIEWPORT_PLACEMENT,
      { offsetTop: 0, height: 200 },
      PHONE_WINDOW,
    );
    expect(result.top).toBe(56); // 20 + 32 + 4
    expect(result.maxHeight).toBeGreaterThanOrEqual(120);
  });

  it("uses document-space scroll offsets for absolute-positioned popovers", () => {
    // Description cell popover scenario: the page has scrolled 1000px
    // down, the trigger is at viewport y=200 (so document y=1200).
    // The popover's `top` should be in document coordinates so it
    // scrolls with the page when iOS moves things around.
    const result = computeFloatingRect(
      rectAt(200),
      DOCUMENT_PLACEMENT,
      { offsetTop: 0, height: 600 },
      { ...PHONE_WINDOW, scrollY: 1000 },
    );
    // top = rect.bottom (232) + gap (4) + scrollY (1000) = 1236
    expect(result.top).toBe(1236);
  });

  it("aligns arrowLeft with the trigger's horizontal centre", () => {
    // Trigger spans x=100..300 (width 200), panel anchors to the left
    // edge of the trigger. Arrow tip should point at the trigger's
    // centre (x=200), which is 100px into the panel.
    const result = computeFloatingRect(
      rectAt(400),
      DOCUMENT_PLACEMENT,
      { offsetTop: 0, height: 844 },
      PHONE_WINDOW,
    );
    expect(result.left).toBe(100);
    expect(result.arrowLeft).toBe(100);
  });

  it("clamps arrowLeft into the panel when the panel got shoved sideways", () => {
    // Narrow trigger at the far-right edge of the viewport. The panel
    // gets shoved left to fit, but the trigger centre sits past the
    // panel's right edge. Arrow must clamp to a sensible tip position
    // inside the panel rather than escape its border radius.
    const result = computeFloatingRect(
      rectAt(400, 32, 380, 10),
      DOCUMENT_PLACEMENT,
      { offsetTop: 0, height: 844 },
      PHONE_WINDOW,
    );
    // Panel gets pushed left to fit within viewport (390 - 8 - 280 = 102).
    expect(result.left).toBe(102);
    // Trigger centre = 385, which sits 283px into the panel — past the
    // 280px panel width, so clamp to width - 14 = 266.
    expect(result.arrowLeft).toBe(result.width - 14);
  });
});
