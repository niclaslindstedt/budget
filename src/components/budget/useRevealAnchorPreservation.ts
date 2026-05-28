import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

// Preserve the user's visual position when either reveal toggle
// ("Show 3 future months" / "Show 3 earlier months") steps its cutoff.
// Whichever direction the revealed months land relative to the
// viewport, browser scroll anchoring can't shift past scrollY=0, so
// expansions above the current scroll position leave the user looking
// at the newly-revealed slab instead of the rows they were editing.
// Capture the current-month anchor's top before the state change and
// scroll by the delta after layout so the view stays put — clicking
// either toggle just expands the list. When the revealed months land
// below the anchor (oldest-first future, newest-first earlier) the
// delta is ~0 and the layout effect is a no-op.

type Params = {
  // Current reveal counts. Threaded through so the layout effect
  // re-applies whenever either reveal grows — the click handler bumps
  // one of these and the rendered month list flips on the next render,
  // which is what kicks the layout effect to compensate.
  extraHistory: number;
  extraFuture: number;
  // Page sizes the toggle buttons step each reveal by. Passed in so
  // the parent renders matching labels ("Show 3 earlier months") off
  // the same constants.
  historyPageSize: number;
  futurePageSize: number;
  // Setters from `useBudgetLayoutState`. Called with the updater form
  // to add the page size on each click.
  setExtraHistory: React.Dispatch<React.SetStateAction<number>>;
  setExtraFuture: React.Dispatch<React.SetStateAction<number>>;
  // Ref the parent attaches to the current-month container. Same ref
  // `useScrollToToday` exposes — both hooks anchor against the
  // current-month bounding rect.
  scrollTargetRef: RefObject<HTMLDivElement>;
};

export type RevealAnchorPreservation = {
  onShowMoreHistoryClick: () => void;
  onShowMoreFutureClick: () => void;
};

export function useRevealAnchorPreservation({
  extraHistory,
  extraFuture,
  historyPageSize,
  futurePageSize,
  setExtraHistory,
  setExtraFuture,
  scrollTargetRef,
}: Params): RevealAnchorPreservation {
  const revealAnchorRef = useRef<number | null>(null);
  const captureRevealAnchor = useCallback(() => {
    const anchor = scrollTargetRef.current;
    revealAnchorRef.current = anchor
      ? anchor.getBoundingClientRect().top
      : null;
  }, [scrollTargetRef]);
  const onShowMoreFutureClick = useCallback(() => {
    captureRevealAnchor();
    setExtraFuture((n) => n + futurePageSize);
  }, [captureRevealAnchor, setExtraFuture, futurePageSize]);
  const onShowMoreHistoryClick = useCallback(() => {
    captureRevealAnchor();
    setExtraHistory((n) => n + historyPageSize);
  }, [captureRevealAnchor, setExtraHistory, historyPageSize]);
  useLayoutEffect(() => {
    const before = revealAnchorRef.current;
    if (before === null) return;
    revealAnchorRef.current = null;
    const apply = () => {
      const anchor = scrollTargetRef.current;
      if (!anchor) return;
      const delta = anchor.getBoundingClientRect().top - before;
      if (Math.abs(delta) > 0.5) {
        window.scrollBy({ top: delta, behavior: "auto" });
      }
    };
    apply();
    // Newly-revealed `BudgetMonthTable`s render as a height-estimated
    // placeholder for one frame (`useNearViewport` starts false and
    // only flips to true via its own layout effect), then re-render
    // with the real row tree on the next frame. The placeholder's
    // 40px-per-row estimate rarely matches the real stack, so the
    // anchor shifts a second time after our initial compensation —
    // and a third / fourth if any of the revealed months sit just
    // outside the 1200px near-viewport margin and need the row tree
    // measured before their cached height settles. Re-apply across
    // the next handful of frames until the layout above the anchor
    // stops moving.
    let frames = 0;
    let raf = 0;
    const loop = () => {
      apply();
      frames += 1;
      if (frames < 8) {
        raf = requestAnimationFrame(loop);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [extraFuture, extraHistory, scrollTargetRef]);

  return { onShowMoreHistoryClick, onShowMoreFutureClick };
}
