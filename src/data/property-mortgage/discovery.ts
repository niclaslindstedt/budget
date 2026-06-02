// Explorative mortgage-payment detector for the guided "Find mortgage
// payments" walk. Mirrors `salary/discovery.ts`: it scans a bound
// account's imported bank HISTORY for the recurring monthly OUTFLOW a
// mortgage is paid with, and surfaces the matching charges month by month
// so the user can accept them as `MortgagePayment` records.
//
// Where salary anchors on the largest recurring *inflow*, a mortgage is a
// recurring *outflow* — and a property can be paid with one combined
// charge (principal + interest together) or two separate charges
// (amortisation + interest). Amounts alone can't tell a mortgage from
// rent or any other monthly bill, so this detector returns the candidate
// recurring outflow *series* (patterns) and lets the walk's UI pick which
// one is the principal charge and, optionally, which is the interest
// charge. The per-month split is then the user's call.
//
// Pure: fed an account's history + a dedupe set, it emits the recurring
// outflow series with their per-month winning entries. Reuses
// `detectRecurringCandidates` for the cadence / regularity scoring so the
// mortgage path and the recurring-candidate panel agree on what counts as
// a monthly pattern.

import { detectRecurringCandidates } from "../budget/recurring-detection";
import {
  isNormalisedKeyMeaningful,
  normaliseDescription,
} from "../description-normaliser";
import type { HistoryEntry } from "../types";
import { todayIso } from "../../utils/date";

// One month's winning charge from a recurring outflow series.
export type SeriesMonth = {
  monthKey: string; // "YYYY-MM"
  date: string; // the winning charge's date
  amount: number; // magnitude of the outflow (positive)
  entryId: string; // the HistoryEntry it came from
};

// One recurring monthly outflow the account pays — a candidate mortgage
// charge (principal, interest, or a combined payment). The walk offers
// these for the user to map to the mortgage's payment legs.
export type MortgagePaymentSeries = {
  key: string; // normalised description (stable across imports)
  label: string; // a representative bank description
  suggestedAmount: number; // typical charge magnitude (positive)
  confidence: number; // 0..1, from the recurring detector
  months: SeriesMonth[]; // chronological, one winner per month
};

export type MortgageDiscoveryResult = {
  series: MortgagePaymentSeries[]; // sorted by confidence, highest first
};

export type MortgageDiscoveryInput = {
  // The bound account's full imported history (`data.history[id]`).
  entries: readonly HistoryEntry[];
  referenceDate?: string;
};

export function discoverMortgagePayments(
  input: MortgageDiscoveryInput,
): MortgageDiscoveryResult {
  const referenceDate = input.referenceDate ?? todayIso();

  // Recurring patterns across the FULL history. The staleness guard is
  // disabled (a huge factor) so a charge from a paid-off or refinanced
  // loan years back still surfaces — discovery is deliberately
  // past-focused, not "still active".
  const recurring = detectRecurringCandidates({
    entries: input.entries,
    referenceDate,
    staleAfterFactor: Number.MAX_SAFE_INTEGER,
  });

  // Keep the negative monthly series — the cadence a mortgage charge
  // lands on. (Quarterly / yearly charges aren't mortgage payments.)
  const outflowKeys = new Map<string, { amount: number; confidence: number }>();
  for (const c of recurring) {
    if (c.suggestedAmount < 0 && c.cadence.kind === "monthly") {
      outflowKeys.set(c.key, {
        amount: Math.abs(c.suggestedAmount),
        confidence: c.confidence,
      });
    }
  }
  if (outflowKeys.size === 0) return { series: [] };

  // Re-derive the per-month winning charge for each kept series: the
  // largest outflow that month whose normalised description matches the
  // series. One winner per month per series so a stray same-month charge
  // doesn't double-count.
  const byKeyMonth = new Map<string, Map<string, HistoryEntry>>();
  const labelByKey = new Map<string, string>();
  for (const entry of input.entries) {
    if (entry.hidden) continue;
    if (entry.collapsedIntoTransferId) continue;
    if (entry.amount >= 0) continue;
    const key = normaliseDescription(entry.description);
    if (!isNormalisedKeyMeaningful(key)) continue;
    if (!outflowKeys.has(key)) continue;
    let months = byKeyMonth.get(key);
    if (!months) {
      months = new Map<string, HistoryEntry>();
      byKeyMonth.set(key, months);
      if (entry.description.trim()) labelByKey.set(key, entry.description);
    }
    const month = entry.date.slice(0, 7);
    const current = months.get(month);
    // "Largest" outflow = most negative amount.
    if (!current || entry.amount < current.amount) months.set(month, entry);
  }

  const series: MortgagePaymentSeries[] = [];
  for (const [key, info] of outflowKeys) {
    const months = byKeyMonth.get(key);
    if (!months || months.size === 0) continue;
    const sortedMonths = [...months.keys()].sort();
    series.push({
      key,
      label: labelByKey.get(key) ?? key,
      suggestedAmount: info.amount,
      confidence: info.confidence,
      months: sortedMonths.map((m) => {
        const entry = months.get(m)!;
        return {
          monthKey: m,
          date: entry.date,
          amount: Math.abs(entry.amount),
          entryId: entry.id,
        };
      }),
    });
  }

  series.sort((a, b) => b.confidence - a.confidence);
  return { series };
}
