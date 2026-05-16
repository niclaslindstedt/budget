import { useCallback, useEffect, useReducer } from "react";

import { SheetView } from "./components/SheetView";
import { MAX_COLUMN_CHARS } from "./data/constants";
import { createEmptyRow, findColumnByType, moveColumn } from "./data/sheet";
import type { Budget, CellValue, Row } from "./data/types";
import { loadBudget, saveBudget } from "./storage/local";

type Action =
  | {
      type: "updateCell";
      sheetId: string;
      rowId: string;
      columnId: string;
      value: CellValue;
    }
  | { type: "addRow"; sheetId: string; date: string }
  | { type: "deleteRow"; sheetId: string; rowId: string }
  | { type: "reorderColumns"; sheetId: string; fromId: string; toId: string }
  | { type: "setOpeningBalance"; sheetId: string; value: number };

function reduceSheet(
  sheet: Budget["sheets"][number],
  action: Action,
): Budget["sheets"][number] {
  switch (action.type) {
    case "updateCell":
      return {
        ...sheet,
        rows: sheet.rows.map((r) =>
          r.id === action.rowId
            ? { ...r, cells: { ...r.cells, [action.columnId]: action.value } }
            : r,
        ),
      };

    case "addRow": {
      const dateCol = findColumnByType(sheet.columns, "date");
      const newRow: Row = createEmptyRow(sheet.columns, {
        date: dateCol && action.date ? action.date : null,
        completed: false,
      });
      return { ...sheet, rows: [...sheet.rows, newRow] };
    }

    case "deleteRow":
      return {
        ...sheet,
        rows: sheet.rows.filter((r) => r.id !== action.rowId),
      };

    case "reorderColumns":
      return {
        ...sheet,
        columns: moveColumn(sheet.columns, action.fromId, action.toId),
      };

    case "setOpeningBalance":
      return { ...sheet, openingBalance: action.value };
  }
}

function reducer(state: Budget, action: Action): Budget {
  return {
    ...state,
    sheets: state.sheets.map((sheet) =>
      sheet.id === action.sheetId ? reduceSheet(sheet, action) : sheet,
    ),
  };
}

export function App() {
  const [budget, dispatch] = useReducer(reducer, undefined, loadBudget);

  useEffect(() => {
    saveBudget(budget);
  }, [budget]);

  const activeSheet =
    budget.sheets.find((s) => s.id === budget.activeSheetId) ??
    budget.sheets[0];

  const sheetId = activeSheet.id;

  const onUpdateCell = useCallback(
    (rowId: string, columnId: string, value: CellValue) =>
      dispatch({ type: "updateCell", sheetId, rowId, columnId, value }),
    [sheetId],
  );
  const onAddRow = useCallback(
    (date: string) => dispatch({ type: "addRow", sheetId, date }),
    [sheetId],
  );
  const onDeleteRow = useCallback(
    (rowId: string) => dispatch({ type: "deleteRow", sheetId, rowId }),
    [sheetId],
  );
  const onReorderColumns = useCallback(
    (fromId: string, toId: string) =>
      dispatch({ type: "reorderColumns", sheetId, fromId, toId }),
    [sheetId],
  );
  const onSetOpeningBalance = useCallback(
    (value: number) => dispatch({ type: "setOpeningBalance", sheetId, value }),
    [sheetId],
  );

  return (
    <main
      className="app"
      style={
        {
          "--max-column-chars": `${MAX_COLUMN_CHARS}ch`,
        } as React.CSSProperties
      }
    >
      <h1 className="app-title">Budget</h1>
      <SheetView
        sheet={activeSheet}
        onUpdateCell={onUpdateCell}
        onAddRow={onAddRow}
        onDeleteRow={onDeleteRow}
        onReorderColumns={onReorderColumns}
        onSetOpeningBalance={onSetOpeningBalance}
      />
    </main>
  );
}
