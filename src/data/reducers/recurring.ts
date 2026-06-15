import { mintBudgetRow } from "../budget/rows";
import { reduceAccountBudget } from "./item";
import { newId, updateAccountBudget } from "../sheet";
import { recordMerchantHints } from "../merchant-hints";
import type { Action } from "../reducer";
import type { Sheet, UserData, UserRow } from "../types";

// Row-minting body for `promoteHistoryToRecurring`. Produces a series
// of N rows from a single (description, amount, typeId, companyId,
// dates) tuple targeting one AccountBudget — the history promote form
// collects nothing richer, so it doesn't need the full
// `ComplexEntryDraft` path the candidate promote reuses.
// (`promoteRecurringCandidate` mints through `addRowsFromComplex`
// instead so the whole draft — tags, transfer flag, estimate band,
// formula — survives.)
function appendSeriesRowsToBudget(
  sheets: readonly Sheet[],
  action: {
    sheetId: string;
    itemId: string;
    dates: string[];
    description: string;
    amount: number;
    typeId: string | null;
    companyId?: string | null;
    amountMin?: number;
    amountMax?: number;
  },
): Sheet[] {
  const seriesId = action.dates.length > 1 ? newId() : undefined;
  return updateAccountBudget(sheets, action.sheetId, action.itemId, (item) => {
    const newRows: UserRow[] = [];
    for (const date of action.dates) {
      const row = mintBudgetRow(item.columns, {
        date,
        description: action.description,
        amount: action.amount,
        typeId: action.typeId,
        companyId: action.companyId ?? null,
        seriesId,
        amountMin: action.amountMin,
        amountMax: action.amountMax,
      });
      if (!row) return item;
      newRows.push(row);
    }
    return { ...item, rows: [...item.rows, ...newRows] };
  });
}

export function reduceRecurring(
  state: UserData,
  action: Action,
): UserData | null {
  if (action.type === "promoteRecurringCandidate") {
    // Mint a fresh series from a recurring-detection candidate through
    // the exact same `addRowsFromComplex` path the user-driven complex
    // entry modal uses, so the resulting series is indistinguishable
    // from one the user typed in by hand — every draft field (company,
    // tags, transfer flag, completed, estimate min/max band, formula)
    // lands on each row, not a hand-picked subset. The candidate's key
    // is pushed onto `recurringDismissals` after row creation so the
    // panel drops it on the next render and future imports won't
    // resurface a series the user has already promoted.
    const { draft } = action;
    const nextSheets = updateAccountBudget(
      state.sheets,
      action.sheetId,
      action.itemId,
      (item) =>
        reduceAccountBudget(item, {
          type: "addRowsFromComplex",
          sheetId: action.sheetId,
          itemId: action.itemId,
          draft,
        }),
    );
    const dismissals = state.recurringDismissals.includes(action.key)
      ? state.recurringDismissals
      : [...state.recurringDismissals, action.key];
    const next = {
      ...state,
      sheets: nextSheets,
      recurringDismissals: dismissals,
    };
    if (draft.typeId === null) return next;
    // Key the merchant hint by the raw bank text (`sourceDescription`)
    // so future imports of the same merchant pick up the suggestion
    // even when the user edited the displayed description. When the
    // edit differs from the bank text, record it as an override so
    // synthesized history rows surface the user's label too.
    const override =
      draft.description.trim() !== action.sourceDescription.trim()
        ? draft.description
        : undefined;
    return recordMerchantHints(
      next,
      [
        {
          description: action.sourceDescription,
          typeId: draft.typeId,
          description_override: override,
          // Fold the company tag into the merchant hint alongside the
          // type so past synthesized rows sharing the merchant key
          // adopt it automatically. `undefined` (no company chosen)
          // preserves any existing company on the hint.
          companyId: draft.companyId ?? undefined,
        },
      ],
      action.now,
    );
  }
  if (action.type === "promoteHistoryToRecurring") {
    // Mint a series like the recurring-candidate promote does, then
    // stamp the merchant hint with the user's chosen typeId and
    // description override so every synthesized history row that
    // normalises to the same key inherits the labels on the next
    // render. The source description (raw bank text) is what we feed
    // to `recordMerchantHints` so the normalised key matches future
    // imports too.
    let next = {
      ...state,
      sheets: appendSeriesRowsToBudget(state.sheets, action),
    };
    // The hint must carry typeId (`recordMerchantHints` derives the
    // category through `type.categoryId`), so skip the recording when
    // the user declined to set a type. The new rows still got minted;
    // the user can backfill labels later by promoting again with one.
    if (action.typeId === null) return next;
    // Honour the "apply to historic matches" opt-out from the modal:
    // when the user unchecked it, mint the future series but skip the
    // merchant-hint stamp so past entries keep their bank text.
    if (!action.applyToHistoric) return next;
    // Stamp `hintIgnored: true` on each excluded entry so the
    // synthesizer skips the merchant-hint step for them while the
    // remaining matches inherit the overlay. The hint itself is still
    // recorded (below) so future imports of matching entries get the
    // label automatically — only the user-picked past entries opt out.
    if (
      action.accountId !== null &&
      action.excludedHistoryEntryIds.length > 0
    ) {
      const excluded = new Set(action.excludedHistoryEntryIds);
      const entries = next.history[action.accountId] ?? [];
      let changed = false;
      const updated = entries.map((e) => {
        if (!excluded.has(e.id)) return e;
        if (e.hintIgnored) return e;
        changed = true;
        return { ...e, hintIgnored: true };
      });
      if (changed) {
        next = {
          ...next,
          history: { ...next.history, [action.accountId]: updated },
        };
      }
    }
    return recordMerchantHints(
      next,
      [
        {
          description: action.sourceDescription,
          typeId: action.typeId,
          description_override: action.description,
          // Fold the company tag into the merchant hint alongside the
          // type so past synthesized rows sharing the merchant key
          // adopt it automatically. `undefined` (the field absent on
          // the action) preserves any existing company on the hint.
          companyId: action.companyId ?? undefined,
        },
      ],
      action.now,
    );
  }
  if (action.type === "dismissRecurringCandidate") {
    if (state.recurringDismissals.includes(action.key)) return state;
    return {
      ...state,
      recurringDismissals: [...state.recurringDismissals, action.key],
    };
  }
  if (action.type === "dismissRecurringCandidates") {
    const existing = new Set(state.recurringDismissals);
    const additions = action.keys.filter((k) => !existing.has(k));
    if (additions.length === 0) return state;
    return {
      ...state,
      recurringDismissals: [...state.recurringDismissals, ...additions],
    };
  }
  if (action.type === "clearRecurringDismissals") {
    if (state.recurringDismissals.length === 0) return state;
    return { ...state, recurringDismissals: [] };
  }
  return null;
}
