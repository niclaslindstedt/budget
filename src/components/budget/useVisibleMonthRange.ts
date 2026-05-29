import { useEffect, useMemo, useState, type RefObject } from "react";

import { unlock } from "../../data/achievements";

// Track which rendered month containers are currently intersecting the
// viewport, then derive a floating "Today" button direction from that.
// The IntersectionObserver tracks `data-month-key` elements inside the
// budget section so the parent doesn't have to instrument every month
// container separately; the `todayButtonDirection` memo turns that
// observation into the direction the user needs to scroll to reach
// the current fiscal month.

type Params = {
  // The budget page's scrolling section. Queried for the month
  // containers (`[data-month-key]`) to observe.
  sectionRef: RefObject<HTMLElement | null>;
  // Month keys currently rendered. The observer rebuilds whenever the
  // list changes — without this newly-revealed months wouldn't be
  // observed until the user scrolled past them.
  visibleMonths: readonly string[];
  // Current fiscal month key — the anchor the button surfaces against.
  currentMonth: string;
  // User's transaction sort order. Flips which direction the button
  // points: past sits above current in oldest-first and below it in
  // newest-first, and future is the mirror.
  transactionSortOrder: "newestFirst" | "oldestFirst";
};

export type VisibleMonthRange = {
  todayButtonDirection: "down" | "up" | null;
  showTodayButton: boolean;
};

export function useVisibleMonthRange({
  sectionRef,
  visibleMonths,
  currentMonth,
  transactionSortOrder,
}: Params): VisibleMonthRange {
  // Stable join key avoids re-creating the observer on every keystroke
  // (visibleMonths is memoized against monthGroups, which changes on
  // every cell edit — the array reference flips even when its
  // contents don't). Sentinel month keys like "undated" are ignored.
  const [visibleMonthRange, setVisibleMonthRange] = useState<{
    oldest: string | null;
    newest: string | null;
  }>({ oldest: null, newest: null });
  const visibleMonthsKey = visibleMonths.join(",");
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const monthEls = section.querySelectorAll<HTMLElement>("[data-month-key]");
    if (monthEls.length === 0) return;
    const intersecting = new Set<string>();
    const recompute = () => {
      let newest: string | null = null;
      let oldest: string | null = null;
      for (const key of intersecting) {
        if (key === "undated") continue;
        if (!newest || key > newest) newest = key;
        if (!oldest || key < oldest) oldest = key;
      }
      setVisibleMonthRange((prev) =>
        prev.newest === newest && prev.oldest === oldest
          ? prev
          : { oldest, newest },
      );
    };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const key = entry.target.getAttribute("data-month-key");
        if (!key) continue;
        if (entry.isIntersecting) intersecting.add(key);
        else intersecting.delete(key);
      }
      recompute();
    });
    for (const el of monthEls) observer.observe(el);
    return () => observer.disconnect();
  }, [visibleMonthsKey, sectionRef]);

  // Surface the floating "Today" button whenever the current fiscal
  // month is scrolled off-screen — in either direction. Anchoring to
  // the current fiscal month (not today's calendar date) keeps the
  // button hidden while the user is editing the active budget, even
  // late in the month when today's row sits near the bottom of the
  // current month. The pill's direction tracks the scroll the user
  // needs to make to reach current, which depends on where current
  // sits in the DOM relative to the visible range — and that flips
  // with `transactionSortOrder`. Oldest-first stacks past above
  // current and future below; newest-first inverts both.
  const todayButtonDirection = useMemo<"down" | "up" | null>(() => {
    const { newest, oldest } = visibleMonthRange;
    if (!newest || !oldest) return null;
    const newestFirst = transactionSortOrder === "newestFirst";
    if (newest < currentMonth) {
      // Visible range is entirely in the past. Past sits above
      // current in oldest-first (scroll down) and below current in
      // newest-first (scroll up).
      return newestFirst ? "up" : "down";
    }
    if (oldest > currentMonth) {
      // Visible range is entirely in the future. Future sits below
      // current in oldest-first (scroll up) and above current in
      // newest-first (scroll down).
      return newestFirst ? "down" : "up";
    }
    return null;
  }, [visibleMonthRange, currentMonth, transactionSortOrder]);
  const showTodayButton = todayButtonDirection !== null;

  // Time Traveller — "discover the Today pill by scrolling away from
  // this month". Scrolling the current fiscal month off-screen surfaces
  // the pill; the first time that happens is the discovery. The bus
  // dedupes, so keying the effect on the boolean fires the unlock once
  // when it flips true and never again.
  useEffect(() => {
    if (showTodayButton) unlock("timeTraveller");
  }, [showTodayButton]);

  return { todayButtonDirection, showTodayButton };
}
