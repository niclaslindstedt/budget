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

// Which of the mortgage's known amounts a series' typical charge lines up
// with — interest alone, amortisation (principal) alone, or the two paid
// together as one combined charge.
export type MortgageTarget = "interest" | "principal" | "combined";

// One recurring monthly outflow the account pays — a candidate mortgage
// charge (principal, interest, or a combined payment). The walk offers
// these for the user to map to the mortgage's payment legs.
export type MortgagePaymentSeries = {
  key: string; // normalised description (stable across imports)
  label: string; // a representative bank description
  suggestedAmount: number; // typical charge magnitude (positive)
  confidence: number; // 0..1, from the recurring detector
  months: SeriesMonth[]; // chronological, one winner per month
  spanMonths: number; // calendar months first..last, inclusive
  // Set when the series' typical amount lands within tolerance of one of
  // the mortgage's known figures; `targetDelta` is the relative distance
  // (0 = exact) used to rank the closest match first.
  matchedTarget?: MortgageTarget;
  targetDelta?: number;
};

export type MortgageDiscoveryResult = {
  series: MortgagePaymentSeries[]; // amount matches first, then confidence
};

// The mortgage's known monthly figures the finder matches charges against.
// Either may be `null` when the mortgage hasn't recorded enough to compute
// it (no rate, no amortisation) — the matcher simply skips that target.
export type MortgageTargets = {
  interest: number | null;
  principal: number | null;
};

export type MortgageDiscoveryInput = {
  // The bound account's full imported history (`data.history[id]`).
  entries: readonly HistoryEntry[];
  referenceDate?: string;
  // The mortgage's expected monthly amounts. When supplied, series whose
  // typical charge sits within `tolerance` of a target are tagged and
  // ranked ahead of recurrence-only candidates.
  targets?: MortgageTargets;
  // Relative half-width of the match band, as a fraction (0.1 ⇒ ±10%).
  // Defaults to `DEFAULT_MORTGAGE_TOLERANCE`.
  tolerance?: number;
};

// Default ± band, matching the salary finder's same-pay tolerance — wide
// enough that a charge a few percent off (a rounded direct debit, interest
// that crept as the balance fell) still matches its target.
export const DEFAULT_MORTGAGE_TOLERANCE = 0.1;

// Relative distance between an amount and a target (0 = exact match).
function relativeDelta(amount: number, target: number): number {
  const scale = Math.max(Math.abs(amount), Math.abs(target));
  if (scale === 0) return 0;
  return Math.abs(amount - target) / scale;
}

// Calendar months spanned by a chronological list of "YYYY-MM" keys,
// inclusive of both ends (one month ⇒ 1, Jan..Dec same year ⇒ 12).
function spanOfMonths(monthKeys: readonly string[]): number {
  if (monthKeys.length === 0) return 0;
  const first = monthKeys[0];
  const last = monthKeys[monthKeys.length - 1];
  const fy = Number(first.slice(0, 4));
  const fm = Number(first.slice(5, 7));
  const ly = Number(last.slice(0, 4));
  const lm = Number(last.slice(5, 7));
  return (ly - fy) * 12 + (lm - fm) + 1;
}

// The series' best target match (closest within tolerance), comparing its
// typical charge against interest, amortisation, and the two combined.
function matchTarget(
  amount: number,
  targets: MortgageTargets | undefined,
  tolerance: number,
): { target: MortgageTarget; delta: number } | null {
  if (!targets) return null;
  const candidates: { target: MortgageTarget; value: number }[] = [];
  if (targets.interest !== null)
    candidates.push({ target: "interest", value: targets.interest });
  if (targets.principal !== null)
    candidates.push({ target: "principal", value: targets.principal });
  if (targets.interest !== null && targets.principal !== null)
    candidates.push({
      target: "combined",
      value: targets.interest + targets.principal,
    });

  let best: { target: MortgageTarget; delta: number } | null = null;
  for (const c of candidates) {
    if (c.value <= 0) continue;
    const delta = relativeDelta(amount, c.value);
    if (delta > tolerance) continue;
    if (!best || delta < best.delta) best = { target: c.target, delta };
  }
  return best;
}

export function discoverMortgagePayments(
  input: MortgageDiscoveryInput,
): MortgageDiscoveryResult {
  const referenceDate = input.referenceDate ?? todayIso();
  const tolerance = input.tolerance ?? DEFAULT_MORTGAGE_TOLERANCE;

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
    const match = matchTarget(info.amount, input.targets, tolerance);
    const entry: MortgagePaymentSeries = {
      key,
      label: labelByKey.get(key) ?? key,
      suggestedAmount: info.amount,
      confidence: info.confidence,
      spanMonths: spanOfMonths(sortedMonths),
      months: sortedMonths.map((m) => {
        const e = months.get(m)!;
        return {
          monthKey: m,
          date: e.date,
          amount: Math.abs(e.amount),
          entryId: e.id,
        };
      }),
    };
    if (match) {
      entry.matchedTarget = match.target;
      entry.targetDelta = match.delta;
    }
    series.push(entry);
  }

  // Amount matches lead, closest target first; the recurrence-only tail
  // keeps the old confidence order so a charge that hits the mortgage's
  // known figure is offered ahead of an unrelated monthly bill.
  series.sort((a, b) => {
    const am = a.targetDelta;
    const bm = b.targetDelta;
    if (am !== undefined && bm !== undefined) return am - bm;
    if (am !== undefined) return -1;
    if (bm !== undefined) return 1;
    return b.confidence - a.confidence;
  });
  return { series };
}

// Keep only the months of a series whose charge sits within `tolerance` of
// a reference amount — the "find the rest" band around a picked payment, so
// a stray double-charge or a one-off larger draw in the same description
// group doesn't get swept in. Returns the months unchanged when the series
// is empty.
export function monthsWithinBand(
  series: MortgagePaymentSeries,
  amount: number,
  tolerance: number = DEFAULT_MORTGAGE_TOLERANCE,
): SeriesMonth[] {
  return series.months.filter(
    (m) => relativeDelta(m.amount, amount) <= tolerance,
  );
}
