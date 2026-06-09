import { mintBudgetRow } from "../budget/rows";
import { normaliseDescription } from "../description-normaliser";
import {
  computePrimaryIncomeShiftForHistory,
  indexPrimaryIncomeMerchants,
} from "../fiscal-month";
import { findColumnByType, newId, updateAccountBudget } from "../sheet";
import { findRuleDrivenCandidates } from "../reconciliation";
import { applyImportedSavingBalances } from "../savings/value";
import {
  computeOpeningBalanceFromHistory,
  mergeHistory,
} from "../../storage/banks";
import type { Action } from "../reducer";
import type { CorrectionRow, HistoryEntry, UserData } from "../types";

// Bank-detail back-fill shared by the account and savings branches of
// an import. Fill `bank` / `clearing` / `accountNumber` from what the
// statement carried, but only when the record's field is empty so a
// manual override (or a value set by an earlier import) isn't
// clobbered by a re-import. Both `Account` and `Saving` carry the same
// three optional fields, so the structural `current` type serves both.
function bankDetailPatch(
  current: { bank?: string; clearing?: string; accountNumber?: string },
  source: {
    bankName?: string;
    bankClearing?: string;
    bankAccountNumber?: string;
  },
): { bank?: string; clearing?: string; accountNumber?: string } {
  const patch: {
    bank?: string;
    clearing?: string;
    accountNumber?: string;
  } = {};
  if (!current.bank && source.bankName) patch.bank = source.bankName;
  if (!current.clearing && source.bankClearing)
    patch.clearing = source.bankClearing;
  if (!current.accountNumber && source.bankAccountNumber)
    patch.accountNumber = source.bankAccountNumber;
  return patch;
}

export function reduceAccounts(
  state: UserData,
  action: Action,
): UserData | null {
  if (action.type === "createAccount") {
    return { ...state, accounts: [...state.accounts, action.account] };
  }
  if (action.type === "updateAccount") {
    return {
      ...state,
      accounts: state.accounts.map((a) =>
        a.id === action.accountId ? { ...a, ...action.patch } : a,
      ),
    };
  }
  if (action.type === "deleteAccount") {
    // Cascading detach: clear `accountId` on any AccountBudget that
    // referenced this account so the budgets keep working as
    // free-standing ledgers, and drop any transfers that touched
    // it (a transfer between two known accounts loses its other half
    // once one side is gone, so the cleanest answer is removal).
    // Imported history and import audit rows belong to the account
    // and are dropped alongside it.
    const nextHistory = { ...state.history };
    delete nextHistory[action.accountId];
    const nextHistoryImports = { ...state.historyImports };
    delete nextHistoryImports[action.accountId];
    return {
      ...state,
      accounts: state.accounts.filter((a) => a.id !== action.accountId),
      sheets: state.sheets.map((sheet) => ({
        ...sheet,
        items: sheet.items.map((item) =>
          item.type === "accountBudget" && item.accountId === action.accountId
            ? { ...item, accountId: null }
            : item,
        ),
      })),
      transfers: state.transfers.filter(
        (tx) =>
          tx.fromAccountId !== action.accountId &&
          tx.toAccountId !== action.accountId,
      ),
      history: nextHistory,
      historyImports: nextHistoryImports,
    };
  }
  if (action.type === "cutAccountHistory") {
    const accountId = action.accountId;
    const cutoff = action.cutoffDate;
    // Drop the transfers that touch this account and predate the
    // cutoff, capturing their ids first. A removed transfer must not
    // strand the two bank entries it collapsed: its partner leg lives
    // on the *other* account and would otherwise stay `hidden` with a
    // `collapsedIntoTransferId` pointing at a transfer that no longer
    // exists — invisible in its account and excluded from transfer
    // detection forever. We restore those entries below, mirroring the
    // un-hide that `deleteTransfer` does.
    const removedTransferIds = new Set<string>();
    const transfers = state.transfers.filter((tx) => {
      const drop =
        (tx.fromAccountId === accountId || tx.toAccountId === accountId) &&
        tx.date < cutoff;
      if (drop) removedTransferIds.add(tx.id);
      return !drop;
    });
    // Rebuild history: trim the cut account's pre-cutoff entries, and
    // across every account un-hide + clear the backref on any entry
    // that was collapsed into one of the now-removed transfers.
    const nextHistory: Record<string, HistoryEntry[]> = {};
    for (const [id, entries] of Object.entries(state.history)) {
      const trimmed =
        id === accountId
          ? entries.filter((entry) => entry.date >= cutoff)
          : entries;
      let touched = trimmed.length !== entries.length;
      const restored = trimmed.map((entry) => {
        if (
          entry.collapsedIntoTransferId === undefined ||
          !removedTransferIds.has(entry.collapsedIntoTransferId)
        ) {
          return entry;
        }
        touched = true;
        const next: HistoryEntry = { ...entry };
        delete next.collapsedIntoTransferId;
        delete next.hidden;
        return next;
      });
      nextHistory[id] = touched ? restored : entries;
    }
    const nextHistoryImports = { ...state.historyImports };
    const existingImports = nextHistoryImports[accountId] ?? [];
    nextHistoryImports[accountId] = existingImports.filter(
      (rec) => rec.rangeEnd >= cutoff,
    );
    return {
      ...state,
      history: nextHistory,
      historyImports: nextHistoryImports,
      transfers,
    };
  }
  if (action.type === "importBankHistory") {
    const existing = state.history[action.accountId] ?? [];
    const mergeResult = mergeHistory(existing, action.entries, action.now);
    // Stamp `fiscalMonthShift` on freshly imported entries that match
    // a learned primary-income merchant. Done at import time (rather
    // than at render via `synthesizeHistoryRow`) so the value lives
    // on the persisted entry — that way exports carry the override,
    // and the row-actions menu's "Reset month override" is a real
    // mutation rather than a no-op against a render-time projection.
    const merchants = state.primaryIncomeMerchants;
    const addedIds = mergeResult.addedIds;
    let merged = mergeResult.merged;
    if (merchants.length > 0 && addedIds.size > 0) {
      // Index merchants once outside the per-entry loop so each entry's
      // primary-income lookup is O(1) rather than a linear scan.
      const merchantsByKey = indexPrimaryIncomeMerchants(merchants);
      const stamped = merged.map((entry) => {
        if (!addedIds.has(entry.id)) return entry;
        const key = normaliseDescription(entry.description);
        const shift = computePrimaryIncomeShiftForHistory(
          key,
          entry.date,
          merchantsByKey,
        );
        if (shift === undefined) return entry;
        return { ...entry, fiscalMonthShift: shift };
      });
      merged = stamped;
    }
    const { addedCount, duplicateCount } = mergeResult;
    // Silently apply stored series rules: any newly-imported entry
    // that fits one of the user's prior "Apply to whole series"
    // confirmations cancels the predicted row without going through
    // the modal. The modal only opens for residual unresolved pairs.
    const newlyAdded = merged.filter((e) => addedIds.has(e.id));
    const autoDeletedRowIds = new Set<string>();
    // Series link learned from each silent match, keyed by the matched
    // entry id. Stamped onto the entry below so the imported transaction
    // keeps the recurring-series connection the deleted budget row used
    // to carry — the modal path records the same link via `entryOverrides`.
    const seriesLinkByEntryId = new Map<string, string>();
    if (state.seriesMatchRules.length > 0 && newlyAdded.length > 0) {
      for (const sheet of state.sheets) {
        for (const item of sheet.items) {
          if (item.type !== "accountBudget") continue;
          if (item.accountId !== action.accountId) continue;
          const matches = findRuleDrivenCandidates(
            state.seriesMatchRules,
            newlyAdded,
            item.rows,
            item.columns,
          );
          for (const m of matches) {
            autoDeletedRowIds.add(m.rowId);
            if (m.seriesId && !seriesLinkByEntryId.has(m.historyEntryId)) {
              seriesLinkByEntryId.set(m.historyEntryId, m.seriesId);
            }
          }
        }
      }
    }
    if (seriesLinkByEntryId.size > 0) {
      merged = merged.map((entry) => {
        if (entry.userSeriesId !== undefined) return entry;
        const sid = seriesLinkByEntryId.get(entry.id);
        return sid ? { ...entry, userSeriesId: sid } : entry;
      });
    }
    // Re-anchor the opening balance from the earliest entry in the
    // merged set so the running balance lines up with what the bank
    // says, even if the user later imports an older statement that
    // pushes the earliest date back further.
    const opening = computeOpeningBalanceFromHistory(merged);
    const importRecord = {
      id: newId(),
      importedAt: action.now,
      filename: action.filename,
      bankParserId: action.bankParserId,
      rangeStart: action.entries.reduce(
        (min, e) => (min === "" || e.date < min ? e.date : min),
        "",
      ),
      rangeEnd: action.entries.reduce(
        (max, e) => (e.date > max ? e.date : max),
        "",
      ),
      addedCount,
      duplicateCount,
    };
    // When the import target is a savings account (savings share the
    // `history` id-space with accounts), fold the imported transactions'
    // daily closing balances into its `balanceHistory` so the
    // balance-over-time series is seeded automatically. A no-op for
    // regular accounts — `find` returns undefined and `savings` stays
    // referentially identical to `state.savings`.
    const targetSaving = state.savings?.find((s) => s.id === action.accountId);
    const savings = targetSaving
      ? state.savings.map((s) =>
          s.id === action.accountId
            ? {
                ...s,
                ...bankDetailPatch(s, action),
                balanceHistory: applyImportedSavingBalances(
                  s.balanceHistory,
                  merged,
                  newId,
                ),
              }
            : s,
        )
      : state.savings;
    const priorImports = state.historyImports[action.accountId] ?? [];
    // Sweep balance corrections out of the imported date range: once the
    // bank has authoritative entries for those dates, a manual delta
    // sitting in the same window would just double-count.
    const { rangeStart, rangeEnd } = importRecord;
    const sheets =
      rangeStart === "" && rangeEnd === "" && autoDeletedRowIds.size === 0
        ? state.sheets
        : state.sheets.map((sheet) => {
            let touched = false;
            const items = sheet.items.map((item) => {
              if (item.type !== "accountBudget") return item;
              if (item.accountId !== action.accountId) return item;
              const dateCol = findColumnByType(item.columns, "date");
              const filtered = item.rows.filter((r) => {
                if (autoDeletedRowIds.has(r.id)) return false;
                if (r.kind !== "correction") return true;
                if (rangeStart === "" || rangeEnd === "") return true;
                if (!dateCol) return true;
                const d = r.cells[dateCol.id];
                if (typeof d !== "string") return true;
                return d < rangeStart || d > rangeEnd;
              });
              if (filtered.length === item.rows.length) return item;
              touched = true;
              return { ...item, rows: filtered };
            });
            return touched ? { ...sheet, items } : sheet;
          });
    return {
      ...state,
      accounts: state.accounts.map((a) => {
        if (a.id !== action.accountId) return a;
        const patch: Partial<typeof a> = bankDetailPatch(a, action);
        if (opening !== null) patch.openingBalance = opening;
        return { ...a, ...patch };
      }),
      sheets,
      savings,
      history: { ...state.history, [action.accountId]: merged },
      historyImports: {
        ...state.historyImports,
        [action.accountId]: [...priorImports, importRecord],
      },
    };
  }
  if (action.type === "correctAccountBalance") {
    // Find the first AccountBudget that tracks the target account.
    // When an account is referenced by multiple budgets, the correction
    // lands in the earliest one — `accountBalance` walks all budgets so
    // the displayed total still agrees regardless of where the row
    // physically sits. No-op when nothing matches.
    let target: { sheetId: string; itemId: string } | null = null;
    outer: for (const sheet of state.sheets) {
      for (const item of sheet.items) {
        if (item.type !== "accountBudget") continue;
        if (item.accountId !== action.accountId) continue;
        target = { sheetId: sheet.id, itemId: item.id };
        break outer;
      }
    }
    if (!target) return state;
    // The reducer is pure — no useT() available here. The balance-
    // correction row gets a description in whichever language the
    // user's chosen at the moment they correct the balance.
    const description =
      state.settings.language === "sv"
        ? "Saldokorrigering"
        : "Balance correction";
    const sheets = updateAccountBudget(
      state.sheets,
      target.sheetId,
      target.itemId,
      (item) => {
        const minted = mintBudgetRow(item.columns, {
          date: action.date,
          description,
          amount: action.amount,
        });
        if (!minted) return item;
        // Re-tag the minted UserRow as a CorrectionRow — `mintBudgetRow`
        // doesn't know about correction semantics, and the discriminated
        // union requires `kind` and `isCorrection` to be set together.
        const row: CorrectionRow = {
          ...minted,
          kind: "correction",
          isCorrection: true,
        };
        return { ...item, rows: [...item.rows, row] };
      },
    );
    if (sheets === state.sheets) return state;
    return { ...state, sheets };
  }
  return null;
}
