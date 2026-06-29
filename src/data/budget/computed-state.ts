import { findColumnByType } from "../sheet";
import { coveredMonths } from "../coverage";
import { findOrphans } from "../reconciliation";
import { groupRowsByMonth } from "../fiscal-month";
import { widestFormattedAmount } from "../../utils/format";
import {
  computeBalances,
  reverseRowsForNewestFirst,
  sortRowsByDate,
  type RowSortContext,
} from "./rows";
import { resolveEffectiveAmounts } from "./formula-resolve";
import type {
  AccountBudget,
  Column,
  EntryType,
  HistoryEntry,
  Row,
  Settings,
  UserData,
} from "../types";

// Bundles every pure derivation the budget page renders off of. Lives
// behind one factory so a non-budget sheet type (savings, loans) that
// wants the same row pipeline can call into it without re-implementing
// the synthesis → merge → decorate → sort → balance cascade. BudgetPage
// memoizes the call as a single `useMemo` so the 13 intermediate values
// stop carrying their own dep arrays — the function's signature is the
// dep list.
export type ComputedBudgetStateInputs = {
  item: AccountBudget;
  openingBalance: number;
  data: UserData;
  settings: Settings;
  history: readonly HistoryEntry[];
  typesById: ReadonlyMap<string, EntryType>;
  // Interleaved transfer + history rows produced by `buildSynthesizedRows`.
  // Hoisted to the caller so its memo can skip the synthesis walk across
  // cell-edit keystrokes — `item.rows` flips per keystroke but the
  // synthesis inputs (transfers, history, rules, hints, companies,
  // types, accountsById, item.columns, item.accountId) don't. Threading
  // the result through keeps the heavy O(H) walk + per-entry rule cache
  // build off the per-keystroke path.
  synthesizedRows: readonly Row[];
};

export type ComputedBudgetState = {
  dateCol: Column | undefined;
  sortContext: RowSortContext | undefined;
  mergedItem: AccountBudget;
  decoratedItem: AccountBudget;
  effectiveAmounts: Map<string, number>;
  balanceOverrides: Map<string, number>;
  sortedRows: Row[];
  balances: Map<string, number>;
  coveredSet: Set<string>;
  orphanCountByMonth: Map<string, number>;
  colWidths: { amountChars: number; balanceChars: number };
  monthGroups: Map<string, Row[]>;
  sortedMonthGroups: Map<string, Row[]>;
};

export function computeBudgetState(
  inputs: ComputedBudgetStateInputs,
): ComputedBudgetState {
  const {
    item,
    openingBalance,
    data,
    settings,
    history,
    typesById,
    synthesizedRows,
  } = inputs;

  const dateCol = findColumnByType(item.columns, "date");

  const sortContext: RowSortContext | undefined = (() => {
    const descCol = findColumnByType(item.columns, "description");
    const amountCol = findColumnByType(item.columns, "amount");
    if (!descCol || !amountCol) return undefined;
    return {
      descriptionColumnId: descCol.id,
      amountColumnId: amountCol.id,
      typesById,
    };
  })();

  const mergedItem: AccountBudget = {
    ...item,
    rows:
      synthesizedRows.length === 0
        ? item.rows
        : [...item.rows, ...synthesizedRows],
  };

  // Evaluate every formula row's amount against the merged view (so
  // synthesized transfers and history rows count toward
  // `endOfMonthBalance`, `income`, etc.) — then mirror the resolved
  // value into each formula row's amount cell so the existing
  // BudgetMonthTable / Cell rendering chain shows the evaluated number
  // without any per-component plumbing. The same map is fed into
  // `computeBalances` so the running balance column lines up.
  const resolved = resolveEffectiveAmounts(
    mergedItem,
    openingBalance,
    data,
    settings.startOfMonth,
  );
  const amountCol = findColumnByType(mergedItem.columns, "amount");
  const decoratedItem: AccountBudget = amountCol
    ? {
        ...mergedItem,
        rows: mergedItem.rows.map((row) => {
          if (!row.amountFormula) return row;
          const v = resolved.amounts.get(row.id) ?? 0;
          return { ...row, cells: { ...row.cells, [amountCol.id]: v } };
        }),
      }
    : mergedItem;
  const effectiveAmounts = resolved.amounts;

  // Each imported bank entry's stored balance is the truth: it pins
  // the running total at that row so an off-by-one opening balance
  // or a hand-edited authored row can't drag the column away from
  // what the bank says. Credit-card exports (no per-row balance) and
  // hidden entries fall through to the amount-based computation.
  // Split entries pin the balance at the LAST split row (after all
  // pieces have applied) so the on-screen total matches what the
  // bank reported for the original entry.
  const balanceOverrides = new Map<string, number>();
  for (const e of history) {
    if (e.hidden) continue;
    if (e.balance === undefined) continue;
    const anchorId =
      e.splits && e.splits.length > 0
        ? `hist:${e.id}:${e.splits.length - 1}`
        : `hist:${e.id}`;
    balanceOverrides.set(anchorId, e.balance);
  }

  // Sort the full rows array once. Both the running-balance pass below
  // and the per-month display path consume this view — feeding
  // `groupRowsByMonth` a globally date-sorted array delivers per-month
  // sorted buckets for free.
  const sortedRows = dateCol
    ? sortRowsByDate(decoratedItem.rows, dateCol.id, sortContext)
    : decoratedItem.rows;

  const balances = computeBalances(
    decoratedItem,
    openingBalance,
    effectiveAmounts,
    balanceOverrides,
    sortContext,
    sortedRows,
  );

  // Fiscal months fully covered by imported history. Used by each
  // `BudgetMonthTable` to hide its `+ Add row` footer. Uses
  // `settings.startOfMonth` so the coverage window matches the column
  // the rows are grouped under.
  const coveredSet = coveredMonths(
    history,
    item.rows,
    item.columns,
    settings.startOfMonth,
  );

  // Per-month count of manual rows sitting inside a covered fiscal
  // month — those are orphans the bank statement contradicts. Reuses
  // the same `findOrphans` walk the import-triage flow does so the
  // footer's count agrees with what the modal will surface. Treats
  // every covered month as "newly covered" since the budget-page CTA
  // is always retrospective (no import in flight).
  const orphanCountByMonth = new Map<string, number>();
  if (coveredSet.size > 0) {
    const orphans = findOrphans(
      item.rows,
      item.columns,
      coveredSet,
      new Set(),
      settings.startOfMonth,
    );
    for (const o of orphans) {
      orphanCountByMonth.set(
        o.monthKey,
        (orphanCountByMonth.get(o.monthKey) ?? 0) + 1,
      );
    }
  }

  // Each month renders as its own CSS grid, so amount/balance columns
  // sized with `max-content` end up different widths per month. Compute
  // the longest formatted value across the whole block here and pass it
  // down so every month aligns on the same column widths.
  const colWidthsAmountCol = findColumnByType(decoratedItem.columns, "amount");
  const colWidthsBalanceCol = findColumnByType(
    decoratedItem.columns,
    "balance",
  );
  let amountChars = 0;
  let balanceChars = 0;
  if (colWidthsAmountCol) {
    function* amountValues() {
      for (const row of decoratedItem.rows) {
        const v = row.cells[colWidthsAmountCol!.id];
        if (typeof v === "number") yield v;
      }
    }
    amountChars = widestFormattedAmount(amountValues(), settings);
  }
  if (colWidthsBalanceCol) {
    balanceChars = widestFormattedAmount(balances.values(), settings, {
      alwaysTwoFractionDigits: true,
      alwaysAbbreviate: settings.alwaysAbbreviateBalance,
    });
  }
  const colWidths = { amountChars, balanceChars };

  // Bucket the already-sorted rows by fiscal month. Because
  // `groupRowsByMonth` preserves input order, each bucket comes out
  // in the same date order the global sort produced — so the per-month
  // sort the next step used to do collapses to a no-op (or just a
  // reversal for the newest-first preference).
  const monthGroups: Map<string, Row[]> = dateCol
    ? groupRowsByMonth(sortedRows, dateCol.id, settings.startOfMonth)
    : new Map<string, Row[]>();

  // Each bucket is already date-sorted thanks to `sortedRows` above;
  // only the newest-first preference needs an extra reverse pass.
  // Stable array refs per month so React.memo on BudgetMonthTable can
  // skip months whose rows didn't change.
  const sortedMonthGroups: Map<string, Row[]> =
    dateCol && settings.transactionSortOrder === "newestFirst"
      ? (() => {
          const out = new Map<string, Row[]>();
          for (const [key, rows] of monthGroups) {
            out.set(key, reverseRowsForNewestFirst(rows));
          }
          return out;
        })()
      : monthGroups;

  return {
    dateCol,
    sortContext,
    mergedItem,
    decoratedItem,
    effectiveAmounts,
    balanceOverrides,
    sortedRows,
    balances,
    coveredSet,
    orphanCountByMonth,
    colWidths,
    monthGroups,
    sortedMonthGroups,
  };
}
