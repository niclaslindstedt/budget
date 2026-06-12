import {
  computeBudgetState,
  type ComputedBudgetState,
} from "../budget/computed-state";
import { nextMonthKey } from "../fiscal-month";
import type {
  AccountBudget,
  EntryType,
  HistoryEntry,
  Row,
  Scenario,
  Settings,
  UserData,
} from "../types";
import { applyScenario } from "./apply";

// One full pipeline run for one variant (the Baseline when `scenario`
// is null, else that scenario): apply the deltas, then reuse the budget
// page's own `computeBudgetState` so the Baseline is byte-identical to
// what the budget sheet shows — synthesized transfer / history rows,
// formula resolution, bank balance pins, fiscal-month grouping and all.
// `synthesizedRows` is built once by the page (`buildSynthesizedRows`)
// and shared across every variant; it doesn't depend on `item.rows`.
export function computeScenarioState(inputs: {
  baseItem: AccountBudget;
  scenario: Scenario | null;
  openingBalance: number;
  data: UserData;
  settings: Settings;
  history: readonly HistoryEntry[];
  typesById: ReadonlyMap<string, EntryType>;
  synthesizedRows: readonly Row[];
}): ComputedBudgetState {
  return computeBudgetState({
    item: applyScenario(inputs.baseItem, inputs.scenario),
    openingBalance: inputs.openingBalance,
    data: inputs.data,
    settings: inputs.settings,
    history: inputs.history,
    typesById: inputs.typesById,
    synthesizedRows: inputs.synthesizedRows,
  });
}

// Monthly END balance per fiscal month: the running balance of the last
// row in each `monthGroups` bucket. Buckets come out of the global
// date-ascending sort, so the last row IS the month's final state —
// read `monthGroups`, never `sortedMonthGroups`, which may be reversed
// for the newest-first display preference. Months with no rows are
// absent here; the chart axis fill carries the previous month's end
// balance forward.
export function monthlyEndBalances(
  state: ComputedBudgetState,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [monthKey, rows] of state.monthGroups) {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue; // skip "undated"
    for (let i = rows.length - 1; i >= 0; i--) {
      const balance = state.balances.get(rows[i].id);
      if (balance !== undefined) {
        out.set(monthKey, balance);
        break;
      }
    }
  }
  return out;
}

// Epoch ms of a `YYYY-MM` key's first calendar day — the x value the
// LineChart consumes (it autoscales over numbers; the caller formats
// ticks back through the month key).
export function monthKeyToEpochMs(monthKey: string): number {
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  return Date.UTC(y, m - 1, 1);
}

// Inverse of `monthKeyToEpochMs`, for tick / tooltip formatting.
export function epochMsToMonthKey(x: number): string {
  const d = new Date(x);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Align every variant's monthly end balances onto one shared month
// axis and fill the gaps: months before a variant's first data point
// sit at the opening balance, later empty months carry the previous
// month's end balance forward. Returns LineChart-ready points keyed by
// the same variant keys passed in.
//
// The axis defaults to the union range across all variants. An explicit
// `range` (inclusive `YYYY-MM` keys) pins it instead — the visualize
// modal uses this for its forward-looking horizon, so the axis can
// extend past the last dated row (the fill carries the final balance
// forward) and months before `from` are folded into each variant's
// starting value rather than drawn.
export function buildScenarioChartPoints(
  byVariant: ReadonlyMap<string, Map<string, number>>,
  openingBalance: number,
  range?: { from: string; to: string },
): Map<string, { x: number; y: number }[]> {
  let min: string | undefined;
  let max: string | undefined;
  for (const balances of byVariant.values()) {
    for (const key of balances.keys()) {
      if (min === undefined || key < min) min = key;
      if (max === undefined || key > max) max = key;
    }
  }
  const out = new Map<string, { x: number; y: number }[]>();
  if (range !== undefined) {
    min = range.from;
    max = range.to;
  }
  if (min === undefined || max === undefined || max < min) {
    for (const variant of byVariant.keys()) out.set(variant, []);
    return out;
  }
  const axis: string[] = [];
  for (let key = min; key <= max; key = nextMonthKey(key)) axis.push(key);
  for (const [variant, balances] of byVariant) {
    // Seed the carry-forward with the latest end balance dated before
    // the axis starts, so a pinned range doesn't reset pre-range
    // history to the opening balance.
    let last = openingBalance;
    let lastKey: string | undefined;
    for (const [key, balance] of balances) {
      if (key >= min) continue;
      if (lastKey === undefined || key > lastKey) {
        lastKey = key;
        last = balance;
      }
    }
    out.set(
      variant,
      axis.map((key) => {
        const balance = balances.get(key);
        if (balance !== undefined) last = balance;
        return { x: monthKeyToEpochMs(key), y: last };
      }),
    );
  }
  return out;
}

// Projected balance at an inclusive monitor date: the running balance
// of the last row dated at or before `isoDate` (plain ISO string
// compare — a monitor of 2026-12-31 means "after everything dated up
// to and including that day", calendar-wise, independent of fiscal
// month shifts). `openingBalance` when no row qualifies; rows without
// a parseable date are skipped.
export function balanceAtDate(
  state: ComputedBudgetState,
  isoDate: string,
  openingBalance: number,
): number {
  const dateColId = state.dateCol?.id;
  if (dateColId === undefined) return openingBalance;
  let result = openingBalance;
  for (const row of state.sortedRows) {
    const date = row.cells[dateColId];
    if (typeof date !== "string" || date === "") continue;
    if (date > isoDate) break;
    const balance = state.balances.get(row.id);
    if (balance !== undefined) result = balance;
  }
  return result;
}
