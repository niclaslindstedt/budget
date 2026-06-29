// Order an account's bank-history rows so the running balance chains.
//
// Bank exports list rows by date, but the order WITHIN a single day is up
// to the bank — many statements list same-day transactions in an order
// that does not follow the running balance (alphabetical, by posting
// batch, reverse, …). The stored array preserves that file order, so a
// naive "date asc, then import index" walk can step backwards over a day's
// transactions and read a discontinuous balance even though the figures
// are internally consistent. The cross-account duplicate finder leans on
// balance continuity to tell an owner from a mis-import, so a scrambled
// intra-day order made a genuinely-owned charge look like it doesn't
// reconcile (a red warning on the account that truly owns it).
//
// This util re-derives the intra-day order from the balances themselves:
// for each transaction the PRE-balance (`balance - amount`) must equal the
// previous transaction's balance, so the day's rows can be threaded into
// the one sequence that chains. Across days the date order is authoritative
// and untouched; only same-day groups are reordered, and only when every
// row in the group carries a balance and a clean chain exists — otherwise
// the original (date asc, import index) order is kept, so nothing is made
// worse when the balances can't decide.
//
// Pure: no React, no storage. Consumed by the duplicate finder
// (`historyContext`, `buildAccountIndex` in `./duplicates.ts`).

import type { HistoryEntry } from "../types";

// Balances are major units (kr) with decimals; chain in integer öre so
// floating-point drift can't open or close a link. One öre of slack
// absorbs rounding in bank exports — matches `BALANCE_TOLERANCE_CENTS` in
// `./duplicates.ts`.
const TOLERANCE_CENTS = 1;

function cents(n: number): number {
  return Math.round(n * 100);
}

function hasBalance(
  entry: HistoryEntry,
): entry is HistoryEntry & { balance: number } {
  return typeof entry.balance === "number" && Number.isFinite(entry.balance);
}

// The balance this row started from, in öre: its recorded balance minus its
// own signed amount.
function preCents(entry: HistoryEntry & { balance: number }): number {
  return cents(entry.balance) - cents(entry.amount);
}

function approxEq(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE_CENTS;
}

// Thread one day's rows (all carrying a balance) into the order whose
// running balance chains. `incoming` is the balance entering the day (the
// previous row's balance, in öre) or `null` when unknown. Returns the
// ordered rows, or `null` when no clean chain covers every row (ambiguous
// or discontinuous) so the caller can keep the original order.
function threadDay(
  group: readonly (HistoryEntry & { balance: number })[],
  incoming: number | null,
): HistoryEntry[] | null {
  // Greedily consume rows whose pre-balance matches the running balance.
  const tryFrom = (start: number): HistoryEntry[] | null => {
    const remaining = group.slice();
    const out: HistoryEntry[] = [];
    let running = start;
    while (remaining.length > 0) {
      const i = remaining.findIndex((e) => approxEq(preCents(e), running));
      if (i === -1) return null;
      const [picked] = remaining.splice(i, 1);
      out.push(picked);
      running = cents(picked.balance);
    }
    return out;
  };
  // Prefer the chain that connects to the previous day's closing balance.
  if (incoming !== null) {
    const chained = tryFrom(incoming);
    if (chained) return chained;
  }
  // Otherwise try each row as the head (start from its own pre-balance), so
  // a day that opens the history (no incoming balance) still threads.
  for (const head of group) {
    const chained = tryFrom(preCents(head));
    if (chained) return chained;
  }
  return null;
}

// Reorder `entries` by date ascending, then WITHIN each day by running-
// balance continuity (falling back to original import order when a day
// can't be cleanly chained). Stable and deterministic. The returned array
// is a new array; the entries themselves are untouched.
export function sortHistoryByBalance(
  entries: readonly HistoryEntry[],
): HistoryEntry[] {
  const indexed = entries.map((entry, index) => ({ entry, index }));
  indexed.sort((a, b) =>
    a.entry.date < b.entry.date
      ? -1
      : a.entry.date > b.entry.date
        ? 1
        : a.index - b.index,
  );
  const result: HistoryEntry[] = [];
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (
      j < indexed.length &&
      indexed[j].entry.date === indexed[i].entry.date
    ) {
      j += 1;
    }
    const group = indexed.slice(i, j).map((x) => x.entry);
    if (group.length > 1 && group.every(hasBalance)) {
      const last = result[result.length - 1];
      const incoming = last && hasBalance(last) ? cents(last.balance) : null;
      const ordered = threadDay(
        group as (HistoryEntry & { balance: number })[],
        incoming,
      );
      result.push(...(ordered ?? group));
    } else {
      result.push(...group);
    }
    i = j;
  }
  return result;
}
