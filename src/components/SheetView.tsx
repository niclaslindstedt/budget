import { useMemo } from "react";

import {
  computeBalances,
  findColumnByType,
  groupRowsByMonth,
  sortMonthKeys,
  sortRowsByDate,
} from "../data/sheet";
import type { CellValue, Row, Sheet } from "../data/types";
import { MonthTable } from "./MonthTable";

type Props = {
  sheet: Sheet;
  showName?: boolean;
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  onAddRow: (date: string) => void;
  onDeleteRow: (rowId: string) => void;
  onReorderColumns: (fromId: string, toId: string) => void;
  onSetOpeningBalance: (value: number) => void;
};

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function SheetView({
  sheet,
  showName = true,
  onUpdateCell,
  onAddRow,
  onDeleteRow,
  onReorderColumns,
  onSetOpeningBalance,
}: Props) {
  const dateCol = useMemo(
    () => findColumnByType(sheet.columns, "date"),
    [sheet.columns],
  );

  const balances = useMemo(() => computeBalances(sheet), [sheet]);

  const monthGroups = useMemo(() => {
    if (!dateCol) return new Map<string, Row[]>();
    return groupRowsByMonth(sheet.rows, dateCol.id);
  }, [sheet.rows, dateCol]);

  const visibleMonths = useMemo(() => {
    const keys = new Set(monthGroups.keys());
    keys.add(currentMonthKey());
    return sortMonthKeys(keys);
  }, [monthGroups]);

  return (
    <section>
      <header className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        {showName && (
          <h2 className="m-0 text-base font-bold text-fg-bright">
            <span aria-hidden="true" className="text-pipe">
              #{" "}
            </span>
            {sheet.name}
          </h2>
        )}
        <label className="inline-flex items-center gap-2 text-sm text-muted">
          <span className="text-flag">--opening-balance</span>
          <input
            type="number"
            step="0.01"
            className="field-input w-[12ch] rounded border border-line bg-surface px-2 py-0.5 text-right tabular-nums text-meta"
            value={sheet.openingBalance}
            onChange={(e) => {
              const n = Number(e.target.value);
              onSetOpeningBalance(Number.isFinite(n) ? n : 0);
            }}
          />
        </label>
      </header>
      <div className="flex flex-col gap-6">
        {visibleMonths.map((monthKey) => {
          const monthRows = dateCol
            ? sortRowsByDate(monthGroups.get(monthKey) ?? [], dateCol.id)
            : [];
          return (
            <MonthTable
              key={monthKey}
              monthKey={monthKey}
              rows={monthRows}
              columns={sheet.columns}
              balances={balances}
              onUpdateCell={onUpdateCell}
              onAddRow={() =>
                onAddRow(monthKey === "undated" ? "" : `${monthKey}-01`)
              }
              onDeleteRow={onDeleteRow}
              onReorderColumns={onReorderColumns}
            />
          );
        })}
      </div>
    </section>
  );
}
