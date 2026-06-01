import type { Action } from "../reducer";
import type { UserData } from "../types";

export function reduceSheets(state: UserData, action: Action): UserData | null {
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
  if (action.type === "deleteSheet") {
    // Guard against deleting the only sheet — the UI never offers it
    // but the reducer enforces it too so an externally dispatched
    // action can't strand the user with an empty workspace.
    if (state.sheets.length <= 1) return state;
    const nextSheets = state.sheets.filter((s) => s.id !== action.sheetId);
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
  return null;
}
