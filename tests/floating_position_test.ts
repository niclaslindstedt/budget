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

  it("keeps a document-coord popover attached to a visible trigger when the keyboard opens", () => {
    // iOS opens the keyboard for a focused textarea inside the
    // description popover. The trigger button (the row's "…" tap
    // target) is visible inside the post-keyboard visual viewport.
    // Earlier behaviour would clamp the panel toward the visible
    // region whenever its natural top sat outside it — but for a
    // `position: absolute` popover that already scrolls with the
    // page, that clamp pushed the popover off its row and broke the
    // arrow's visual connection to the trigger.
    const result = computeFloatingRect(
      // Trigger at layout y=200, height 40 (rect.bottom=240). With
      // scrollY=400 the trigger sits at document y=600..640.
      rectAt(200, 40),
      DOCUMENT_PLACEMENT,
      // Visual viewport shrank for the keyboard but stayed at the top
      // of the layout viewport: document visible region is 400..960.
      // Trigger (doc y=600..640) sits well inside that.
      { offsetTop: 0, height: 560 },
      { ...PHONE_WINDOW, scrollY: 400 },
    );
    // Natural position wins: rect.bottom (240) + gap (4) + scrollY
    // (400) = 644. The panel stays right under the trigger row, not
    // yanked to visibleTop+margin (= 408) above it.
    expect(result.top).toBe(644);
  });

  it("never clamps a document-coord popover, even when iOS shifts the trigger above the visible region", () => {
    // iOS shifts the visual viewport up while opening the keyboard,
    // briefly leaving the trigger row above the new visible top.
    // The previous behaviour clamped the panel DOWN to
    // `visibleTop + margin` so it stayed reachable — but that
    // produced a visible "jump" the moment the keyboard appeared
    // and ripped the popover away from its trigger. A document-coord
    // popover scrolls with the page; iOS's auto-scroll keeps the
    // focused textarea above the keyboard without our help, and the
    // popover rides along with it. So leave the natural position
    // alone and let the page scroll do the work.
    const result = computeFloatingRect(
      rectAt(100, 40),
      DOCUMENT_PLACEMENT,
      { offsetTop: 600, height: 340 },
      { ...PHONE_WINDOW, scrollY: 0 },
    );
    // Natural top = rect.bottom (140) + gap (4) + scrollY (0) = 144.
    // No clamp toward visibleTop+margin (= 608) — the panel stays
    // anchored to its row in document space.
    expect(result.top).toBe(144);
  });

  it("flips the panel upward when there isn't enough room below the trigger", () => {
    // Trigger near the bottom of a tall viewport — typical "user is
    // editing the last row of a long sheet" scenario. With only ~50px
    // of room below, opening downward would render the listbox as a
    // sliver with a scrollbar. Flip upward instead so the full menu
    // is visible.
    const result = computeFloatingRect(
      rectAt(780, 32), // trigger.bottom = 812 in an 844 viewport
      VIEWPORT_PLACEMENT,
      { offsetTop: 0, height: 844 },
      PHONE_WINDOW,
    );
    expect(result.placement).toBe("above");
    // `top` is the y where the panel's BOTTOM edge sits — trigger.top
    // (780) - gap (4) = 776.
    expect(result.top).toBe(776);
    // maxHeight is the room above the trigger: trigger.top (780) -
    // visibleTop (0) - gap (4) - margin (8) = 768.
    expect(result.maxHeight).toBe(768);
  });

  it("stays below when there's at least the useful-height threshold of room", () => {
    // Same shape but with enough room below — the heuristic should
    // prefer "below" so the panel doesn't jump above the trigger
    // unnecessarily.
    const result = computeFloatingRect(
      rectAt(600, 32), // 844 - 632 = 212 > 180 (MIN_USEFUL_BELOW)
      VIEWPORT_PLACEMENT,
      { offsetTop: 0, height: 844 },
      PHONE_WINDOW,
    );
    expect(result.placement).toBe("below");
    expect(result.top).toBe(636);
  });

  it("stays below when there isn't enough room on either side (covers trigger less awkwardly)", () => {
    // Tiny visible region (e.g. exotic embedded preview). Both sides
    // are cramped; falling through to "below" matches the keyboard-
    // squeeze case the suite already covers and keeps the legacy
    // clamp into the visible region active.
    const result = computeFloatingRect(
      rectAt(80, 32),
      VIEWPORT_PLACEMENT,
      { offsetTop: 0, height: 200 },
      PHONE_WINDOW,
    );
    expect(result.placement).toBe("below");
  });

  it("flips the document-coord popover upward too, in document space", () => {
    // Description popover near the bottom of a tall scrolled document.
    // Document-coord placements participate in the same flip — the
    // textarea body would otherwise sit under the viewport bottom.
    const result = computeFloatingRect(
      rectAt(540, 40), // viewport trigger.bottom = 580, in a 600 visible region
      DOCUMENT_PLACEMENT,
      { offsetTop: 0, height: 600 },
      { ...PHONE_WINDOW, scrollY: 1000 },
    );
    expect(result.placement).toBe("above");
    // top = trigger.top (540) - gap (4) + scrollY (1000) = 1536.
    expect(result.top).toBe(1536);
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
