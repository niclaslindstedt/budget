import { useCallback, useEffect, useReducer, useState } from "react";

import {
  ComplexEntryModal,
  type ComplexEntryDraft,
} from "./components/ComplexEntryModal";
import { ImportExportControls } from "./components/ImportExportControls";
import { SheetView } from "./components/SheetView";
import {
  createEmptyRow,
  findColumnByType,
  moveColumn,
  newId,
} from "./data/sheet";
import type { Budget, Category, CellValue, Row } from "./data/types";
import { loadBudget, saveBudget } from "./storage/local";

type SheetAction =
  | {
      type: "updateCell";
      sheetId: string;
      rowId: string;
      columnId: string;
      value: CellValue;
    }
  | { type: "addRow"; sheetId: string; date: string }
  | {
      type: "addRowsFromComplex";
      sheetId: string;
      draft: ComplexEntryDraft;
    }
  | { type: "deleteRow"; sheetId: string; rowId: string }
  | { type: "reorderColumns"; sheetId: string; fromId: string; toId: string }
  | { type: "setOpeningBalance"; sheetId: string; value: number };

type Action =
  | SheetAction
  | { type: "replace"; budget: Budget }
  | { type: "addCategory"; category: Category };

function reduceSheet(
  sheet: Budget["sheets"][number],
  action: SheetAction,
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

    case "addRowsFromComplex": {
      const { draft } = action;
      const newRows: Row[] = draft.dates.map((date) =>
        createEmptyRow(sheet.columns, {
          date,
          description: draft.description,
          amount: draft.amount,
          category: draft.categoryId,
          completed: false,
        }),
      );
      return { ...sheet, rows: [...sheet.rows, ...newRows] };
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
  if (action.type === "replace") return action.budget;
  if (action.type === "addCategory") {
    return { ...state, categories: [...state.categories, action.category] };
  }
  return {
    ...state,
    sheets: state.sheets.map((sheet) =>
      sheet.id === action.sheetId ? reduceSheet(sheet, action) : sheet,
    ),
  };
}

export function App() {
  const [budget, dispatch] = useReducer(reducer, undefined, loadBudget);
  const [complexOpen, setComplexOpen] = useState(false);
  const [complexSeedDate, setComplexSeedDate] = useState("");

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
  const onAddComplex = useCallback((date: string) => {
    setComplexSeedDate(date);
    setComplexOpen(true);
  }, []);
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
  const onImport = useCallback(
    (next: Budget) => dispatch({ type: "replace", budget: next }),
    [],
  );
  const onCreateCategory = useCallback(
    (draft: Omit<Category, "id">): Category => {
      const category: Category = { id: newId(), ...draft };
      dispatch({ type: "addCategory", category });
      return category;
    },
    [],
  );
  const onComplexSubmit = useCallback(
    (draft: ComplexEntryDraft) => {
      dispatch({ type: "addRowsFromComplex", sheetId, draft });
      setComplexOpen(false);
    },
    [sheetId],
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-full flex-col px-3 pt-3 pb-10 md:px-5 md:pt-4">
      <header className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line pb-4">
        <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
          <span aria-hidden="true" className="font-bold text-accent">
            $
          </span>
          <span className="text-base font-bold tracking-wide text-fg-bright">
            budget
          </span>
        </span>
        <div className="ml-auto">
          <ImportExportControls budget={budget} onImport={onImport} />
        </div>
      </header>
      <main className="flex-1">
        <SheetView
          sheet={activeSheet}
          categories={budget.categories}
          showName={budget.sheets.length > 1}
          onUpdateCell={onUpdateCell}
          onAddRow={onAddRow}
          onAddComplex={onAddComplex}
          onDeleteRow={onDeleteRow}
          onReorderColumns={onReorderColumns}
          onSetOpeningBalance={onSetOpeningBalance}
          onCreateCategory={onCreateCategory}
        />
      </main>
      <footer className="mt-12 border-t border-line pt-4 text-xs text-muted">
        <a
          href="https://github.com/niclaslindstedt/budget"
          className="underline decoration-dotted hover:text-fg"
        >
          Source
        </a>
      </footer>
      <ComplexEntryModal
        open={complexOpen}
        initialDate={complexSeedDate}
        categories={budget.categories}
        onClose={() => setComplexOpen(false)}
        onCreate={onComplexSubmit}
        onCreateCategory={onCreateCategory}
      />
    </div>
  );
}
