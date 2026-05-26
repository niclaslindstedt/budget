import { normaliseDescription } from "../description-normaliser";
import {
  computePrimaryIncomeShiftForHistory,
  updateHistoryEntry,
} from "../sheet";
import type { Action } from "../reducer";
import type { HistoryEntry, PrimaryIncomeMerchant, UserData } from "../types";

// Sub-reducer for the bank-imported side of the primary-income flag.
// Mirrors `reduceSeriesMetadata` for user-authored series but keys
// off the normalised bank description so a salary that lives in
// history (the more realistic case) gets the same set-and-forget
// treatment.
//
// Three actions share this surface:
//
// - `setHistoryEntryPrimaryIncome` — the headline toggle. Flips the
//   primary-income status for the matching merchant key, stamps /
//   clears `fiscalMonthShift` on every existing history entry whose
//   normalised description matches the key, and records the key +
//   anchor day in `UserData.primaryIncomeMerchants` so future imports
//   inherit the rule.
//
// - `setHistoryEntryFiscalMonthShift` — manual one-off override.
//   Sets / clears `fiscalMonthShift` on a single entry without
//   touching the merchant array.
//
// - `removePrimaryIncomeMerchant` — drops one merchant rule outright,
//   clearing the auto-stamped shift on every entry that matched it.
//   Useful from the settings surface for cleaning up after a job
//   switch leaves a stale pattern around.
export function reduceHistoryPrimaryIncome(
  state: UserData,
  action: Action,
): UserData | null {
  if (action.type === "setHistoryEntryFiscalMonthShift") {
    const history = updateHistoryEntry(
      state.history,
      action.accountId,
      action.entryId,
      (prev) => {
        if (action.shift === null) {
          if (prev.fiscalMonthShift === undefined) return prev;
          const next = { ...prev };
          delete next.fiscalMonthShift;
          return next;
        }
        if (prev.fiscalMonthShift === action.shift) return prev;
        return { ...prev, fiscalMonthShift: action.shift };
      },
    );
    if (history === state.history) return state;
    return { ...state, history };
  }

  if (action.type === "setHistoryEntryPrimaryIncome") {
    const entry = state.history[action.accountId]?.find(
      (e) => e.id === action.entryId,
    );
    if (!entry) return state;
    const key = normaliseDescription(entry.description);
    if (key === "") return state;
    if (action.isPrimaryIncome) {
      const day = clampDay(action.anchorDayOfMonth);
      if (day === null) return state;
      const merchants = upsertMerchant(state.primaryIncomeMerchants, {
        key,
        anchorDayOfMonth: day,
      });
      const history = applyMerchantToHistory(state.history, key, day);
      if (
        merchants === state.primaryIncomeMerchants &&
        history === state.history
      ) {
        return state;
      }
      return { ...state, history, primaryIncomeMerchants: merchants };
    }
    // Toggling off — remove the merchant and clear the shift on every
    // entry that matched it.
    const merchants = state.primaryIncomeMerchants.filter((m) => m.key !== key);
    if (merchants.length === state.primaryIncomeMerchants.length) {
      // The merchant wasn't actually flagged. Still clear the shift on
      // this single entry in case it carried a one-off override that
      // the user means to wipe with this toggle.
      const history = updateHistoryEntry(
        state.history,
        action.accountId,
        action.entryId,
        (prev) => {
          if (prev.fiscalMonthShift === undefined) return prev;
          const next = { ...prev };
          delete next.fiscalMonthShift;
          return next;
        },
      );
      return history === state.history ? state : { ...state, history };
    }
    const history = clearShiftForKey(state.history, key);
    return { ...state, history, primaryIncomeMerchants: merchants };
  }

  if (action.type === "removePrimaryIncomeMerchant") {
    const merchants = state.primaryIncomeMerchants.filter(
      (m) => m.key !== action.key,
    );
    if (merchants.length === state.primaryIncomeMerchants.length) return state;
    const history = clearShiftForKey(state.history, action.key);
    return { ...state, history, primaryIncomeMerchants: merchants };
  }

  return null;
}

function clampDay(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const day = Math.trunc(value);
  if (day < 1 || day > 31) return null;
  return day;
}

function upsertMerchant(
  list: readonly PrimaryIncomeMerchant[],
  entry: PrimaryIncomeMerchant,
): PrimaryIncomeMerchant[] {
  const idx = list.findIndex((m) => m.key === entry.key);
  if (idx < 0) return [...list, entry];
  const current = list[idx];
  if (current.anchorDayOfMonth === entry.anchorDayOfMonth) {
    return list as PrimaryIncomeMerchant[];
  }
  const next = [...list];
  next[idx] = entry;
  return next;
}

// Stamp `fiscalMonthShift = 1` on every history entry whose
// normalised description matches `key` and whose day-of-month is
// earlier than `anchor`. Entries that don't qualify (anchor day or
// later, or different merchant) have any prior auto-stamped shift
// cleared so re-flagging a merchant with a new anchor day picks up
// the new threshold cleanly. Manual overrides (set via the row
// actions menu / "Push to ..." entries) are indistinguishable on
// disk; we accept that re-flagging clears them.
function applyMerchantToHistory(
  history: Readonly<Record<string, HistoryEntry[]>>,
  key: string,
  anchorDayOfMonth: number,
): Record<string, HistoryEntry[]> {
  let changed = false;
  const next: Record<string, HistoryEntry[]> = {};
  for (const [accountId, entries] of Object.entries(history)) {
    let entriesChanged = false;
    const replaced = entries.map((entry) => {
      const entryKey = normaliseDescription(entry.description);
      if (entryKey !== key) return entry;
      const expected = computePrimaryIncomeShiftForHistory(key, entry.date, [
        { key, anchorDayOfMonth },
      ]);
      if (expected === entry.fiscalMonthShift) return entry;
      const updated = { ...entry };
      if (expected === undefined) delete updated.fiscalMonthShift;
      else updated.fiscalMonthShift = expected;
      entriesChanged = true;
      return updated;
    });
    if (entriesChanged) {
      changed = true;
      next[accountId] = replaced;
    } else {
      next[accountId] = entries;
    }
  }
  return changed ? next : (history as Record<string, HistoryEntry[]>);
}

function clearShiftForKey(
  history: Readonly<Record<string, HistoryEntry[]>>,
  key: string,
): Record<string, HistoryEntry[]> {
  let changed = false;
  const next: Record<string, HistoryEntry[]> = {};
  for (const [accountId, entries] of Object.entries(history)) {
    let entriesChanged = false;
    const replaced = entries.map((entry) => {
      if (entry.fiscalMonthShift === undefined) return entry;
      const entryKey = normaliseDescription(entry.description);
      if (entryKey !== key) return entry;
      const updated = { ...entry };
      delete updated.fiscalMonthShift;
      entriesChanged = true;
      return updated;
    });
    if (entriesChanged) {
      changed = true;
      next[accountId] = replaced;
    } else {
      next[accountId] = entries;
    }
  }
  return changed ? next : (history as Record<string, HistoryEntry[]>);
}
