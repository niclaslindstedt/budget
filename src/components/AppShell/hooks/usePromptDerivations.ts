import { useMemo } from "react";

import type {
  HistoryMatchPreview,
  HistoryPromotePrefill,
} from "../../budget/BudgetEditEntryModal";
import type { SplitSubmission } from "../../budget/BudgetSplitEntryModal";
import { getLastSeriesDate } from "../../../data/budget/rows";
import { normaliseDescription } from "../../../data/description-normaliser";
import { findColumnByType } from "../../../data/sheet";
import type {
  AccountBudget,
  Column,
  HistoryEntry,
  Row,
  UserData,
} from "../../../data/types";
import type {
  DeletePrompt,
  EditPrompt,
  EditRowPrompt,
  SplitPrompt,
} from "../types";

type HistoryEditPrompt = { entryId: string };

// Pure props derived from the currently-open prompt + the active
// budget item. Every entry is a `useMemo` so re-renders triggered by
// unrelated state (toast queue, achievement watcher) don't recompute
// the bank-history scan or the merchant-hint lookup. Keeping the
// derivations in one place leaves AppShell's body focused on dispatch
// wiring and JSX.

type Params = {
  // Prompts whose payloads drive the derivations below.
  editPrompt: EditPrompt | null;
  editRowPrompt: EditRowPrompt | null;
  splitPrompt: SplitPrompt | null;
  deletePrompt: DeletePrompt | null;
  historyEditPrompt: HistoryEditPrompt | null;
  // Active budget item — column / row state + account binding.
  activeItem: AccountBudget;
  // Cached date-column lookup. Passed in (rather than re-derived) so
  // it can be shared with the bulk-selection hook.
  dateCol: Column | undefined;
  // Full UserData reference — read for `history` and `merchantHints`.
  data: UserData;
};

export type DerivedPromptProps = {
  // Last ISO date in the series — defaults the "until" picker in
  // BudgetEditEntryModal, BudgetEditEntryFullModal, and BudgetDeleteRecurringDialog.
  editLastSeriesDate: string | null;
  editRowLastSeriesDate: string | null;
  deleteLastSeriesDate: string | null;
  // Every row in the active edit-row prompt's series, fed to the
  // modal so the affected-rows preview can render under the scope
  // picker.
  editRowSeriesRows: readonly Row[];
  // Bank entry behind a history-row split prompt — used to pre-fill
  // existing splits and to source the authoritative amount /
  // description (the individual split-row cells may be partial).
  splitHistoryEntry: HistoryEntry | null;
  splitInitialSplits: SplitSubmission[] | undefined;
  splitAuthoritativeAmount: number | undefined;
  splitAuthoritativeDescription: string | undefined;
  // Bank entry behind a per-entry history edit prompt — looked up
  // fresh so a concurrent delete / re-import doesn't strand a stale
  // snapshot.
  historyEditEntry: HistoryEntry | null;
  // Pre-fill values for the history-row promote modal: the matching
  // merchant hint's last-used description / type / company, or null
  // when no hint exists.
  editHistoryHintPrefill: HistoryPromotePrefill | null;
  // Bank-history entries on the active account that share the
  // promote-target row's normalised description. Skipped for series
  // rows (the modal is in edit-series mode then, not promote).
  editHistoryMatches: HistoryMatchPreview[] | null;
};

export function usePromptDerivations({
  editPrompt,
  editRowPrompt,
  splitPrompt,
  deletePrompt,
  historyEditPrompt,
  activeItem,
  dateCol,
  data,
}: Params): DerivedPromptProps {
  const editLastSeriesDate = useMemo<string | null>(() => {
    const row = editPrompt?.row;
    if (!row?.seriesId || !dateCol) return null;
    return getLastSeriesDate(activeItem.rows, row.seriesId, dateCol.id);
  }, [editPrompt, activeItem.rows, dateCol]);

  const editRowLastSeriesDate = useMemo<string | null>(() => {
    const row = editRowPrompt?.row;
    if (!row?.seriesId || !dateCol) return null;
    return getLastSeriesDate(activeItem.rows, row.seriesId, dateCol.id);
  }, [editRowPrompt, activeItem.rows, dateCol]);

  const deleteLastSeriesDate = useMemo<string | null>(() => {
    const row = deletePrompt?.row;
    if (!row?.seriesId || !dateCol) return null;
    return getLastSeriesDate(activeItem.rows, row.seriesId, dateCol.id);
  }, [deletePrompt, activeItem.rows, dateCol]);

  const editRowSeriesRows = useMemo<readonly Row[]>(() => {
    const row = editRowPrompt?.row;
    if (!row?.seriesId) return [];
    return activeItem.rows.filter((r) => r.seriesId === row.seriesId);
  }, [editRowPrompt, activeItem.rows]);

  const splitHistoryEntry = useMemo<HistoryEntry | null>(() => {
    const row = splitPrompt?.row;
    if (!row?.historyEntryId || !activeItem.accountId) return null;
    const entries = data.history[activeItem.accountId] ?? [];
    return entries.find((e) => e.id === row.historyEntryId) ?? null;
  }, [splitPrompt, activeItem.accountId, data.history]);

  const splitInitialSplits = useMemo<SplitSubmission[] | undefined>(() => {
    if (!splitHistoryEntry?.splits || splitHistoryEntry.splits.length === 0) {
      return undefined;
    }
    return splitHistoryEntry.splits.map((s) => ({
      description: s.description,
      amount: s.amount,
      typeId: s.typeId ?? null,
    }));
  }, [splitHistoryEntry]);

  const historyEditEntry = useMemo<HistoryEntry | null>(() => {
    if (!historyEditPrompt) return null;
    const accountId = activeItem.accountId;
    if (!accountId) return null;
    const entries = data.history[accountId] ?? [];
    return entries.find((e) => e.id === historyEditPrompt.entryId) ?? null;
  }, [historyEditPrompt, activeItem.accountId, data.history]);

  const editHistoryHintPrefill = useMemo<HistoryPromotePrefill | null>(() => {
    const row = editPrompt?.row;
    if (!row?.historyEntryId) return null;
    const accountId = activeItem.accountId;
    if (!accountId) return null;
    const entries = data.history[accountId] ?? [];
    const entry = entries.find((e) => e.id === row.historyEntryId);
    if (!entry) return null;
    const key = normaliseDescription(entry.description);
    const hint = data.merchantHints[key];
    if (!hint) return null;
    return {
      description: hint.description ?? null,
      typeId: hint.typeId ?? null,
      companyId: hint.companyId ?? null,
    };
  }, [editPrompt, activeItem.accountId, data.history, data.merchantHints]);

  // For history-row promotions the bucket key comes from the source
  // entry's raw bank text (the synthesized row's description cell may
  // already carry a user override that doesn't normalise back to the
  // bank text). For regular row promotions the key comes from the
  // description cell directly.
  const editHistoryMatches = useMemo<HistoryMatchPreview[] | null>(() => {
    const row = editPrompt?.row;
    if (!row || row.seriesId) return null;
    const accountId = activeItem.accountId;
    if (!accountId) return null;
    const entries = data.history[accountId] ?? [];
    let targetKey: string;
    if (row.historyEntryId) {
      const entry = entries.find((e) => e.id === row.historyEntryId);
      if (!entry) return null;
      targetKey = normaliseDescription(entry.description);
    } else {
      const descId = findColumnByType(activeItem.columns, "description")?.id;
      if (!descId) return null;
      const rawDesc = row.cells[descId];
      if (typeof rawDesc !== "string" || rawDesc.trim() === "") return null;
      targetKey = normaliseDescription(rawDesc);
    }
    if (targetKey.length < 3) return null;
    const matches: HistoryMatchPreview[] = [];
    for (const e of entries) {
      if (e.hidden) continue;
      if (e.collapsedIntoTransferId) continue;
      if (normaliseDescription(e.description) !== targetKey) continue;
      const preview: HistoryMatchPreview = {
        id: e.id,
        date: e.date,
        description: e.description,
        amount: e.amount,
      };
      if (e.hintIgnored) preview.hintIgnored = true;
      matches.push(preview);
    }
    matches.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return matches;
  }, [editPrompt, activeItem.accountId, activeItem.columns, data.history]);

  return {
    editLastSeriesDate,
    editRowLastSeriesDate,
    deleteLastSeriesDate,
    editRowSeriesRows,
    splitHistoryEntry,
    splitInitialSplits,
    splitAuthoritativeAmount: splitHistoryEntry?.amount,
    splitAuthoritativeDescription: splitHistoryEntry?.description,
    historyEditEntry,
    editHistoryHintPrefill,
    editHistoryMatches,
  };
}
