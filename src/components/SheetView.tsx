import { useMemo } from "react";

import {
  computeBalances,
  findColumnByType,
  groupRowsByMonth,
  sortMonthKeys,
  sortRowsByDate,
} from "../data/sheet";
import type { Category, CellValue, Row, Sheet } from "../data/types";
import { MonthTable } from "./MonthTable";

type Props = {
  sheet: Sheet;
  categories: Category[];
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;
  showName?: boolean;
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  onAddRow: (date: string) => void;
  onAddComplex: (date: string) => void;
  onDeleteRequest: (row: Row) => void;
  onEditRequest: (row: Row) => void;
  onReorderColumns: (fromId: string, toId: string) => void;
  onToggleSelect: (rowId: string) => void;
  onToggleSelectMonth: (rowIds: string[], targetSelected: boolean) => void;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
};

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function SheetView({
  sheet,
  categories,
  selectMode,
  selectedIds,
  showName = true,
  onUpdateCell,
  onAddRow,
  onAddComplex,
  onDeleteRequest,
  onEditRequest,
  onReorderColumns,
  onToggleSelect,
  onToggleSelectMonth,
  onCreateCategory,
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
      {showName && (
        <header className="mb-4">
          <h2 className="m-0 text-base font-bold text-fg-bright">
            {sheet.name}
          </h2>
        </header>
      )}
      <div className="flex flex-col gap-6">
        {visibleMonths.map((monthKey) => {
          const monthRows = dateCol
            ? sortRowsByDate(monthGroups.get(monthKey) ?? [], dateCol.id)
            : [];
          const seedDate = monthKey === "undated" ? "" : `${monthKey}-01`;
          return (
            <MonthTable
              key={monthKey}
              monthKey={monthKey}
              rows={monthRows}
              columns={sheet.columns}
              balances={balances}
              categories={categories}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onUpdateCell={onUpdateCell}
              onAddRow={() => onAddRow(seedDate)}
              onAddComplex={() => onAddComplex(seedDate)}
              onDeleteRequest={onDeleteRequest}
              onEditRequest={onEditRequest}
              onReorderColumns={onReorderColumns}
              onToggleSelect={onToggleSelect}
              onToggleSelectMonth={onToggleSelectMonth}
              onCreateCategory={onCreateCategory}
            />
          );
        })}
      </div>
    </section>
  );
}
