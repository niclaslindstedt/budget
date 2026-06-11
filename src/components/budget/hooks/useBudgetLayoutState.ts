import { useCallback, useEffect, useState } from "react";

// Per-sheet session-only layout state for BudgetPage — modal flags
// scoped to the page, history / future month reveal counters, the
// per-month collapsed set, and the per-row expanded-transfer set.
// Every slot resets when the active sheet changes so switching budgets
// starts each one with a clean view. None of this persists: closing
// the tab and reopening drops the state, which matches the "quick
// navigation aid" framing in the original inline notes.
//
// Bundled into one hook so a future sessionStorage hydration is a
// single-file change rather than a 7-call-site edit.

export type BudgetLayoutState = {
  // Read-only viewer modal, opened from the Eye button next to the
  // sheet title.
  viewerOpen: boolean;
  setViewerOpen: (next: boolean) => void;
  // Spending-dashboard modal, opened from the title `…` menu.
  spendingOpen: boolean;
  setSpendingOpen: (next: boolean) => void;
  // Duplicate-finder modal, opened from the title `…` menu.
  conflictsOpen: boolean;
  setConflictsOpen: (next: boolean) => void;
  // Metadata-mode walker — steps history entries missing a custom
  // description or type.
  metadataOpen: boolean;
  setMetadataOpen: (next: boolean) => void;
  // Number of extra historical months past the default window the
  // user opted into via "Show more".
  extraHistory: number;
  setExtraHistory: React.Dispatch<React.SetStateAction<number>>;
  // Incremental reveal for future-dated months past the
  // `futureEntryMonths` cutoff.
  extraFuture: number;
  setExtraFuture: React.Dispatch<React.SetStateAction<number>>;
  // Per-month collapsed set. Toggle helper provided so call sites
  // don't have to know the Set wrapping idiom.
  collapsedMonths: Set<string>;
  toggleCollapsed: (monthKey: string) => void;
  // Per-row expanded-transfer-anchor set on balance cells.
  expandedTransferAnchors: Set<string>;
  toggleTransferAnchor: (rowId: string) => void;
};

type Params = {
  // Key that scopes the state. All slots reset when this changes —
  // typically the active sheet id.
  sheetId: string;
  // The `hideTransfers` flag. When it flips off the expansion state
  // has nothing to act on; the hook clears it so re-enabling later
  // starts clean.
  hideTransfers: boolean;
};

export function useBudgetLayoutState({
  sheetId,
  hideTransfers,
}: Params): BudgetLayoutState {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [spendingOpen, setSpendingOpen] = useState(false);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [extraHistory, setExtraHistory] = useState(0);
  const [extraFuture, setExtraFuture] = useState(0);
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedTransferAnchors, setExpandedTransferAnchors] = useState<
    Set<string>
  >(() => new Set());

  useEffect(() => {
    setExtraHistory(0);
    setExtraFuture(0);
    setCollapsedMonths(new Set());
    setExpandedTransferAnchors(new Set());
  }, [sheetId]);

  useEffect(() => {
    if (!hideTransfers) setExpandedTransferAnchors(new Set());
  }, [hideTransfers]);

  const toggleCollapsed = useCallback((monthKey: string) => {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  }, []);

  const toggleTransferAnchor = useCallback((rowId: string) => {
    setExpandedTransferAnchors((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  return {
    viewerOpen,
    setViewerOpen,
    spendingOpen,
    setSpendingOpen,
    conflictsOpen,
    setConflictsOpen,
    metadataOpen,
    setMetadataOpen,
    extraHistory,
    setExtraHistory,
    extraFuture,
    setExtraFuture,
    collapsedMonths,
    toggleCollapsed,
    expandedTransferAnchors,
    toggleTransferAnchor,
  };
}
