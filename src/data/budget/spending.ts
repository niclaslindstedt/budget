import {
  currentFiscalMonthKey,
  groupRowsByMonth,
  previousMonthKey,
  sortMonthKeys,
} from "../fiscal-month";
import { findColumnByType } from "../sheet";
import { isTransferRow } from "./synthesis";
import type { Column, EntryType, Item, Row } from "../types";

// Trailing fiscal-month window for the spending dashboard. Numbers
// count back from the current fiscal month (inclusive); "all" spans
// from the oldest actual-spend month through the current one.
export type SpendingPeriod = 3 | 6 | 12 | "all";

export type SpendingInputs = {
  // Pass `decoratedItem.rows` from `computeBudgetState` — formula rows
  // already carry their resolved amount in the amount cell, and
  // synthesized history / transfer rows are interleaved.
  rows: readonly Row[];
  columns: readonly Column[];
  typesById: ReadonlyMap<string, EntryType>;
  startOfMonth: number;
  // `currentFiscalMonthKey(startOfMonth)` — injected so tests are
  // deterministic.
  currentMonthKey: string;
  period: SpendingPeriod;
  // The owned-items catalog keyed by id. Only consulted when
  // `spreadItemCosts` is on; omit it otherwise.
  itemsById?: ReadonlyMap<string, Item>;
  // When true, expense rows carrying line items whose `Item` has both a
  // `purchasePrice` and a `lifetimeYears` lose the item's cost in the
  // purchase month and gain it back as equal monthly slices across the
  // lifetime — straight-line cost allocation (Swedish "avskrivning")
  // that de-spikes the charts around big purchases.
  spreadItemCosts?: boolean;
};

// One filtered "actual money moved" observation.
export type SpendingFact = {
  monthKey: string;
  // Signed: negative = expense, positive = income.
  amount: number;
  typeId: string | null;
  // Resolved via typeId → EntryType.categoryId; dangling ids → null.
  categoryId: string | null;
  companyId: string | null;
  // True when the row's resolved type is an income type
  // (`EntryType.kind === "income"`). Income types only tag data for the
  // income sheet, so the spending breakdowns (per-category, per-type,
  // per-merchant) exclude these facts entirely — a salary booked at ICA
  // must never count toward "how much you spent at ICA". A row with no
  // type, or a non-income type, is `false` and falls through to the
  // sign-based expense filter as before.
  isIncome: boolean;
};

// The dashboard's data-scope predicate: only rows representing money
// that actually moved count. Imported bank history is actual by
// definition; everything else needs its completed cell ticked.
// Transfers (either kind) are inter-account noise, and corrections
// are balance assertions, not spending — both are excluded.
export function isActualSpendingRow(
  row: Row,
  completedColumnId: string | null,
): boolean {
  if (row.kind === "correction") return false;
  if (isTransferRow(row)) return false;
  // Explicitly ignored rows are real money that the user has flagged as
  // unrepresentative of their spending — keep them in the ledger and
  // running balance, but never in the dashboard's facts.
  if (row.ignored) return false;
  // A reimbursed expense belongs to the account that covered it, not the
  // one it was charged to — drop it here (it's re-attributed to the
  // covering account's budget as an "attributed" row, which counts there).
  if (row.coverRole === "covered") return false;
  if (row.kind === "historic") return true;
  if (completedColumnId === null) return false;
  return row.cells[completedColumnId] === true;
}

// Filter `rows` down to actual-spending facts and compute the
// contiguous ascending fiscal-month window the charts share.
//
// Grouping runs over ALL rows before the scope filter: the
// `fiscalMonthShift` same-day cascade in `groupRowsByMonth` needs every
// anchor row present, including ones (e.g. transfers) the filter drops.
// Zero-amount rows produce no fact; months after `currentMonthKey` and
// the "undated" bucket never enter the window.
//
// With `spreadItemCosts` on, an expense row's line-item costs are lifted
// out of the purchase month and re-emitted as equal monthly slices (see
// `SpendingInputs.spreadItemCosts`). The lifted amount per item is
// clamped to what's left of the row's expense, so the residual fact
// never flips into income and the window's total spend is conserved —
// only redistributed (slices past `currentMonthKey` fall away; they'd
// land in future months the dashboard never shows). Slices inherit the
// row's type / category / company so the per-category charts stay
// attributed.
export function collectSpendingFacts(inputs: SpendingInputs): {
  facts: SpendingFact[];
  monthKeys: string[];
} {
  const { rows, columns, typesById, startOfMonth, currentMonthKey, period } =
    inputs;
  const dateCol = findColumnByType(columns, "date");
  const amountCol = findColumnByType(columns, "amount");
  const completedCol = findColumnByType(columns, "completed");
  if (!dateCol || !amountCol) return { facts: [], monthKeys: [] };

  const grouped = groupRowsByMonth([...rows], dateCol.id, startOfMonth);
  const itemsById = inputs.spreadItemCosts ? inputs.itemsById : undefined;

  const factsByMonth = new Map<string, SpendingFact[]>();
  const pushFact = (fact: SpendingFact) => {
    const list = factsByMonth.get(fact.monthKey);
    if (list) list.push(fact);
    else factsByMonth.set(fact.monthKey, [fact]);
  };

  for (const [monthKey, monthRows] of grouped) {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;
    if (monthKey > currentMonthKey) continue;
    for (const row of monthRows) {
      if (!isActualSpendingRow(row, completedCol?.id ?? null)) continue;
      const value = row.cells[amountCol.id];
      let amount = typeof value === "number" ? value : 0;
      if (amount === 0) continue;
      const type = row.typeId ? typesById.get(row.typeId) : undefined;
      const typeId = type ? row.typeId! : null;
      const categoryId = type ? type.categoryId : null;
      const companyId = row.companyId ?? null;
      const isIncome = type?.kind === "income";

      if (itemsById && amount < 0 && row.lineItems) {
        for (const link of row.lineItems) {
          const item = itemsById.get(link.itemId);
          const lifetime = item?.lifetimeYears;
          const price = item?.purchasePrice;
          if (lifetime === undefined || lifetime <= 0) continue;
          if (price === undefined || price <= 0) continue;
          // Lift at most what's left of the row's expense — an item
          // priced above the transaction spreads only what was paid.
          const lifted = Math.min(price, -amount);
          if (lifted <= 0) continue;
          amount += lifted;
          const months = Math.max(1, Math.round(lifetime * 12));
          const startIndex = monthKeyToIndex(monthKey);
          for (let m = 0; m < months; m += 1) {
            const sliceKey = monthIndexToKey(startIndex + m);
            if (sliceKey > currentMonthKey) break;
            pushFact({
              monthKey: sliceKey,
              amount: -(lifted / months),
              typeId,
              categoryId,
              companyId,
              isIncome,
            });
          }
        }
        if (amount === 0) continue;
      }

      pushFact({ monthKey, amount, typeId, categoryId, companyId, isIncome });
    }
  }

  // Resolve the window: numeric periods walk back from the current
  // fiscal month; "all" spans oldest fact → current, contiguously.
  let firstKey: string;
  if (period === "all") {
    const monthsWithFacts = sortMonthKeys(factsByMonth.keys());
    firstKey = monthsWithFacts[0] ?? currentMonthKey;
  } else {
    firstKey = currentMonthKey;
    for (let i = 1; i < period; i += 1) firstKey = previousMonthKey(firstKey);
  }

  const monthKeys: string[] = [];
  const facts: SpendingFact[] = [];
  for (
    let key = currentMonthKey;
    key >= firstKey;
    key = previousMonthKey(key)
  ) {
    monthKeys.push(key);
    const monthFacts = factsByMonth.get(key);
    if (monthFacts) facts.push(...monthFacts);
  }
  monthKeys.reverse();
  return { facts, monthKeys };
}

// Stacked-bar dataset: per-category expense totals per fiscal month.
// `totalsByMonth` aligns index-for-index with `monthKeys` (zero-filled)
// so every series shares the same x-values, which StackedBarChart
// requires. Categories are ordered by total spend descending with the
// uncategorised (null) bucket last.
export type MonthlyCategorySpending = {
  monthKeys: string[];
  categories: {
    categoryId: string | null;
    totalsByMonth: number[];
    total: number;
  }[];
};

export function computeMonthlyCategorySpending(
  facts: readonly SpendingFact[],
  monthKeys: readonly string[],
): MonthlyCategorySpending {
  const monthIndex = new Map<string, number>();
  monthKeys.forEach((key, i) => monthIndex.set(key, i));
  const byCategory = new Map<string | null, number[]>();
  for (const fact of facts) {
    if (fact.isIncome || fact.amount >= 0) continue;
    const i = monthIndex.get(fact.monthKey);
    if (i === undefined) continue;
    let totals = byCategory.get(fact.categoryId);
    if (!totals) {
      totals = new Array<number>(monthKeys.length).fill(0);
      byCategory.set(fact.categoryId, totals);
    }
    totals[i] += -fact.amount;
  }
  const categories = [...byCategory.entries()]
    .map(([categoryId, totalsByMonth]) => ({
      categoryId,
      totalsByMonth,
      total: totalsByMonth.reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => {
      if (a.categoryId === null && b.categoryId !== null) return 1;
      if (b.categoryId === null && a.categoryId !== null) return -1;
      return b.total - a.total;
    });
  return { monthKeys: [...monthKeys], categories };
}

// One donut slice: a category's (or, drilled in, an entry type's)
// share of the level's total expense. `id` null = uncategorised.
export type SpendingShare = {
  id: string | null;
  value: number;
  share: number;
};

function sharesBy(
  facts: readonly SpendingFact[],
  keyOf: (fact: SpendingFact) => string | null,
): SpendingShare[] {
  const totals = new Map<string | null, number>();
  let grand = 0;
  for (const fact of facts) {
    if (fact.isIncome || fact.amount >= 0) continue;
    const key = keyOf(fact);
    const value = -fact.amount;
    totals.set(key, (totals.get(key) ?? 0) + value);
    grand += value;
  }
  return [...totals.entries()]
    .map(([id, value]) => ({
      id,
      value,
      share: grand > 0 ? value / grand : 0,
    }))
    .sort((a, b) => {
      if (a.id === null && b.id !== null) return 1;
      if (b.id === null && a.id !== null) return -1;
      return b.value - a.value;
    });
}

// Expense share per category across the whole window.
export function computeCategoryShares(
  facts: readonly SpendingFact[],
): SpendingShare[] {
  return sharesBy(facts, (fact) => fact.categoryId);
}

// Drilldown: expense share per entry type within one category
// (`categoryId` null drills into the uncategorised bucket).
export function computeTypeShares(
  facts: readonly SpendingFact[],
  categoryId: string | null,
): SpendingShare[] {
  return sharesBy(
    facts.filter((fact) => fact.categoryId === categoryId),
    (fact) => fact.typeId,
  );
}

// Per-month income (sum of positives), expenses (abs sum of
// negatives), and net — zero-filled across `monthKeys`.
export type IncomeExpensePoint = {
  monthKey: string;
  income: number;
  expenses: number;
  net: number;
};

export function computeIncomeVsExpenses(
  facts: readonly SpendingFact[],
  monthKeys: readonly string[],
): IncomeExpensePoint[] {
  const points = monthKeys.map((monthKey) => ({
    monthKey,
    income: 0,
    expenses: 0,
    net: 0,
  }));
  const monthIndex = new Map<string, number>();
  monthKeys.forEach((key, i) => monthIndex.set(key, i));
  for (const fact of facts) {
    const i = monthIndex.get(fact.monthKey);
    if (i === undefined) continue;
    if (fact.amount > 0) points[i].income += fact.amount;
    else points[i].expenses += -fact.amount;
  }
  for (const point of points) point.net = point.income - point.expenses;
  return points;
}

// Top merchants by total expense in the window. Rows without a
// company are skipped — there is no merchant to attribute them to.
export type MerchantSpending = {
  companyId: string;
  total: number;
  count: number;
};

export function computeTopMerchants(
  facts: readonly SpendingFact[],
  limit: number,
): MerchantSpending[] {
  const byCompany = new Map<string, { total: number; count: number }>();
  for (const fact of facts) {
    if (fact.isIncome || fact.amount >= 0) continue;
    if (fact.companyId === null) continue;
    const entry = byCompany.get(fact.companyId);
    if (entry) {
      entry.total += -fact.amount;
      entry.count += 1;
    } else {
      byCompany.set(fact.companyId, { total: -fact.amount, count: 1 });
    }
  }
  return [...byCompany.entries()]
    .map(([companyId, { total, count }]) => ({ companyId, total, count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

// Map a "YYYY-MM" key onto a continuous month index (and back) so the
// charts' linear x-scales don't stretch across year boundaries.
export function monthKeyToIndex(key: string): number {
  return Number(key.slice(0, 4)) * 12 + (Number(key.slice(5, 7)) - 1);
}

export function monthIndexToKey(index: number): string {
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

// Convenience for call sites: the current fiscal month key derived the
// same way BudgetPage does. Re-exported here so the modal doesn't need
// a second fiscal-month import.
export { currentFiscalMonthKey };
