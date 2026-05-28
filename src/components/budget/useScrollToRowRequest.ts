import { useEffect, useMemo } from "react";

import { getMonthKey, previousMonthKey } from "../../data/fiscal-month";
import { suppressScrollHide } from "../../hooks";

// Honour a one-shot scroll-to-row request from the transfer-search
// modal. When the row's month falls outside the default history
// window, grow `extraHistory` enough to include it before scrolling —
// otherwise the row is filtered out of `visibleMonths` and the
// `[data-row-id]` query finds nothing. The pulse animation is driven
// by a CSS attribute on the row element: `[data-row-pulse]` flashes
// the row background once via `--accent` for ~1500ms, then the
// attribute is removed so the same row can pulse again on a future
// pick.
//
// Returns `forceMountMonthKey` — the month BudgetMonthTable should
// force-mount its rows for, bypassing its viewport-proximity gate.
// Set whenever a `scrollToRowRequest` targets this sheet — without
// it the search-jump effect would `querySelector` for a row that
// hasn't been rendered yet (every off-screen month renders only a
// placeholder by default) and the scroll-into-view would silently
// no-op. Cleared back to `null` between requests so the gate
// re-engages once the user has finished navigating.

type ScrollToRowRequest = {
  sheetId: string;
  rowId: string;
  iso: string;
  tick: number;
};

type Params = {
  // One-shot request issued by the transfer-search modal. `null` is
  // the idle state.
  scrollToRowRequest: ScrollToRowRequest | null;
  // Active sheet id — requests for other sheets are ignored (the
  // parent handles the sheet switch first; this hook only acts when
  // the request's `sheetId` matches).
  sheetId: string;
  // Current fiscal month key — anchor for stepping back to the
  // target month when extending `extraHistory`.
  currentMonth: string;
  // First day of the user's fiscal month — used to resolve a row's
  // ISO date to its fiscal month key.
  startOfMonth: number;
  // Default history window size — `extraHistory` only needs to grow
  // when the target row sits past this many months back.
  defaultHistoryMonths: number;
  // Setter for the extra-history reveal. Grown only as far as the
  // target row requires.
  setExtraHistory: React.Dispatch<React.SetStateAction<number>>;
};

export type ScrollToRowRequestController = {
  forceMountMonthKey: string | null;
};

export function useScrollToRowRequest({
  scrollToRowRequest,
  sheetId,
  currentMonth,
  startOfMonth,
  defaultHistoryMonths,
  setExtraHistory,
}: Params): ScrollToRowRequestController {
  useEffect(() => {
    if (!scrollToRowRequest) return;
    if (scrollToRowRequest.sheetId !== sheetId) return;
    const { rowId, iso } = scrollToRowRequest;
    if (iso) {
      const targetKey = getMonthKey(iso, startOfMonth);
      if (/^\d{4}-\d{2}$/.test(targetKey) && targetKey < currentMonth) {
        let cursor = currentMonth;
        let stepsBack = 0;
        while (cursor > targetKey) {
          cursor = previousMonthKey(cursor);
          stepsBack += 1;
        }
        const needed = stepsBack - defaultHistoryMonths;
        if (needed > 0) {
          setExtraHistory((n) => (n < needed ? needed : n));
        }
      }
    }
    let pulsedRow: HTMLElement | null = null;
    const pulseHandle = window.setTimeout(() => {
      const selector = `[data-row-id="${CSS.escape(rowId)}"]`;
      const row = document.querySelector<HTMLElement>(selector);
      if (!row) return;
      const reduceMotion =
        document.documentElement.dataset.reduceMotion === "true";
      // Same rationale as `scrollToToday`: the BottomBar's
      // hide-on-scroll hook would otherwise read this programmatic
      // scroll-into-view as a user fling.
      suppressScrollHide();
      row.scrollIntoView({
        block: "center",
        behavior: reduceMotion ? "auto" : "smooth",
      });
      row.setAttribute("data-row-pulse", "true");
      pulsedRow = row;
    }, 50);
    const clearHandle = window.setTimeout(() => {
      pulsedRow?.removeAttribute("data-row-pulse");
    }, 1700);
    return () => {
      window.clearTimeout(pulseHandle);
      window.clearTimeout(clearHandle);
      pulsedRow?.removeAttribute("data-row-pulse");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToRowRequest?.tick, sheetId]);

  const forceMountMonthKey = useMemo<string | null>(() => {
    if (!scrollToRowRequest) return null;
    if (scrollToRowRequest.sheetId !== sheetId) return null;
    const { iso } = scrollToRowRequest;
    if (!iso) return null;
    const key = getMonthKey(iso, startOfMonth);
    return /^\d{4}-\d{2}$/.test(key) ? key : null;
  }, [scrollToRowRequest, sheetId, startOfMonth]);

  return { forceMountMonthKey };
}
