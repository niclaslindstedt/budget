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
import { sortRowsByDate, type RowSortContext } from "./rows";
import { getMonthKey, previousMonthKey } from "../fiscal-month";
import { findColumnByType } from "../sheet";
import { allTypes } from "../presets/merge";
import type { AccountBudget, EntryType, Row, Sheet, UserData } from "../types";

// Mutable view of `MonthAggregates` we own internally. The exported
// `MonthAggregates` exposes `ReadonlyMap`s but the precompute path
// mutates them in place as formula rows resolve; the cast at the
// FormulaContext boundary narrows back to the read-only shape so the
// evaluator can't accidentally write to the cache.
type MutableMonthAggregates = {
  openingBalance: number;
  income: number;
  expenses: number;
  net: number;
  uncategorized: number;
  byCategory: Map<string, number>;
  byType: Map<string, number>;
};

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
  const descCol = findColumnByType(item.columns, "description");
  if (!amountCol || !dateCol) return result;
  const sortContext: RowSortContext | undefined = descCol
    ? {
        descriptionColumnId: descCol.id,
        amountColumnId: amountCol.id,
        typesById,
      }
    : undefined;

  // Seed: every row contributes its literal amount cell if present.
  // Formula rows get 0 until their formula resolves; they're processed
  // in source order below and the map is mutated in place so later
  // formulas see earlier formulas' results.
  let formulaCount = 0;
  for (const row of item.rows) {
    const raw = row.cells[amountCol.id];
    const literal = typeof raw === "number" ? raw : Number(raw) || 0;
    if (row.amountFormula) {
      formulaCount += 1;
      result.amounts.set(row.id, 0);
    } else {
      result.amounts.set(row.id, literal);
    }
  }
  if (formulaCount === 0) return result;

  // Per-formula aggregateMonth / runningBalanceBefore used to re-walk
  // every row for every formula — O(F × N log N). Precompute the
  // per-month aggregates and a sorted prefix-sum once; each formula
  // then resolves in O(1) cache lookup + O(F) running-balance
  // correction. As formulas resolve, the caches mutate in place so
  // later formulas see the earlier results without re-walking the
  // input.
  const aggsByMonth = buildMonthAggregateCache(
    item.rows,
    dateCol.id,
    result.amounts,
    startOfMonth,
    typesById,
  );
  // Ascending month order. `getMonthKey` returns "undated" for rows
  // without a parseable date; lexically "undated" > "YYYY-MM" so it
  // naturally sorts last — matching the original aggregateMonth
  // semantics where undated rows contribute to the opening of an
  // "undated" target month only.
  const monthKeysAsc = [...aggsByMonth.keys()].sort();
  // Carry-forward opening per month = base opening + sum of nets of
  // every strictly-prior month. Stored alongside the aggregates so
  // each formula's `thisMonth.openingBalance` is an O(1) lookup, and
  // cascading a resolved formula's contribution forward is just an
  // O(M) increment loop instead of an O(N) re-scan.
  let runningOpening = openingBalance;
  for (const k of monthKeysAsc) {
    const agg = aggsByMonth.get(k)!;
    agg.openingBalance = runningOpening;
    runningOpening += agg.net;
  }

  // Sort rows once for balanceBefore lookups. The sort key reads
  // literal `row.cells[amountCol.id]` (not the effective amount), so
  // the order is stable across the formula-resolution loop even as
  // `result.amounts` mutates.
  const sorted = sortRowsByDate(item.rows, dateCol.id, sortContext);
  const sortedIndex = new Map<string, number>();
  for (let i = 0; i < sorted.length; i += 1) {
    sortedIndex.set(sorted[i].id, i);
  }
  // Running sum walked in sort order with formulas treated as 0. Each
  // formula's balanceBefore = basePrefix[idx] + Σ of resolved-earlier
  // formulas whose sortedIdx < idx — captured in `resolvedFormulas`.
  const basePrefix = new Array<number>(sorted.length);
  {
    let r = openingBalance;
    for (let i = 0; i < sorted.length; i += 1) {
      basePrefix[i] = r;
      r += result.amounts.get(sorted[i].id) ?? 0;
    }
  }
  const resolvedFormulas: Array<{ sortedIdx: number; value: number }> = [];

  // Per-resolve caches. Many formulas in one budget can reference the
  // same `sheet("Wife", endOfMonthBalance)` from the same month — the
  // bare cross-sheet helper re-walks the target item's rows twice on
  // every call plus does `data.sheets.find` / `data.accounts.find`
  // each time. Caching at this scope drops F × O(N) re-walks to a
  // single O(N) per (sheetId, monthKey) the resolver actually
  // needs, and routes the id lookups through O(1) Maps.
  const sheetsById = new Map<string, Sheet>();
  for (const s of data.sheets) sheetsById.set(s.id, s);
  const accountsById = new Map<string, number>();
  for (const a of data.accounts) {
    accountsById.set(a.id, a.openingBalance ?? 0);
  }
  const crossSheetAggCache = new Map<string, MonthAggregates | null>();
  const crossSheetItemCache = new Map<string, AccountBudget | null>();
  const crossSheetOpeningCache = new Map<string, number>();

  const lookupSheet = (
    targetSheetId: string,
    prop: string,
    monthKey: string,
  ): number | null => {
    const aggKey = `${targetSheetId}|${monthKey}`;
    let agg = crossSheetAggCache.get(aggKey);
    if (agg === undefined) {
      let item = crossSheetItemCache.get(targetSheetId);
      if (item === undefined) {
        const sheet = sheetsById.get(targetSheetId);
        item = sheet ? firstBudgetItem(sheet) : null;
        crossSheetItemCache.set(targetSheetId, item);
      }
      if (!item) {
        crossSheetAggCache.set(aggKey, null);
        return null;
      }
      let opening = crossSheetOpeningCache.get(targetSheetId);
      if (opening === undefined) {
        opening = item.accountId ? (accountsById.get(item.accountId) ?? 0) : 0;
        crossSheetOpeningCache.set(targetSheetId, opening);
      }
      agg = aggregateCrossSheetMonth(
        item,
        monthKey,
        opening,
        startOfMonth,
        typesById,
      );
      crossSheetAggCache.set(aggKey, agg);
    }
    if (!agg) return null;
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

    // Read cached aggregates. The current formula's own contribution
    // is 0 (its `amounts` entry is still 0 until we set it below), so
    // the original `excludeRowId=row.id` branch is a no-op against the
    // cached numbers — including the categoryId/typeId buckets, where
    // a 0-contribution key reads back the same as a missing one.
    const thisMonth = aggsByMonth.get(rowMonth) ?? emptyMutable(openingBalance);
    const prevMonth = aggsByMonth.get(prevKey) ?? emptyMutable(openingBalance);
    const endOfMonthBalance = thisMonth.openingBalance + thisMonth.net;

    let balanceBefore: number;
    const myIdx = sortedIndex.get(row.id);
    if (myIdx === undefined) {
      balanceBefore = openingBalance;
    } else {
      let bb = basePrefix[myIdx];
      for (let i = 0; i < resolvedFormulas.length; i += 1) {
        const r = resolvedFormulas[i];
        if (r.sortedIdx < myIdx) bb += r.value;
      }
      balanceBefore = bb;
    }

    const ctx: FormulaContext = {
      thisMonth: thisMonth as MonthAggregates,
      prevMonth: prevMonth as MonthAggregates,
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
    if (evaluated.value !== 0) {
      applyResolvedFormulaToCache(
        aggsByMonth,
        monthKeysAsc,
        rowMonth,
        row,
        evaluated.value,
        typesById,
      );
    }
    if (myIdx !== undefined) {
      resolvedFormulas.push({ sortedIdx: myIdx, value: evaluated.value });
    }
  }
  return result;
}

// Pass 1: bucket every row into its fiscal-month aggregate, treating
// each row's amount as whatever `amounts` currently holds (literals
// for non-formula rows, 0 for unresolved formulas). The buckets are
// mutable so `applyResolvedFormulaToCache` can fold a freshly-resolved
// formula's value back into its month without rebuilding the cache.
function buildMonthAggregateCache(
  rows: readonly Row[],
  dateColId: string,
  amounts: ReadonlyMap<string, number>,
  startOfMonth: number,
  typesById: ReadonlyMap<string, EntryType>,
): Map<string, MutableMonthAggregates> {
  const out = new Map<string, MutableMonthAggregates>();
  for (const row of rows) {
    const monthKey = getMonthKey(row.cells[dateColId], startOfMonth);
    let agg = out.get(monthKey);
    if (!agg) {
      agg = {
        openingBalance: 0,
        income: 0,
        expenses: 0,
        net: 0,
        uncategorized: 0,
        byCategory: new Map(),
        byType: new Map(),
      };
      out.set(monthKey, agg);
    }
    const amount = amounts.get(row.id) ?? 0;
    if (amount > 0) agg.income += amount;
    else if (amount < 0) agg.expenses += amount;
    agg.net += amount;
    const type = row.typeId ? typesById.get(row.typeId) : undefined;
    if (type) {
      agg.byCategory.set(
        type.categoryId,
        (agg.byCategory.get(type.categoryId) ?? 0) + amount,
      );
      agg.byType.set(type.id, (agg.byType.get(type.id) ?? 0) + amount);
    } else {
      agg.uncategorized += amount;
    }
  }
  return out;
}

// Fold a freshly-resolved formula's value into its month's aggregate
// (and propagate the net delta to every later month's
// `openingBalance`). Mirrors the bucket update in
// `buildMonthAggregateCache` so the cache stays consistent with what a
// from-scratch aggregateMonth would have produced for subsequent
// formulas.
function applyResolvedFormulaToCache(
  aggsByMonth: Map<string, MutableMonthAggregates>,
  monthKeysAsc: readonly string[],
  monthKey: string,
  row: Row,
  value: number,
  typesById: ReadonlyMap<string, EntryType>,
): void {
  const agg = aggsByMonth.get(monthKey);
  if (!agg) return;
  if (value > 0) agg.income += value;
  else if (value < 0) agg.expenses += value;
  agg.net += value;
  const type = row.typeId ? typesById.get(row.typeId) : undefined;
  if (type) {
    agg.byCategory.set(
      type.categoryId,
      (agg.byCategory.get(type.categoryId) ?? 0) + value,
    );
    agg.byType.set(type.id, (agg.byType.get(type.id) ?? 0) + value);
  } else {
    agg.uncategorized += value;
  }
  // Cascade the carry-forward opening to every strictly-later month.
  // monthKeysAsc is sorted lexically (which agrees with calendar order
  // for `YYYY-MM` keys and parks "undated" at the end).
  let cascade = false;
  for (let i = 0; i < monthKeysAsc.length; i += 1) {
    const k = monthKeysAsc[i];
    if (cascade) {
      aggsByMonth.get(k)!.openingBalance += value;
      continue;
    }
    if (k === monthKey) cascade = true;
  }
}

function emptyMutable(openingBalance: number): MutableMonthAggregates {
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

// Cross-sheet aggregate for one (sheet, month) pair. v1 forward-only:
// formula rows on the referenced sheet are treated as literal 0 so a
// cycle through `sheet("…")` can never form. A future v2 could resolve
// recursively with a visited-set.
//
// Inline form of the literal-pre-pass + `aggregateMonth` chain the
// caller used to do — folding both into one walk halves the row-scan
// work, and the result is cached per (sheetId, monthKey) by the
// resolver so F formulas referencing the same sheet/month run a single
// scan instead of F.
function aggregateCrossSheetMonth(
  item: AccountBudget,
  monthKey: string,
  openingBalance: number,
  startOfMonth: number,
  typesById: ReadonlyMap<string, EntryType>,
): MonthAggregates | null {
  const dateCol = findColumnByType(item.columns, "date");
  const amountCol = findColumnByType(item.columns, "amount");
  if (!dateCol || !amountCol) return null;
  let opening = openingBalance;
  let income = 0;
  let expenses = 0;
  let uncategorized = 0;
  const byCategory = new Map<string, number>();
  const byType = new Map<string, number>();
  for (const row of item.rows) {
    // v1 cycle-avoidance: formula rows on the referenced sheet
    // contribute 0.
    let amount: number;
    if (row.amountFormula) {
      amount = 0;
    } else {
      const raw = row.cells[amountCol.id];
      amount = typeof raw === "number" ? raw : Number(raw) || 0;
    }
    const rowMonth = getMonthKey(row.cells[dateCol.id], startOfMonth);
    if (rowMonth < monthKey) {
      opening += amount;
      continue;
    }
    if (rowMonth !== monthKey) continue;
    if (amount > 0) income += amount;
    else if (amount < 0) expenses += amount;
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

function firstBudgetItem(sheet: Sheet): AccountBudget | null {
  for (const item of sheet.items) {
    if (item.type === "accountBudget") return item;
  }
  return null;
}
