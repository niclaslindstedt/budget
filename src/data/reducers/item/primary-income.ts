import { computePrimaryIncomeShift } from "../../fiscal-month";
import { findColumnByType } from "../../sheet";
import type { AccountBudget, Row, SeriesMetadata } from "../../types";

// Walk every row in `item` whose `seriesId` is flagged primary-income
// and re-stamp `fiscalMonthShift` from the row's current date. Rows
// outside flagged series — and rows in flagged series whose computed
// shift matches the stored value — fall through with referential
// identity preserved so the outer dispatch can short-circuit unchanged
// updates. Cheap by default: bails out before walking the rows when
// no series carries the primary-income flag.
export function applyPrimaryIncomeShifts(
  item: AccountBudget,
  seriesMetadata: Readonly<Record<string, SeriesMetadata>>,
): AccountBudget {
  const flaggedSeriesIds = new Set<string>();
  for (const [seriesId, meta] of Object.entries(seriesMetadata)) {
    if (meta.isPrimaryIncome) flaggedSeriesIds.add(seriesId);
  }
  if (flaggedSeriesIds.size === 0) return item;
  const dateCol = findColumnByType(item.columns, "date");
  if (!dateCol) return item;
  let changed = false;
  const rows = item.rows.map((row) => {
    if (!row.seriesId || !flaggedSeriesIds.has(row.seriesId)) return row;
    const dateValue = row.cells[dateCol.id];
    if (typeof dateValue !== "string" || dateValue.length < 10) return row;
    const shift = computePrimaryIncomeShift(
      dateValue,
      seriesMetadata[row.seriesId],
    );
    if (shift === row.fiscalMonthShift) return row;
    const next: Row = { ...row };
    if (shift === undefined) {
      delete next.fiscalMonthShift;
    } else {
      next.fiscalMonthShift = shift;
    }
    changed = true;
    return next;
  });
  return changed ? { ...item, rows } : item;
}
