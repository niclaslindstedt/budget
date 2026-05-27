// Shared helpers for the project's touch-driven gestures. The three
// gesture hooks (`useRowSwipe`, `useSheetSwipe`, `usePullToRefresh`)
// diverge enough — React synthetic vs native events, damping,
// preventDefault, async commit, different gating rules — that a
// single "gesture hook" would have to take many opt-in parameters
// without saving much. But the axis-discrimination check and the
// arm-distance constant are genuinely shared, so they live here.

// Minimum dominant-axis travel (px) before a gesture is considered
// armed. Used by every gesture in the project — kept identical so a
// touch that arms a row-swipe will, mid-gesture, also arm the
// sheet-swipe rather than the two disagreeing on whether the
// gesture has committed to an axis.
export const TOUCH_AXIS_ARM_PX = 10;

export type TouchAxis = "horizontal" | "vertical" | "none";

// Decide which axis a touch gesture has committed to, given the
// delta from its start position and the arm threshold. Returns
// `"none"` while the gesture is still small enough to be ambiguous.
export function dominantAxis(
  dx: number,
  dy: number,
  armPx: number = TOUCH_AXIS_ARM_PX,
): TouchAxis {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx > absDy && absDx > armPx) return "horizontal";
  if (absDy > absDx && absDy > armPx) return "vertical";
  return "none";
}
