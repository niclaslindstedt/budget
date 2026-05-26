import { findColumnByType, updateHistoryEntry } from "../sheet";
import {
  bumpRenamePattern,
  effectiveDescription,
  recordRename,
} from "../rename-patterns";
import type { Action } from "../reducer";
import type { HistoryEntry, Row, UserData } from "../types";

export function reduceHistory(
  state: UserData,
  action: Action,
): UserData | null {
  if (action.type === "updateHistoryEntry") {
    // Capture the prior entry so the rename-learning hook below can
    // diff `userDescription` against the previously effective text
    // (the user override if one was set, otherwise the raw bank
    // description). Both branches of the chokepoint — the per-entry
    // pen-button modal and the budget-view quick-rename — route
    // through this action, so the hook here covers both surfaces.
    const priorEntry =
      state.history[action.accountId]?.find((e) => e.id === action.entryId) ??
      null;
    const history = updateHistoryEntry(
      state.history,
      action.accountId,
      action.entryId,
      (prev) => {
        const next: HistoryEntry = { ...prev };
        if (action.patch.userDescription !== undefined) {
          // Whitespace-only collapses to "no override" so the user can
          // clear the field through the modal without the synthesized
          // row falling back to an empty label. Otherwise persist the
          // raw value — trimming here would strip a trailing space the
          // moment the user typed it, leaving the controlled textarea
          // looking like the keystroke never landed.
          const raw = action.patch.userDescription;
          if (raw.trim() === "") delete next.userDescription;
          else next.userDescription = raw;
        }
        if (action.patch.userTypeId !== undefined) {
          if (action.patch.userTypeId === null) delete next.userTypeId;
          else next.userTypeId = action.patch.userTypeId;
        }
        if (action.patch.isTransfer !== undefined) {
          // Only persist `true` — absent means "not a transfer".
          if (action.patch.isTransfer) next.isTransfer = true;
          else delete next.isTransfer;
        }
        // Bail if the patch is a no-op so React skips a wasted render.
        if (
          next.userDescription === prev.userDescription &&
          next.userTypeId === prev.userTypeId &&
          next.isTransfer === prev.isTransfer
        ) {
          return prev;
        }
        return next;
      },
    );
    if (history === state.history) return state;
    // Learn from genuine renames: the new `userDescription` is set,
    // non-empty, and differs from whatever the row read as before. A
    // pure type / transfer edit doesn't trip the hook. A blank-out
    // (clear the override) doesn't trip it either — clears would
    // teach the predictor to suggest empty strings on future imports.
    let renamePatterns = state.renamePatterns;
    if (
      priorEntry &&
      action.patch.userDescription !== undefined &&
      action.patch.userDescription.trim() !== ""
    ) {
      const trimmed = action.patch.userDescription.trim();
      const previousText = effectiveDescription(priorEntry);
      if (trimmed !== previousText.trim()) {
        renamePatterns = recordRename(
          renamePatterns,
          action.accountId,
          priorEntry.description,
          trimmed,
          Date.now(),
        );
      }
    }
    if (renamePatterns === state.renamePatterns) {
      return { ...state, history };
    }
    return { ...state, history, renamePatterns };
  }
  if (action.type === "applyImportRenames") {
    if (action.renames.length === 0) return state;
    const existing = state.history[action.accountId];
    if (!existing) return state;
    const renameById = new Map(action.renames.map((r) => [r.entryId, r]));
    let historyTouched = false;
    const patched = existing.map((entry) => {
      const r = renameById.get(entry.id);
      if (!r) return entry;
      const trimmed = r.userDescription.trim();
      if (trimmed === "") return entry;
      if (entry.userDescription === trimmed) return entry;
      historyTouched = true;
      return { ...entry, userDescription: trimmed };
    });
    let renamePatterns = state.renamePatterns;
    const now = Date.now();
    for (const r of action.renames) {
      const entry = existing.find((e) => e.id === r.entryId);
      if (!entry) continue;
      const trimmed = r.userDescription.trim();
      if (trimmed === "") continue;
      // `bumpRenamePattern` falls back to `recordRename` when the
      // accepted text drifted from what the pattern holds (the user
      // edited the suggestion before accepting), so an inline edit
      // becomes a fresh learning event without any branching here.
      renamePatterns = bumpRenamePattern(
        renamePatterns,
        action.accountId,
        entry.description,
        trimmed,
        now,
      );
    }
    if (!historyTouched && renamePatterns === state.renamePatterns) {
      return state;
    }
    return {
      ...state,
      history: historyTouched
        ? { ...state.history, [action.accountId]: patched }
        : state.history,
      renamePatterns,
    };
  }
  if (action.type === "splitHistoryEntry") {
    const history = updateHistoryEntry(
      state.history,
      action.accountId,
      action.entryId,
      (prev) => {
        const next: HistoryEntry = { ...prev };
        // An empty splits array means "clear the split" — drop the field
        // so the synthesizer falls back to the single-row path.
        if (action.splits.length === 0) {
          delete next.splits;
        } else {
          // Defensive copy so the reducer never holds a reference to the
          // dispatcher's payload.
          next.splits = action.splits.map((s) => ({ ...s }));
        }
        return next;
      },
    );
    if (history === state.history) return state;
    return { ...state, history };
  }
  if (action.type === "applyReconciliation") {
    const mergedSet = new Set(action.mergedRowIds);
    const orphanByRow = new Map(action.orphans.map((o) => [o.rowId, o]));
    // Stamp curated description / typeId from each merged row onto the
    // matching history entry as `userDescription` / `userTypeId`.
    // Conflict policy: only fill blanks — prior per-entry edits win.
    const overrideByEntry = new Map(
      action.entryOverrides.map((o) => [o.historyEntryId, o]),
    );
    const existingHistory = state.history[action.accountId] ?? [];
    let historyTouched = false;
    const patchedHistory = existingHistory.map((entry) => {
      const o = overrideByEntry.get(entry.id);
      if (!o) return entry;
      const next: HistoryEntry = { ...entry };
      let changed = false;
      if (
        o.userDescription &&
        (entry.userDescription === undefined ||
          entry.userDescription.trim() === "")
      ) {
        next.userDescription = o.userDescription;
        changed = true;
      }
      if (o.userTypeId && entry.userTypeId === undefined) {
        next.userTypeId = o.userTypeId;
        changed = true;
      }
      if (changed) {
        historyTouched = true;
        return next;
      }
      return entry;
    });
    // Index rows touched by both lists so we can prune sheets in
    // a single pass — modifying / deleting per-row is cheaper than
    // recomputing every sheet's rows from scratch.
    if (mergedSet.size === 0 && orphanByRow.size === 0) {
      if (action.seriesRules.length === 0 && !historyTouched) return state;
      return {
        ...state,
        history: historyTouched
          ? { ...state.history, [action.accountId]: patchedHistory }
          : state.history,
        seriesMatchRules:
          action.seriesRules.length > 0
            ? [...state.seriesMatchRules, ...action.seriesRules]
            : state.seriesMatchRules,
      };
    }
    const sheets = state.sheets.map((sheet) => {
      let touched = false;
      const items = sheet.items.map((item) => {
        if (item.type !== "accountBudget") return item;
        const dateCol = findColumnByType(item.columns, "date");
        let rowsTouched = false;
        const nextRows: Row[] = [];
        for (const row of item.rows) {
          if (mergedSet.has(row.id)) {
            rowsTouched = true;
            continue; // delete
          }
          const orphan = orphanByRow.get(row.id);
          if (orphan?.action === "delete") {
            rowsTouched = true;
            continue;
          }
          if (orphan?.action === "move" && dateCol) {
            rowsTouched = true;
            nextRows.push({
              ...row,
              cells: { ...row.cells, [dateCol.id]: orphan.toDate },
            });
            continue;
          }
          nextRows.push(row);
        }
        if (!rowsTouched) return item;
        touched = true;
        return { ...item, rows: nextRows };
      });
      return touched ? { ...sheet, items } : sheet;
    });
    return {
      ...state,
      sheets,
      history: historyTouched
        ? { ...state.history, [action.accountId]: patchedHistory }
        : state.history,
      seriesMatchRules:
        action.seriesRules.length > 0
          ? [...state.seriesMatchRules, ...action.seriesRules]
          : state.seriesMatchRules,
    };
  }
  return null;
}
