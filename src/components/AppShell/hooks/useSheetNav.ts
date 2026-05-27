import { useCallback, useLayoutEffect, useRef } from "react";

import type { Action } from "../../../data/reducer";
import { getMonthKey } from "../../../data/fiscal-month";
import type { Settings, Sheet } from "../../../data/types";
import {
  suppressScrollHide,
  useIsStandalone,
  useSheetSwipe,
} from "../../../hooks";
import { todayIso } from "../../../utils/date";

type Params = {
  sheets: readonly Sheet[];
  activeSheetId: string | null;
  effectiveSettings: Settings;
  dispatch: (action: Action) => void;
};

type Result = {
  // Ref bound to the sheet tabpanel wrapper so the layout effect can
  // play the slide-in animation against the right DOM node.
  sheetPanelRef: React.MutableRefObject<HTMLDivElement | null>;
  // Tap the active sheet's tab → scroll to top. Tap a different tab →
  // dispatch a `selectSheet`.
  onSelectSheet: (id: string) => void;
  // Click on the header title — refresh / current-month-scroll /
  // jump-to-configured-sheet / scroll-to-top depending on the user's
  // `Settings.headerAction` pick.
  onClickHeaderTitle: () => void;
};

// Sheet navigation primitives:
//
//   - `onSelectSheet`: tap the tab,
//   - the horizontal-swipe-anywhere gesture that flips to the
//     previous / next sheet on installed-PWA builds,
//   - the post-commit slide-in animation that plays the new sheet in
//     from the side the user swiped from,
//   - `onClickHeaderTitle`: the configurable click action on the
//     header title (refresh / current-month-scroll / jump-to-sheet /
//     scroll-to-top).
export function useSheetNav({
  sheets,
  activeSheetId,
  effectiveSettings,
  dispatch,
}: Params): Result {
  const onSelectSheet = useCallback(
    (id: string) => {
      if (id === activeSheetId) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      dispatch({ type: "selectSheet", sheetId: id });
    },
    [dispatch, activeSheetId],
  );

  // Horizontal-swipe-anywhere fallback: a swipe across the page on a
  // neutral surface (anything that isn't a swipe-owning row or the
  // BottomBar) switches to the next / previous sheet. Mirrors the
  // BottomBar's Arrow-Left / Right keyboard shortcut with the same
  // wrap-around — see `onTabKey` in `BottomBar.tsx`. Skipped when the
  // user only has one sheet (no neighbour to switch to), and only
  // wired up when running as an installed PWA — in a browser tab the
  // gesture conflicts with the OS-level back / forward swipe.
  const isStandalone = useIsStandalone();
  // Direction captured at swipe time so the post-commit layout effect
  // below can replay it as a slide-in animation. "right" means the
  // new sheet enters from the right edge (user swiped left → next
  // sheet), "left" means it enters from the left (user swiped right
  // → previous sheet). A ref so the captured direction survives the
  // `selectSheet` dispatch but is consumed exactly once per change.
  const slideFromRef = useRef<"left" | "right" | null>(null);
  const onSwipeToAdjacentSheet = useCallback(
    (direction: 1 | -1) => {
      if (sheets.length < 2) return;
      const idx = sheets.findIndex((s) => s.id === activeSheetId);
      if (idx < 0) return;
      const next = (idx + direction + sheets.length) % sheets.length;
      slideFromRef.current = direction === 1 ? "right" : "left";
      onSelectSheet(sheets[next].id);
    },
    [sheets, activeSheetId, onSelectSheet],
  );
  useSheetSwipe(
    () => onSwipeToAdjacentSheet(1),
    () => onSwipeToAdjacentSheet(-1),
    { enabled: isStandalone && sheets.length >= 2 },
  );

  // Slide the tabpanel content in from the side the user swiped from.
  // Runs in `useLayoutEffect` so the off-screen start position is
  // painted before the browser ever shows the new sheet at rest —
  // otherwise the user would see a one-frame flash of the new content
  // at its final position before the animation began. The
  // `data-reduce-motion="true"` guard in `styles.css` zeroes
  // `transition-duration` for every selector, so the transform jumps
  // straight to 0 with no animation when the user has reduce-motion
  // on — no JS check needed here.
  const sheetPanelRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const from = slideFromRef.current;
    slideFromRef.current = null;
    if (!from) return;
    const el = sheetPanelRef.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.transform =
      from === "right" ? "translateX(100%)" : "translateX(-100%)";
    // Force a reflow so the browser commits the off-screen start
    // position before the transition is re-enabled — without this the
    // browser would coalesce the two style writes and skip the
    // animation entirely.
    void el.offsetWidth;
    el.style.transition = "transform 240ms ease-out";
    el.style.transform = "translateX(0)";
    const onEnd = () => {
      el.style.transition = "";
      el.style.transform = "";
      el.removeEventListener("transitionend", onEnd);
    };
    el.addEventListener("transitionend", onEnd);
    return () => el.removeEventListener("transitionend", onEnd);
  }, [activeSheetId]);

  const onClickHeaderTitle = useCallback(() => {
    const action = effectiveSettings.headerAction;
    const reduceMotion =
      document.documentElement.dataset.reduceMotion === "true";
    const scrollBehavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";
    if (action.kind === "refresh") {
      window.location.reload();
      return;
    }
    if (action.kind === "currentMonth") {
      // Look up the month-group wrapper BudgetPage stamps with
      // `data-month-key`. All visible months are always rendered, so
      // the lookup either finds an element to scroll to or — when
      // the active sheet has no month layout (accounts page) or the
      // current month is collapsed under "Show more" — falls through
      // to the same scroll-to-top behaviour as the default action.
      const key = getMonthKey(todayIso(), effectiveSettings.startOfMonth);
      const target = document.querySelector<HTMLElement>(
        `[data-month-key="${CSS.escape(key)}"]`,
      );
      if (target) {
        // `scrollIntoView({ block: "start" })` would land the
        // section's top at viewport 0 — behind the sticky app
        // header — so the month-name H3 (sticky at `var(--app-header-h)`)
        // and the column-headers thead stick on top of the first
        // row, hiding the first days of the month. Offset by the
        // live app-header height so the section's top lands right
        // below it; the H3 and thead then sit at their natural
        // positions instead of overlapping the table body. Measure
        // the app header off the live element — in standalone mode
        // `--app-header-h` resolves to a `calc(... + env(safe-area-inset-top))`
        // string parseFloat can't decode.
        const appHeader =
          document.querySelector<HTMLElement>("[data-app-header]");
        const appH = appHeader?.getBoundingClientRect().height ?? 0;
        const top = target.getBoundingClientRect().top + window.scrollY - appH;
        // Same rationale as BudgetPage's `scrollToToday`: this jump
        // would otherwise read as a fast user scroll-down and slide
        // the BottomBar off-screen mid-tap.
        suppressScrollHide();
        window.scrollTo({
          top: Math.max(0, top),
          behavior: scrollBehavior,
        });
        return;
      }
    } else if (action.kind === "sheet") {
      // Dangling sheet id (sheet deleted since the action was set):
      // skip the dispatch and fall through to scrolling to the top
      // — matches the picker's own fallback so the dropdown and the
      // click handler agree.
      if (sheets.some((s) => s.id === action.sheetId)) {
        if (action.sheetId !== activeSheetId) {
          dispatch({ type: "selectSheet", sheetId: action.sheetId });
        }
      }
    }
    window.scrollTo({ top: 0, behavior: scrollBehavior });
  }, [
    effectiveSettings.headerAction,
    effectiveSettings.startOfMonth,
    sheets,
    activeSheetId,
    dispatch,
  ]);

  return { sheetPanelRef, onSelectSheet, onClickHeaderTitle };
}
