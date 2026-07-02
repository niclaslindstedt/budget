import { useCallback, useEffect, useRef, type RefObject } from "react";

import { suppressScrollHide } from "../../hooks";

// Scroll today's row to the top of the viewport on first mount and any
// time the user changes `startOfMonth` (which shifts which month
// "current" resolves to). A ref guards against re-running after the
// user has scrolled away on their own — we only auto-scroll for
// sheet+month identity changes, not on every render.
//
// The hook owns the two refs the budget page needs to make this work:
// `scrollTargetRef`, which the parent attaches to the current-month
// container (so the lazy-mount fallback in `scrollToToday` has something
// to scroll into view), and `lastScrolledKey`, which gates the
// auto-scroll effect. It also owns the `findRowNearestToday` and
// `scrollRowToTop` collaborators because they're called from nowhere
// else.

// Find the budget row whose date is closest to today, preferring rows
// inside the current fiscal month so a recurring bill dated a day or
// two into next month doesn't yank the viewport into that next month
// instead of showing the user's in-progress current month. Within the
// chosen month (or, as a last resort, across all mounted months)
// prefer the earliest row dated on or after today so today's position
// sits at the top of the viewport with upcoming entries below; fall
// back to the most recent past row when everything is behind today.
//
// Pick by date and month, not DOM order, so the result stays correct
// under both oldest-first and newest-first transaction sort orders.
function findRowNearestToday(
  section: HTMLElement | null,
  today: string,
  currentMonth: string,
): HTMLElement | null {
  if (!section) return null;
  const candidates = section.querySelectorAll<HTMLElement>("[data-row-date]");
  let inCurrentFuture: HTMLElement | null = null;
  let inCurrentFutureDate: string | null = null;
  let inCurrentPast: HTMLElement | null = null;
  let inCurrentPastDate: string | null = null;
  let anyFuture: HTMLElement | null = null;
  let anyFutureDate: string | null = null;
  let anyPast: HTMLElement | null = null;
  let anyPastDate: string | null = null;
  for (const el of candidates) {
    const d = el.getAttribute("data-row-date");
    if (!d) continue;
    const monthEl = el.closest<HTMLElement>("[data-month-key]");
    const monthKey = monthEl?.getAttribute("data-month-key") ?? null;
    if (monthKey === "undated") continue;
    const inCurrent = monthKey === currentMonth;
    if (d >= today) {
      if (anyFutureDate === null || d < anyFutureDate) {
        anyFuture = el;
        anyFutureDate = d;
      }
      if (
        inCurrent &&
        (inCurrentFutureDate === null || d < inCurrentFutureDate)
      ) {
        inCurrentFuture = el;
        inCurrentFutureDate = d;
      }
    } else {
      if (anyPastDate === null || d > anyPastDate) {
        anyPast = el;
        anyPastDate = d;
      }
      if (inCurrent && (inCurrentPastDate === null || d > inCurrentPastDate)) {
        inCurrentPast = el;
        inCurrentPastDate = d;
      }
    }
  }
  return inCurrentFuture ?? inCurrentPast ?? anyFuture ?? anyPast;
}

// Scroll a row to the top of the viewport, accounting for the three
// stacked sticky bands above it (app header → month header → column
// header thead). `scrollIntoView({ block: "start" })` would land the
// row underneath all three; offsetting by their combined height pulls
// it just below them so today's date is the first thing the user sees.
// Measure every band off its live element instead of parsing the
// `--app-header-h` / `--month-header-h` variables — both resolve to
// `calc(…)` strings (env(safe-area-inset-top) in standalone, rem terms
// that follow `--app-font-scale`) whose literal text parseFloat can't
// decode.
function scrollRowToTop(row: HTMLElement, behavior: ScrollBehavior) {
  const thead = row.closest("table")?.querySelector("thead");
  const theadH = thead?.getBoundingClientRect().height ?? 0;
  const appHeader = document.querySelector<HTMLElement>("[data-app-header]");
  const appH = appHeader?.getBoundingClientRect().height ?? 0;
  const monthHeader = row.closest("section")?.querySelector("h3");
  const monthH = monthHeader?.getBoundingClientRect().height ?? 0;
  const top =
    row.getBoundingClientRect().top + window.scrollY - appH - monthH - theadH;
  window.scrollTo({ top: Math.max(0, top), behavior });
}

type Params = {
  // Sheet id used to key the "have we already auto-scrolled this
  // sheet+month combination?" guard. Switching sheets re-arms the
  // auto-scroll so the next sheet lands on its own today row.
  sheetId: string;
  // ISO date for today. Captured once per component lifetime by the
  // caller so we never re-run mid-day.
  today: string;
  // Current fiscal month key (e.g. `"2026-05"`). Drives the auto-scroll
  // guard so changing `startOfMonth` re-scrolls to the new current
  // month, and is the anchor the row picker prefers when several
  // mounted rows are equidistant from today.
  currentMonth: string;
  // The budget page's scrolling section. Used to query for row
  // elements when refining the scroll target.
  sectionRef: RefObject<HTMLElement | null>;
};

export type ScrollToTodayController = {
  // Ref the parent must attach to the current-month container so the
  // lazy-mount fallback in `scrollToToday` has something to scroll
  // into view when today's row isn't in the DOM yet.
  scrollTargetRef: RefObject<HTMLDivElement | null>;
  scrollToToday: (behavior: ScrollBehavior) => void;
};

export function useScrollToToday({
  sheetId,
  today,
  currentMonth,
  sectionRef,
}: Params): ScrollToTodayController {
  const scrollTargetRef = useRef<HTMLDivElement>(null);
  const lastScrolledKey = useRef<string | null>(null);

  const scrollToToday = useCallback(
    (behavior: ScrollBehavior) => {
      // Tell the BottomBar's hide-on-scroll hook to ignore the scroll
      // events we're about to fire — without this the initial jump to
      // today reads as a fast user scroll-down and the bar slides off
      // for a beat before the polling refine settles. AccountsPage's
      // mount-time scroll lands at the TOP_BAND so it never hit this.
      suppressScrollHide();
      const target = scrollTargetRef.current;
      // First pass: today's row may already be mounted (the user is on
      // or near the current month). Trust it only when its month is
      // current or later AND the current month's own rows are mounted —
      // when the user is scrolled deep into history, BudgetMonthTable's near-
      // viewport gate replaces the current-month row tree with a
      // placeholder, so `findRowNearestToday` returns the latest *past*
      // row (already on-screen) and scrolling to it would be a no-op.
      // When the user is scrolled deep into the future the same gate
      // hides earlier rows, so `findRowNearestToday` returns the first
      // mounted row ≥ today (e.g. a Sept row when today is in May) — not
      // the actual next-row-after-today. In both cases fall through to
      // the container scroll, which mounts the current month and lets
      // refine find the true target on the second pass.
      const refine = (): boolean => {
        const section = sectionRef.current;
        const row = findRowNearestToday(section, today, currentMonth);
        if (!row) return false;
        const rowMonthEl = row.closest<HTMLElement>("[data-month-key]");
        const rowMonth = rowMonthEl?.getAttribute("data-month-key") ?? null;
        if (rowMonth === "undated") return false;
        if (rowMonth !== null && rowMonth < currentMonth) return false;
        if (rowMonth !== null && rowMonth > currentMonth) {
          const currentMonthEl = scrollTargetRef.current;
          if (!currentMonthEl?.querySelector("[data-row-date]")) return false;
        }
        scrollRowToTop(row, behavior);
        return true;
      };
      requestAnimationFrame(() => {
        if (refine()) return;
        // Today's row isn't in the DOM. Scroll to the current-month
        // container (always rendered, even when its rows are lazy-
        // unmounted) — that brings the section under the viewport so
        // BudgetMonthTable's IntersectionObserver flips and the row tree
        // mounts. Refine to today's row once the smooth-scroll tail
        // and lazy-mount commit have landed.
        //
        // `scrollIntoView({ behavior: "smooth" })` has no fixed
        // duration — Chrome interpolates roughly with distance, so a
        // jump from deep-future months to today can run well past a
        // second. A single deadline (we used to wait 450 ms) silently
        // misses long jumps: the current-month container isn't yet in
        // BudgetMonthTable's intersection-observer margin, its rows are
        // still unmounted, `refine` returns false, and the user is
        // parked short of today — they had to click Today several
        // times to step closer. Poll every frame until the row mounts
        // and refine commits, capped at 3 s so we never spin forever.
        if (!target) return;
        target.scrollIntoView({ behavior, block: "start" });
        const deadline = performance.now() + 3000;
        const poll = () => {
          if (refine()) return;
          if (performance.now() > deadline) return;
          requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
      });
    },
    [today, currentMonth, sectionRef],
  );

  useEffect(() => {
    const key = `${sheetId}:${currentMonth}`;
    if (lastScrolledKey.current === key) return;
    lastScrolledKey.current = key;
    scrollToToday("auto");
  }, [sheetId, currentMonth, scrollToToday]);

  return { scrollTargetRef, scrollToToday };
}
