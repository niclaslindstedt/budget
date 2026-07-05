import type { Action } from "../reducer";
import type { UserData } from "../types";
import { MAX_FAVORITE_SHEETS } from "../sheet";
import { reorderById } from "../../utils/reorder";

export function reduceSheets(state: UserData, action: Action): UserData | null {
  if (action.type === "reorderSheets") {
    const sheets = reorderById(state.sheets, action.fromId, action.toId);
    // `reorderById` returns the same reference on a no-op move, so this
    // also short-circuits a redundant history entry.
    if (sheets === state.sheets) return state;
    return { ...state, sheets: [...sheets] };
  }
  if (action.type === "renameSheet") {
    return {
      ...state,
      sheets: state.sheets.map((sheet) =>
        sheet.id === action.sheetId ? { ...sheet, name: action.name } : sheet,
      ),
    };
  }
  if (action.type === "addSheet") {
    // New sheets become the active sheet so the user lands on the
    // empty ledger they just created instead of having to chase down
    // its tab.
    return {
      ...state,
      sheets: [...state.sheets, action.sheet],
      activeSheetId: action.sheet.id,
    };
  }
  if (action.type === "updateSheetMeta") {
    return {
      ...state,
      sheets: state.sheets.map((sheet) =>
        sheet.id === action.sheetId ? { ...sheet, ...action.meta } : sheet,
      ),
    };
  }
  if (action.type === "toggleSheetFavorite") {
    const target = state.sheets.find((s) => s.id === action.sheetId);
    if (!target) return state;
    // Turning a favorite on is a no-op once the cap is reached; turning
    // one off is always allowed. Keep `favorite` absent (not `false`)
    // when off, matching the optional-field convention.
    if (!target.favorite) {
      const favoriteCount = state.sheets.filter((s) => s.favorite).length;
      if (favoriteCount >= MAX_FAVORITE_SHEETS) return state;
    }
    return {
      ...state,
      sheets: state.sheets.map((sheet) => {
        if (sheet.id !== action.sheetId) return sheet;
        if (sheet.favorite) {
          const { favorite: _drop, ...rest } = sheet;
          void _drop;
          return rest;
        }
        return { ...sheet, favorite: true };
      }),
    };
  }
  if (action.type === "deleteSheet") {
    // Guard against deleting the only sheet — the UI never offers it
    // but the reducer enforces it too so an externally dispatched
    // action can't strand the user with an empty workspace.
    if (state.sheets.length <= 1) return state;
    // Cascade: a scenarios sheet whose base budget was the deleted
    // sheet falls back to "no base" (the page re-opens its base picker)
    // rather than carrying a dangling reference. Deltas keep their row
    // ids — they are only meaningful against the old base, but the
    // validator tolerates them and `setScenariosBaseSheet` clears them
    // on the next rebind.
    const nextSheets = state.sheets
      .filter((s) => s.id !== action.sheetId)
      .map((sheet) => {
        if (
          !sheet.items.some(
            (item) =>
              item.type === "scenariosView" &&
              item.baseSheetId === action.sheetId,
          )
        )
          return sheet;
        return {
          ...sheet,
          items: sheet.items.map((item) =>
            item.type === "scenariosView" && item.baseSheetId === action.sheetId
              ? { ...item, baseSheetId: null }
              : item,
          ),
        };
      });
    const nextActive =
      state.activeSheetId === action.sheetId
        ? nextSheets[0].id
        : state.activeSheetId;
    return { ...state, sheets: nextSheets, activeSheetId: nextActive };
  }
  if (action.type === "selectSheet") {
    if (!state.sheets.some((s) => s.id === action.sheetId)) return state;
    return { ...state, activeSheetId: action.sheetId };
  }
  if (action.type === "setItemAccount") {
    // Binds an account onto the sheet item that carries one — the
    // per-account budget ledger (`accountBudget`) or the salary sheet's
    // pay-account pointer (`salaryView`). Both flavours expose
    // `accountId`; other item types ignore the action.
    let changed = false;
    const sheets = state.sheets.map((sheet) => {
      if (sheet.id !== action.sheetId) return sheet;
      let itemChanged = false;
      const items = sheet.items.map((item) => {
        if (item.id !== action.itemId) return item;
        if (item.type !== "accountBudget" && item.type !== "salaryView")
          return item;
        if (item.accountId === action.accountId) return item;
        itemChanged = true;
        return { ...item, accountId: action.accountId };
      });
      if (!itemChanged) return sheet;
      changed = true;
      return { ...sheet, items };
    });
    return changed ? { ...state, sheets } : state;
  }
  if (action.type === "setSalaryTaxProfile") {
    // Binds (or clears) the tax profile on a salary sheet's `salaryView`
    // item. `null` clears it; other item types ignore the action. Same
    // map-and-guard shape as `setItemAccount`, writing `taxProfileId`.
    let changed = false;
    const sheets = state.sheets.map((sheet) => {
      if (sheet.id !== action.sheetId) return sheet;
      let itemChanged = false;
      const items = sheet.items.map((item) => {
        if (item.id !== action.itemId || item.type !== "salaryView")
          return item;
        const current = item.taxProfileId;
        const next = action.taxProfileId ?? undefined;
        if (current === next) return item;
        itemChanged = true;
        if (next === undefined) {
          const { taxProfileId: _drop, ...rest } = item;
          void _drop;
          return rest;
        }
        return { ...item, taxProfileId: next };
      });
      if (!itemChanged) return sheet;
      changed = true;
      return { ...sheet, items };
    });
    return changed ? { ...state, sheets } : state;
  }
  if (action.type === "setBudgetIgnoredForStats") {
    // Toggle the whole-budget "ignore for statistics" flag on a budget
    // sheet's `accountBudget` item. Same map-and-guard shape as
    // `setSalaryTaxProfile`; keeps `ignoredForStats` absent (not `false`)
    // when off, matching the optional-field convention.
    let changed = false;
    const sheets = state.sheets.map((sheet) => {
      if (sheet.id !== action.sheetId) return sheet;
      let itemChanged = false;
      const items = sheet.items.map((item) => {
        if (item.id !== action.itemId || item.type !== "accountBudget")
          return item;
        const current = item.ignoredForStats === true;
        if (current === action.ignoredForStats) return item;
        itemChanged = true;
        if (!action.ignoredForStats) {
          const { ignoredForStats: _drop, ...rest } = item;
          void _drop;
          return rest;
        }
        return { ...item, ignoredForStats: true };
      });
      if (!itemChanged) return sheet;
      changed = true;
      return { ...sheet, items };
    });
    return changed ? { ...state, sheets } : state;
  }
  return null;
}
