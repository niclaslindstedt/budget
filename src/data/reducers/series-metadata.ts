import { computePrimaryIncomeShift, findColumnByType } from "../sheet";
import type { Action } from "../reducer";
import type { Row, SeriesMetadata, UserData } from "../types";

// Sub-reducer for `UserData.seriesMetadata` — the per-`seriesId` toggle
// map that today carries the "primary income" flag plus the configured
// anchor day-of-month. Touching the flag re-runs
// `computePrimaryIncomeShift` over every existing row in the series so
// the user sees the cascade apply (or unapply) the moment they toggle.
export function reduceSeriesMetadata(
  state: UserData,
  action: Action,
): UserData | null {
  if (action.type !== "setSeriesPrimaryIncome") return null;
  const { seriesId, isPrimaryIncome, anchorDayOfMonth } = action;
  const current = state.seriesMetadata[seriesId] ?? {};
  const next: SeriesMetadata = {};
  if (isPrimaryIncome) next.isPrimaryIncome = true;
  if (
    isPrimaryIncome &&
    typeof anchorDayOfMonth === "number" &&
    anchorDayOfMonth >= 1 &&
    anchorDayOfMonth <= 31
  ) {
    next.anchorDayOfMonth = Math.trunc(anchorDayOfMonth);
  }
  // Drop the entry entirely when there's nothing left to remember —
  // keeps the on-disk map tight and avoids accumulating empty objects.
  const seriesMetadata: Record<string, SeriesMetadata> = {
    ...state.seriesMetadata,
  };
  if (Object.keys(next).length === 0) {
    delete seriesMetadata[seriesId];
  } else {
    seriesMetadata[seriesId] = next;
  }
  // Touching the toggle is a no-op for the persisted snapshot when the
  // resolved entry is identical — short-circuit so a redundant click
  // doesn't churn the storage hook.
  if (sameMetadata(current, seriesMetadata[seriesId])) {
    return null;
  }
  // Re-walk every row in the series and recompute `fiscalMonthShift`
  // from the new metadata. Rows outside the series stay untouched. The
  // grouping pipeline's same-day cascade handles transfers and same-day
  // expenses, so we only need to stamp the anchor (the salary row) here.
  const sheets = state.sheets.map((sheet) => {
    let sheetChanged = false;
    const items = sheet.items.map((item) => {
      if (item.type !== "accountBudget") return item;
      const dateCol = findColumnByType(item.columns, "date");
      if (!dateCol) return item;
      let itemChanged = false;
      const rows = item.rows.map((row) => {
        if (row.seriesId !== seriesId) return row;
        const dateValue = row.cells[dateCol.id];
        if (typeof dateValue !== "string" || dateValue.length < 10) return row;
        const shift = computePrimaryIncomeShift(
          dateValue,
          seriesMetadata[seriesId],
        );
        if (shift === row.fiscalMonthShift) return row;
        const nextRow: Row = { ...row };
        if (shift === undefined) {
          delete nextRow.fiscalMonthShift;
        } else {
          nextRow.fiscalMonthShift = shift;
        }
        itemChanged = true;
        return nextRow;
      });
      if (!itemChanged) return item;
      sheetChanged = true;
      return { ...item, rows };
    });
    return sheetChanged ? { ...sheet, items } : sheet;
  });
  return { ...state, sheets, seriesMetadata };
}

function sameMetadata(
  a: SeriesMetadata | undefined,
  b: SeriesMetadata | undefined,
): boolean {
  const aFlag = a?.isPrimaryIncome === true;
  const bFlag = b?.isPrimaryIncome === true;
  if (aFlag !== bFlag) return false;
  return (a?.anchorDayOfMonth ?? null) === (b?.anchorDayOfMonth ?? null);
}
