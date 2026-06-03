// Tag-anchored mortgage-payment finder for the guided "Find mortgage
// payments" walk. The simpler successor to the old recurrence + amount
// matcher: instead of guessing which monthly outflow is the mortgage from
// statistics, it leans on the metadata the user already applied while
// going through their imported history — the mortgage's tied **company**
// (the lender) and the **Mortgage** entry type. Those two tags are the
// strongest signal that a charge IS the mortgage; nothing else
// distinguishes a bank's loan draw from any other transfer to that bank.
//
// From the tagged charges it learns the bank **description** (the same
// text recurs every month) and a typical **amount**, then sweeps the rest
// of the account's history for matching months — so a single tagged month
// pulls in every other month of the same charge, even the untagged ones.
// When the user has tagged nothing yet, the mortgage's already-added
// payments seed the same description + amount expansion ("find more like
// these"). With neither anchor the walk has nothing to go on and reports
// `seed: "none"` so the modal can nudge the user to tag a month first.
//
// Pure: fed an account's history plus the company / type / rule / hint
// tables needed to resolve each entry's tags, it emits the matching charge
// series with their per-month winning entries. Reuses `resolveEntryLabels`
// so the finder reads the exact effective company / type the budget
// tables show.

import { resolveEntryLabels, newRuleMatchCache } from "../budget/synthesis";
import {
  isNormalisedKeyMeaningful,
  normaliseDescription,
} from "../description-normaliser";
import type {
  Company,
  EntryType,
  HistoryEntry,
  MatchRule,
  MerchantHint,
} from "../types";

// One month's winning charge from a matched series.
export type SeriesMonth = {
  monthKey: string; // "YYYY-MM"
  date: string; // the winning charge's date
  amount: number; // magnitude of the outflow (positive)
  entryId: string; // the HistoryEntry it came from
};

// One recurring monthly charge the finder matched — a candidate mortgage
// payment series, grouped by bank description.
export type MortgagePaymentSeries = {
  key: string; // normalised description (stable across imports)
  label: string; // a representative bank description
  suggestedAmount: number; // typical charge magnitude (positive)
  months: SeriesMonth[]; // chronological, one winner per month
  spanMonths: number; // calendar months first..last, inclusive
  // Why this series surfaced: a company / type tag the user applied
  // ("tag"), or a payment already recorded on the mortgage ("payment").
  anchor: "tag" | "payment";
  // Relative distance (0 = exact) from the closest expected figure — the
  // monthly amortisation, interest, or the two combined, when the loan
  // terms resolve them. Drives ordering so the charge whose amount lines
  // up with the maths leads. `undefined` when no expected figure is known.
  targetDelta?: number;
};

// How the finder found its anchor — drives the modal's empty-state copy.
//   "tags"     — entries tagged with the mortgage's company and/or type
//   "payments" — no tags, but the mortgage already has payments to learn from
//   "none"     — neither; the modal nudges the user to tag a month
export type MortgageDiscoverySeed = "tags" | "payments" | "none";

export type MortgageDiscoveryResult = {
  series: MortgagePaymentSeries[]; // largest typical charge first
  seed: MortgageDiscoverySeed;
};

export type MortgageDiscoveryInput = {
  // The bound account's full imported history (`data.history[id]`).
  entries: readonly HistoryEntry[];
  // Tables needed to resolve each entry's effective company / type, the
  // same way the budget tables do (per-entry override → rule → hint).
  merchantHints: Readonly<Record<string, MerchantHint>>;
  matchRules: readonly MatchRule[];
  companies: readonly Company[];
  types: readonly EntryType[];
  // The property's lenders (the tied companies across its mortgages). An
  // entry resolving to any of these companies anchors a series. Empty ⇒
  // company isn't a signal.
  companyIds?: readonly string[];
  // The "Mortgage" preset type id. An entry resolving to this type anchors
  // a series — the second strong signal alongside the company.
  mortgageTypeId: string;
  // Bank entry ids already backing a payment on this mortgage. Used as the
  // fallback anchor (their descriptions seed the expansion) when no tagged
  // entry exists.
  seedEntryIds?: readonly string[];
  // The property's purchase date (ISO yyyy-mm-dd), when known. NOT a hard
  // cut-off: a charge with the same bank description before this date is
  // usually the user's *previous* home's mortgage, and the amount shifts
  // when they move (a new loan, a new balance). So the date is used to
  // pick the band CENTRE — the typical charge is taken from the months on
  // or after the purchase, the amount THIS property's loan is paid at — and
  // the amount band then drops the differently-sized earlier months on its
  // own. Absent ⇒ the centre is the median across every month.
  fromDate?: string;
  // Expected monthly figures the loan terms resolve to — the amortisation,
  // the interest, and/or the two combined. Drive two things: they RANK the
  // matched series (closest to an expected amount first — the amortisation
  // and interest draws are large, predictable amounts, so a charge near one
  // of them is the likeliest real payment), and they GATE out the series
  // whose typical charge is an order of magnitude away from every expected
  // figure (see `MORTGAGE_PLAUSIBILITY_FACTOR`). A 20 kr charge cannot be the
  // payment on a loan whose amortisation + interest runs to thousands a
  // month, however it got anchored, so it is dropped rather than offered.
  // The gate is generous (a wide factor, not the tight selection band) and
  // only applies when the loan terms actually resolve an expected figure —
  // with no terms recorded every anchored series is kept, as before.
  targetAmounts?: readonly number[];
  // Relative half-width of the match band, as a fraction (0.1 ⇒ ±10%).
  // Applied by `monthsWithinBand` at preview time; defaults to
  // `DEFAULT_MORTGAGE_TOLERANCE`.
  tolerance?: number;
};

// Default ± band. The amount of a mortgage charge barely moves month to
// month (only when the interest rate resets), so a tight band still keeps
// every ordinary month while dropping a stray double-draw.
export const DEFAULT_MORTGAGE_TOLERANCE = 0.1;

// How far a series' typical charge may sit from the closest expected figure
// (the loan's amortisation + interest) before the finder rejects it as
// implausible — a deliberately WIDE order-of-magnitude window, not the tight
// month-selection band above. A real charge drifts from the today-rate
// computed figure as the rate and balance move over the years, but only
// within a small factor; a charge 5× larger or smaller than every expected
// figure is some other outflow that happened to get anchored (a fee, a
// subscription, a mistagged transfer), not the mortgage. Set generously so
// an unusual-but-real charge survives and only the wildly-off noise is cut.
export const MORTGAGE_PLAUSIBILITY_FACTOR = 5;

// Relative distance between an amount and a reference (0 = exact match).
function relativeDelta(amount: number, reference: number): number {
  const scale = Math.max(Math.abs(amount), Math.abs(reference));
  if (scale === 0) return 0;
  return Math.abs(amount - reference) / scale;
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

// Median of a non-empty list — a robust centre for the amount band that
// shrugs off a single rate-change outlier.
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function discoverMortgagePayments(
  input: MortgageDiscoveryInput,
): MortgageDiscoveryResult {
  const { entries, mortgageTypeId, fromDate } = input;
  const companyIds = new Set(input.companyIds ?? []);
  const seedEntryIds = new Set(input.seedEntryIds ?? []);
  const targetAmounts = (input.targetAmounts ?? []).filter((a) => a > 0);
  const ruleCache = newRuleMatchCache();

  // Re-derive the per-month winning charge for each description group: the
  // largest outflow that month whose normalised description matches the
  // group. One winner per month per group so a stray same-month charge
  // doesn't double-count. Tracked across the FULL history so a single
  // tagged month can pull in every other month of the same charge.
  const byKeyMonth = new Map<string, Map<string, HistoryEntry>>();
  const labelByKey = new Map<string, string>();
  // Description keys anchored by a company / type tag, and by an existing
  // payment, kept apart so tags win when both are present.
  const tagKeys = new Set<string>();
  const paymentKeys = new Set<string>();

  for (const entry of entries) {
    if (entry.hidden) continue;
    if (entry.collapsedIntoTransferId) continue;
    if (entry.amount >= 0) continue; // outflows only
    const key = normaliseDescription(entry.description);
    if (!isNormalisedKeyMeaningful(key)) continue;

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

    if (seedEntryIds.has(entry.id)) paymentKeys.add(key);

    const labels = resolveEntryLabels(
      entry,
      input.merchantHints,
      input.matchRules,
      input.companies,
      input.types,
      ruleCache,
    );
    const companyMatch =
      labels.companyId !== null && companyIds.has(labels.companyId);
    const typeMatch = labels.typeId === mortgageTypeId;
    if (companyMatch || typeMatch) tagKeys.add(key);
  }

  // Tags are the stronger signal; only fall back to the payment seed when
  // nothing is tagged.
  const seed: MortgageDiscoverySeed =
    tagKeys.size > 0 ? "tags" : paymentKeys.size > 0 ? "payments" : "none";
  if (seed === "none") return { series: [], seed };

  const anchorKeys = seed === "tags" ? tagKeys : paymentKeys;
  const anchor: MortgagePaymentSeries["anchor"] =
    seed === "tags" ? "tag" : "payment";

  const series: MortgagePaymentSeries[] = [];
  for (const key of anchorKeys) {
    const months = byKeyMonth.get(key);
    if (!months || months.size === 0) continue;
    const sortedMonths = [...months.keys()].sort();
    // Centre the band on the months on or after the purchase — the amount
    // this property's loan is paid at — so an earlier home's
    // same-description charge (a different amount) doesn't drag the centre
    // and is dropped by the band. Fall back to every month when none fall
    // on or after the purchase (or no purchase date is known).
    const fromMonth = fromDate ? fromDate.slice(0, 7) : null;
    const centreMonths =
      fromMonth !== null
        ? sortedMonths.filter((m) => m >= fromMonth)
        : sortedMonths;
    const amountsFor = (keys: readonly string[]) =>
      keys.map((m) => Math.abs(months.get(m)!.amount));
    const suggestedAmount = median(
      amountsFor(centreMonths.length > 0 ? centreMonths : sortedMonths),
    );
    let targetDelta: number | undefined;
    for (const target of targetAmounts) {
      const delta = relativeDelta(suggestedAmount, target);
      if (targetDelta === undefined || delta < targetDelta) targetDelta = delta;
    }
    series.push({
      key,
      label: labelByKey.get(key) ?? key,
      suggestedAmount,
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
      anchor,
      ...(targetDelta !== undefined ? { targetDelta } : {}),
    });
  }

  // Drop series whose typical charge is an order of magnitude away from
  // every expected figure the loan terms resolved — these can't be the
  // mortgage no matter how they got anchored (a mistagged fee, a leftover
  // payment seed on the wrong charge). `targetDelta` is the distance to the
  // closest expected figure, so `targetDelta <= (f-1)/f` is exactly "within
  // a factor f". When the loan has no terms `targetDelta` is undefined and
  // every anchored series is kept, as before.
  const maxPlausibleDelta =
    (MORTGAGE_PLAUSIBILITY_FACTOR - 1) / MORTGAGE_PLAUSIBILITY_FACTOR;
  const plausible = series.filter(
    (s) => s.targetDelta === undefined || s.targetDelta <= maxPlausibleDelta,
  );

  // Rank by closeness to an expected figure when the loan terms gave us
  // one — the charge whose amount matches the maths is the likeliest
  // payment. Series with no expected figure fall back to largest typical
  // charge first, so the amortisation draw still leads the smaller
  // interest draw when a loan is paid in two separate charges.
  plausible.sort((a, b) => {
    if (a.targetDelta !== undefined && b.targetDelta !== undefined)
      return a.targetDelta - b.targetDelta;
    if (a.targetDelta !== undefined) return -1;
    if (b.targetDelta !== undefined) return 1;
    return b.suggestedAmount - a.suggestedAmount;
  });
  return { series: plausible, seed };
}

// Keep only the months of a series whose charge sits within `tolerance` of
// a reference amount — the band around a series' typical charge, so a stray
// double-charge or a one-off larger draw in the same description group
// doesn't get swept in. Returns the months unchanged when the series is
// empty.
export function monthsWithinBand(
  series: MortgagePaymentSeries,
  amount: number,
  tolerance: number = DEFAULT_MORTGAGE_TOLERANCE,
): SeriesMonth[] {
  return series.months.filter(
    (m) => relativeDelta(m.amount, amount) <= tolerance,
  );
}
