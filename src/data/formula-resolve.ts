// Sheet-side glue for the formula engine. Builds the per-row
// `FormulaContext` from an AccountBudget's rows + the wider UserData,
// then walks the budget in source order producing the effective
// amount (`Map<rowId, number>`) used by the renderer and balance math.
//
// Eval policy (locked in by `AskUserQuestion` during planning):
// literal rows first, then formula rows in the order they appear in
// `item.rows`. A formula row's own contribution is excluded from its
// own variables so `endOfMonthBalance - 5000` produces the leave-5000
// result the user intuitively expects. Cross-sheet references only
// consult the *literal* rows of the referenced sheet (cycle
// avoidance simplification).

import { evaluateFormula, parseFormula } from "./formula";
import type { FormulaContext, MonthAggregates } from "./formula";
import {
  findColumnByType,
  getMonthKey,
  previousMonthKey,
  sortRowsByDate,
} from "./sheet";
import { allTypes } from "./presets";
import type { AccountBudget, EntryType, Row, Sheet, UserData } from "./types";

export type ResolveResult = {
  // Effective amount per row id. Literal rows map to their cell value
  // (or 0 if the cell isn't a number); formula rows map to the
  // evaluator's output (or 0 on error, with the error recorded below).
  amounts: Map<string, number>;
  // Per-formula-row error message, when evaluation or parsing failed.
  errors: Map<string, string>;
};

// Resolve a single AccountBudget. `openingBalance` is the running
// balance carried in from outside the budget (history + account
// opening); `data` is used for `sheet("…")` cross-sheet references.
export function resolveEffectiveAmounts(
  item: AccountBudget,
  openingBalance: number,
  data: UserData,
  startOfMonth: number = 1,
): ResolveResult {
  const typesById = new Map<string, EntryType>();
  for (const t of allTypes(data)) typesById.set(t.id, t);
  const result: ResolveResult = {
    amounts: new Map(),
    errors: new Map(),
  };
  const amountCol = findColumnByType(item.columns, "amount");
  const dateCol = findColumnByType(item.columns, "date");
  if (!amountCol || !dateCol) return result;

  // Seed: every row contributes its literal amount cell if present.
  // Formula rows get 0 until their formula resolves; they're processed
  // in source order below and the map is mutated in place so later
  // formulas see earlier formulas' results.
  for (const row of item.rows) {
    const raw = row.cells[amountCol.id];
    const literal = typeof raw === "number" ? raw : Number(raw) || 0;
    result.amounts.set(row.id, row.amountFormula ? 0 : literal);
  }

  // Helper closures bound to the snapshot of the budget. Each formula
  // row's aggregates are recomputed because earlier formula rows may
  // have updated the map.
  const lookupSheet = (
    targetSheetId: string,
    prop: string,
    monthKey: string,
  ): number | null => {
    return crossSheetLookup(
      data,
      targetSheetId,
      prop,
      monthKey,
      startOfMonth,
      typesById,
    );
  };

  for (const row of item.rows) {
    if (!row.amountFormula) continue;
    const parsed = parseFormula(row.amountFormula);
    if (!parsed.ok) {
      result.errors.set(row.id, parsed.error);
      continue;
    }
    const rowMonth = getMonthKey(row.cells[dateCol.id], startOfMonth);
    const prevKey = previousMonthKey(rowMonth);

    const thisMonth = aggregateMonth(
      item,
      rowMonth,
      result.amounts,
      openingBalance,
      row.id,
      startOfMonth,
      typesById,
    );
    const prevMonth = aggregateMonth(
      item,
      prevKey,
      result.amounts,
      openingBalance,
      null,
      startOfMonth,
      typesById,
    );
    const balanceBefore = runningBalanceBefore(
      item,
      row,
      result.amounts,
      openingBalance,
      dateCol.id,
    );
    const endOfMonthBalance = thisMonth.openingBalance + thisMonth.net;

    const ctx: FormulaContext = {
      thisMonth,
      prevMonth,
      balanceBefore,
      endOfMonthBalance,
      lookupSheet: (sheetId, prop) => lookupSheet(sheetId, prop, rowMonth),
    };
    const evaluated = evaluateFormula(parsed.ast, ctx);
    if (!evaluated.ok) {
      result.errors.set(row.id, evaluated.error);
      continue;
    }
    result.amounts.set(row.id, evaluated.value);
  }
  return result;
}

// Build a MonthAggregates from the budget's rows for the given fiscal
// month, reading effective amounts from `amounts`. `excludeRowId`
// drops the named row from every aggregate so a formula row doesn't
// reference itself.
function aggregateMonth(
  item: AccountBudget,
  monthKey: string,
  amounts: ReadonlyMap<string, number>,
  openingBalance: number,
  excludeRowId: string | null,
  startOfMonth: number,
  typesById: ReadonlyMap<string, EntryType>,
): MonthAggregates {
  const dateCol = findColumnByType(item.columns, "date");
  if (!dateCol) return emptyAggregates(openingBalance);

  // Sum literals (and resolved formulas) in every month strictly
  // before `monthKey` to get the opening balance for `monthKey`.
  let opening = openingBalance;
  let income = 0;
  let expenses = 0;
  let uncategorized = 0;
  const byCategory = new Map<string, number>();
  const byType = new Map<string, number>();

  for (const row of item.rows) {
    if (excludeRowId !== null && row.id === excludeRowId) continue;
    const rowMonth = getMonthKey(row.cells[dateCol.id], startOfMonth);
    const amount = amounts.get(row.id) ?? 0;
    if (rowMonth < monthKey) {
      opening += amount;
      continue;
    }
    if (rowMonth !== monthKey) continue;
    if (amount > 0) income += amount;
    else if (amount < 0) expenses += amount;
    // Category is derived through the row's type. Rows with no type
    // (or a type that has been deleted) fall into the "uncategorized"
    // bucket so a stale formula referencing them still resolves
    // sensibly.
    const type = row.typeId ? typesById.get(row.typeId) : undefined;
    if (type) {
      byCategory.set(
        type.categoryId,
        (byCategory.get(type.categoryId) ?? 0) + amount,
      );
      byType.set(type.id, (byType.get(type.id) ?? 0) + amount);
    } else {
      uncategorized += amount;
    }
  }

  return {
    openingBalance: opening,
    income,
    expenses,
    net: income + expenses,
    uncategorized,
    byCategory,
    byType,
  };
}

function emptyAggregates(openingBalance: number): MonthAggregates {
  return {
    openingBalance,
    income: 0,
    expenses: 0,
    net: 0,
    uncategorized: 0,
    byCategory: new Map(),
    byType: new Map(),
  };
}

function runningBalanceBefore(
  item: AccountBudget,
  target: Row,
  amounts: ReadonlyMap<string, number>,
  openingBalance: number,
  dateColId: string,
): number {
  const sorted = sortRowsByDate(item.rows, dateColId);
  let running = openingBalance;
  for (const row of sorted) {
    if (row.id === target.id) return running;
    running += amounts.get(row.id) ?? 0;
  }
  return running;
}

// Cross-sheet lookup: returns the requested property on the first
// AccountBudget in the named sheet, evaluated against the row's
// fiscal month. v1 forward-only — the referenced sheet's formula
// rows contribute 0 here so a cycle through `sheet("…")` can never
// form.
function crossSheetLookup(
  data: UserData,
  targetSheetId: string,
  prop: string,
  monthKey: string,
  startOfMonth: number,
  typesById: ReadonlyMap<string, EntryType>,
): number | null {
  // v1 forward-only: the referenced sheet's formula rows are treated
  // as literal-zero so a cycle through `sheet("…")` can never form.
  // A future v2 could resolve recursively with a visited-set; for now
  // the cross-sheet edge stays at literals only.
  const sheet = data.sheets.find((s) => s.id === targetSheetId);
  if (!sheet) return null;
  const item = firstBudgetItem(sheet);
  if (!item) return null;

  const opening = sheetOpeningBalance(data, sheet);
  const literalAmounts = new Map<string, number>();
  const amountCol = findColumnByType(item.columns, "amount");
  if (!amountCol) return null;
  for (const row of item.rows) {
    if (row.amountFormula) {
      // v1 cycle-avoidance: skip formula rows on the referenced sheet.
      literalAmounts.set(row.id, 0);
      continue;
    }
    const raw = row.cells[amountCol.id];
    literalAmounts.set(
      row.id,
      typeof raw === "number" ? raw : Number(raw) || 0,
    );
  }
  const agg = aggregateMonth(
    item,
    monthKey,
    literalAmounts,
    opening,
    null,
    startOfMonth,
    typesById,
  );
  switch (prop) {
    case "endOfMonthBalance":
      return agg.openingBalance + agg.net;
    case "openingBalance":
      return agg.openingBalance;
    case "income":
      return agg.income;
    case "expenses":
      return agg.expenses;
    case "net":
      return agg.net;
    default:
      throw new Error(`Unknown sheet property "${prop}"`);
  }
}

function firstBudgetItem(sheet: Sheet): AccountBudget | null {
  for (const item of sheet.items) {
    if (item.type === "accountBudget") return item;
  }
  return null;
}

// The opening balance for a sheet's first AccountBudget = its
// account's opening + the sum of any imported history that pre-dates
// the budget. v1 keeps this simple: just the account opening. If the
// app later threads history into the budget seed, update this in
// concert with the change.
function sheetOpeningBalance(data: UserData, sheet: Sheet): number {
  const item = firstBudgetItem(sheet);
  if (!item || !item.accountId) return 0;
  const account = data.accounts.find((a) => a.id === item.accountId);
  return account?.openingBalance ?? 0;
}
