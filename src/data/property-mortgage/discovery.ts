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
//
// Anchoring works at three strictness levels: tagged charges (strictest),
// the descriptions of payments already recorded, and — when the loan terms
// resolve an expected monthly figure (amortisation + interest, per loan and
// combined) — the **maths**, where any recurring outflow whose typical amount
// lands near one of those figures is a candidate. All three are surfaced at
// once and RANKED by strictness: tagged and payment-seeded charges lead,
// amount-only matches rank below them, and within a level the charge whose
// amount lines up closest with the expected figure leads. Ranking rather than
// a winner-takes-all cascade is what keeps a stray unrelated tag — a card fee
// billed by the same bank that holds the mortgage — from shadowing the real
// payment: the fee is dropped as implausible and the maths-found charge still
// appears. Only with no tag, no payment, AND no expected figure does the walk
// report `seed: "none"` and nudge the user to tag a month first.
//
// On top of the strictness tiers sits one stronger signal: **a complete
// recurrence on the loan's cadence**. A mortgage is paid on a fixed cadence
// (monthly by default, or whatever `Mortgage.paymentCadenceMonths` records),
// every period, for the same amount — so a charge that recurs on that clean
// cadence with no gaps, under one stable description, whose typical amount
// lands within the tight band of an expected figure, AND which covers the
// whole window the loan has been active (from its start date to the latest
// charge the account has seen) is flagged **highly probable** and TRUMPS the
// tag / company anchor in the ranking. The "covers the whole window" leg is
// what stops a charge that happens to recur cleanly for only the last five of
// eight months since the loan began (one that started late or has since
// stopped) from masquerading as the mortgage — it stays an ordinary candidate.
// Only ONE charge is promoted per expected figure: among the candidates that
// match a given target's amount and cadence, the closest is marked, so a
// second clean-but-wrong charge near the same figure doesn't also light up.
// The recurrence + matching amount + stable text + complete window is a surer
// signal that the charge IS the mortgage than any single tag the user happened
// to apply, so it leads even over a tagged charge — and the modal marks it so
// it stands out.
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
  months: SeriesMonth[]; // chronological, one entry per payment occurrence
  spanMonths: number; // calendar months first..last, inclusive
  // Why this series surfaced: a company / type tag the user applied
  // ("tag"), a payment already recorded on the mortgage ("payment"), or —
  // when neither exists — the loan terms' expected monthly figure that the
  // charge's amount lands near ("amount").
  anchor: "tag" | "payment" | "amount";
  // Relative distance (0 = exact) from the closest expected figure — the
  // monthly amortisation, interest, or the two combined, when the loan
  // terms resolve them. Drives ordering so the charge whose amount lines
  // up with the maths leads. `undefined` when no expected figure is known.
  targetDelta?: number;
  // True when the charge recurs on its loan's cadence with no gaps — one
  // charge every `paymentCadenceMonths` (monthly by default) across its
  // (post-purchase) span — over enough occurrences to establish the pattern
  // (`MORTGAGE_RECURRENCE_MIN_MONTHS`). A mortgage is paid on a fixed cadence,
  // every period, so an unbroken cadence is itself strong evidence the charge
  // IS the mortgage, independent of any tag.
  regularCadence: boolean;
  // The standout candidate: the closest charge, per expected figure, that
  // recurs on its cadence (`regularCadence`) under one stable description (not
  // an amount-salvaged group), whose typical amount lands within
  // `MORTGAGE_AMOUNT_ANCHOR_TOLERANCE` of that figure, AND which covers the
  // whole window the loan has been active (see `windowCovered`). A complete
  // recurrence + matching amount + stable text is the surest signal a charge
  // is the mortgage, so it TRUMPS the tag / company anchor in the ranking and
  // is marked "highly probable" in the modal. `false` for any series missing a
  // leg, and for the runner-up when two charges match the same figure.
  highlyProbable: boolean;
};

// Which strictness level the LEADING surfaced series came from — drives the
// modal's copy. Reflects what the user is actually shown at the top, not
// merely which signals were present (a stray tag that produced nothing
// doesn't make the seed "tags" when the maths found the payment).
//   "tags"     — charges tagged with the mortgage's company and/or type
//   "payments" — the mortgage's already-recorded payments
//   "amount"   — the loan terms' expected figure; a charge landed near it
//   "none"     — nothing to go on; the modal nudges the user to tag a month
export type MortgageDiscoverySeed = "tags" | "payments" | "amount" | "none";

export type MortgageDiscoveryResult = {
  series: MortgagePaymentSeries[]; // largest typical charge first
  seed: MortgageDiscoverySeed;
  // A structured account of how the walk reached its result — the scan
  // funnel (how many entries it saw and why each was dropped before
  // grouping) plus every grouped candidate with its typical amount, its
  // distance to the closest expected figure, and the reason it did or
  // didn't make the final list. Always computed (it's cheap) so the modal
  // can log it to the in-app Logs tab when a user reports "no matches" —
  // the funnel pinpoints whether the charge was filtered as an inflow,
  // collapsed into a transfer, skipped for a meaningless description,
  // dropped by the ownership-window cut-off, or simply too far from the
  // expected payment.
  diagnostics: MortgageDiscoveryDiagnostics;
};

// Why a grouped candidate did or didn't reach the final series list.
//   "kept"              — offered to the user
//   "no-eligible-month" — every month fell outside the ownership window
//                         (before the purchase, or after the sale)
//   "amount-band"       — amount fallback only: not near any expected figure
//   "plausibility"      — an order of magnitude off every expected figure
export type MortgageCandidateOutcome =
  | "kept"
  | "no-eligible-month"
  | "amount-band"
  | "plausibility";

// One grouped charge the scan produced, with the numbers behind the
// keep/drop decision — the unit the modal logs so a "no matches" report
// shows exactly which charges were considered and why each lost.
export type MortgageCandidateDiagnostic = {
  label: string; // a representative bank description (or the amount group)
  suggestedAmount: number; // the group's typical charge magnitude
  monthCount: number; // months in the group before the ownership-window cut
  eligibleMonthCount: number; // months surviving the ownership-window cut
  targetDelta?: number; // distance to the closest expected figure
  synthetic: boolean; // grouped by amount (meaningless description) vs by text
  regularCadence: boolean; // one charge per cadence across the span, no gaps
  coversExpectedWindow: boolean; // spans the whole window since the loan started
  highlyProbable: boolean; // cadence + full window + amount in band — leads its figure
  outcome: MortgageCandidateOutcome;
};

export type MortgageDiscoveryDiagnostics = {
  totalEntries: number; // every entry handed to the walk
  skippedHidden: number; // hidden from the account view
  skippedCollapsed: number; // collapsed into a cross-account transfer
  skippedInflow: number; // a credit, not an outflow
  skippedMeaningless: number; // description normalised too short to group by
  salvagedByAmount: number; // meaningless description rescued by amount group
  outflowEntries: number; // outflows that reached the grouping stage
  groupCount: number; // distinct charge groups formed
  targetAmounts: readonly number[]; // expected figures the loan terms resolved
  tagKeyCount: number; // groups anchored by a company / type tag
  paymentKeyCount: number; // groups anchored by an existing payment
  seed: MortgageDiscoverySeed; // which anchor the walk settled on
  candidates: MortgageCandidateDiagnostic[]; // every group, with its outcome
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
  // The property's purchase date (ISO yyyy-mm-dd), when known. A HARD
  // cut-off: a charge before this date cannot be a payment on this
  // property's mortgage — you can't have paid the loan before you owned the
  // home — so earlier months are dropped outright. A charge with the same
  // bank description before the purchase is the user's *previous* home's
  // mortgage; relying on the amount band to drop it (the assumption being a
  // move changes the loan and the amount) fails when the old and new charge
  // happen to be the same size, so the date filter is what keeps those
  // earlier months out. The surviving months also pick the band CENTRE — the
  // typical charge is the median across the months on or after the purchase,
  // the amount THIS property's loan is paid at. A series with no month on or
  // after the purchase is dropped entirely. Absent ⇒ every month is kept and
  // the centre is the median across all of them.
  fromDate?: string;
  // The property's sold date (ISO yyyy-mm-dd), for a property the user no
  // longer owns. The symmetric HARD cut-off to `fromDate`: a charge after
  // this date cannot be a payment on this property's mortgage — the loan was
  // settled at the sale, and a later same-description charge is the *next*
  // home's mortgage. Months after it are dropped outright, and the expected
  // window `windowCovered` judges completeness against ends at the sale
  // month instead of the account's latest charge (otherwise a past
  // property's series — which correctly stopped at the sale — could never
  // be promoted to "highly probable"). Absent ⇒ the ownership is open-ended.
  toDate?: string;
  // Expected monthly figures the loan terms resolve to — the amortisation,
  // the interest, and/or the two combined. Drive three things: they RANK the
  // matched series (closest to an expected amount first — the amortisation
  // and interest draws are large, predictable amounts, so a charge near one
  // of them is the likeliest real payment), they GATE out the series whose
  // typical charge is an order of magnitude away from every expected figure
  // (see `MORTGAGE_PLAUSIBILITY_FACTOR`) — a 20 kr charge cannot be the
  // payment on a loan whose amortisation + interest runs to thousands a
  // month, however it got anchored, so it is dropped rather than offered —
  // and they ANCHOR the cascade's final tier: when the stricter tag / payment
  // tiers come up empty, every recurring outflow whose typical charge lands
  // within `MORTGAGE_AMOUNT_ANCHOR_TOLERANCE` of an expected figure is offered
  // as a candidate (`seed: "amount"`), so clean payments with no company or
  // type — and a property whose only tagged charge was unrelated noise — still
  // surface straight from the maths. The plausibility gate is generous (a wide
  // factor, not the tight selection band) and the amount tier only exists when
  // the loan terms actually resolve an expected figure — with no terms recorded
  // and nothing tagged the walk reports `seed: "none"`, as before.
  targetAmounts?: readonly number[];
  // Per-target expected schedules, parallel to `targetAmounts` (index 0 the
  // combined figure, then one per mortgage). Each says when the loan(s) backing
  // that figure started being charged (`startDate`) and how often
  // (`cadenceMonths`, 1 = monthly), so the finder can tell how many charges
  // SHOULD exist by now and withhold the "highly probable" promotion from a
  // clean run that covers only part of that window (5 of 8 months). Absent, or
  // a missing entry, ⇒ that target is treated as a monthly charge dated from
  // `fromDate`, so the promotion falls back to its prior "no internal gaps"
  // behaviour.
  targetSchedules?: readonly { startDate?: string; cadenceMonths: number }[];
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

// How close a recurring charge's typical amount must sit to an expected
// monthly figure (the loan's amortisation + interest, per loan or combined)
// to ANCHOR the walk when there is no tag and no existing payment to lean
// on — a tight selection band, not the wide plausibility window above. The
// computed figure uses today's rate and balance while a historical charge
// drifts as the balance amortises and the rate resets, so the band is wide
// enough to absorb that drift yet tight enough that an unrelated outflow of
// a wholly different size isn't mistaken for the mortgage. Only the
// amount-anchored fallback uses it; tagged / payment-seeded walks anchor on
// the metadata and ignore this band.
export const MORTGAGE_AMOUNT_ANCHOR_TOLERANCE = 0.2;

// The minimum number of occurrences a charge must recur over before a clean
// cadence counts as evidence in its own right. Two consecutive draws can line
// up by chance; three or more unbroken on-cadence draws are the signature of a
// standing payment like a mortgage. Below this the `highlyProbable` promotion
// stays off — a too-short run isn't a pattern yet. Counted in occurrences, not
// calendar months, so it applies the same to a quarterly loan.
export const MORTGAGE_RECURRENCE_MIN_MONTHS = 3;

// The smallest gap (in days) between two same-group charges for them to count
// as SEPARATE payments. A mortgage falls due on a fixed day, but a weekend or
// holiday pushes the posting a few days on — far enough that a payment due at
// the end of one month can post in the first days of the next, landing two
// payments in the same calendar month with the month between them empty.
// Grouping strictly by calendar month would then collapse those two genuine
// payments into one (the larger wins) and drop the other, so the finder
// under-counts. Clustering by a day-gap instead keeps both: charges at least
// two weeks apart are distinct payments, while charges closer than that (a
// reversal + repost, an accidental double-draw) are the same payment, with the
// largest standing in for the cluster. Two weeks comfortably separates one
// month's payment from the next (≈28+ days apart) while still folding a
// few-days-apart duplicate together.
export const MORTGAGE_OCCURRENCE_MIN_GAP_DAYS = 14;

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

// Whole months from `a` to `b` ("YYYY-MM" keys); negative when b precedes a.
function monthDiff(a: string, b: string): number {
  const ay = Number(a.slice(0, 4));
  const am = Number(a.slice(5, 7));
  const by = Number(b.slice(0, 4));
  const bm = Number(b.slice(5, 7));
  return (by - ay) * 12 + (bm - am);
}

// Whole days between two ISO "YYYY-MM-DD" dates; negative when b precedes a.
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

// Collapse a group's charges into payment occurrences: a charge that falls
// fewer than `MORTGAGE_OCCURRENCE_MIN_GAP_DAYS` after the previous one is the
// same payment (a reversal + repost, an accidental double-draw), so the larger
// outflow stands in for the cluster; a charge at least that far on is the next
// payment and survives on its own — even when a weekend pushed it across a
// month boundary so it shares a calendar month with that month's own charge.
// Returns one representative entry per occurrence, in date order. The
// representative keeps the most-negative ("largest") amount, matching the
// per-month winner this replaces.
function clusterOccurrences(charges: readonly HistoryEntry[]): HistoryEntry[] {
  if (charges.length === 0) return [];
  const sorted = [...charges].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const occurrences: HistoryEntry[] = [];
  let rep = sorted[0];
  let prevDate = sorted[0].date;
  for (let i = 1; i < sorted.length; i += 1) {
    const e = sorted[i];
    if (dayDiff(prevDate, e.date) >= MORTGAGE_OCCURRENCE_MIN_GAP_DAYS) {
      occurrences.push(rep);
      rep = e;
    } else if (e.amount < rep.amount) {
      rep = e; // larger outflow stands in for the cluster
    }
    prevDate = e.date;
  }
  occurrences.push(rep);
  return occurrences;
}

// True when a chronological list of "YYYY-MM" keys recurs on a fixed cadence
// (a charge every `cadence` months) with no gaps, over at least
// `MORTGAGE_RECURRENCE_MIN_MONTHS` occurrences. For the default monthly cadence
// this means one charge in every calendar month; a quarterly loan (cadence 3)
// wants a charge every third month.
function cadenceRegular(
  monthKeys: readonly string[],
  cadence: number,
): boolean {
  if (monthKeys.length < MORTGAGE_RECURRENCE_MIN_MONTHS) return false;
  for (let i = 1; i < monthKeys.length; i += 1) {
    if (monthDiff(monthKeys[i - 1], monthKeys[i]) !== cadence) return false;
  }
  return true;
}

// True when a series' charge count reaches the number expected since the loan
// started — the cadence slots from `startMonth` to `latestMonth` inclusive,
// allowing one missing slot for a charge that hasn't posted yet. `latestMonth`
// is the most recent outflow the account has seen (ordinary spending recurs
// every month, so it tracks how current the data is, independent of any one
// charge). When the start or the data window is unknown there is nothing to
// measure against, so it can't demote — returns true, and the promotion falls
// back to the cadence check alone.
function windowCovered(
  observedCount: number,
  startMonth: string | undefined,
  latestMonth: string | undefined,
  cadence: number,
): boolean {
  if (!startMonth || !latestMonth) return true;
  const windowMonths = Math.max(0, monthDiff(startMonth, latestMonth));
  const expectedCount = Math.floor(windowMonths / cadence) + 1;
  return observedCount >= expectedCount - 1;
}

// The grouping key the finder buckets a charge's months under. The shared
// `normaliseDescription` deliberately keeps short (1–3 digit) standalone
// numbers — a store number can carry meaning elsewhere — but a mortgage
// auto-giro reference like "Avibetalning 9120-3273663" survives normalisation
// as "avibetalning 91", and because the reference differs every month
// ("…84", "…10", …) each month lands in its OWN group and the charge never
// coalesces into a recurring series. The finder doesn't care about reference
// numbers, so it strips every standalone digit run on top of the shared
// normaliser: "Avibetalning 9120-3273663" and "Avibetalning 8473-1192834"
// both collapse to "avibetalning", grouping all the months together, while
// genuinely distinct text ("Bolån amortering" vs "Bolån ränta") still keys
// apart. A description that is nothing but a reference number normalises to
// empty here and is handled by the amount-group salvage instead.
function financeGroupKey(description: string): string {
  return normaliseDescription(description)
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

// A zero-valued diagnostics record — the result a caller returns before any
// scan runs (no property bound, no account). Keeps `diagnostics` required on
// the result so every code path that reads it is type-safe.
export function emptyMortgageDiagnostics(): MortgageDiscoveryDiagnostics {
  return {
    totalEntries: 0,
    skippedHidden: 0,
    skippedCollapsed: 0,
    skippedInflow: 0,
    skippedMeaningless: 0,
    salvagedByAmount: 0,
    outflowEntries: 0,
    groupCount: 0,
    targetAmounts: [],
    tagKeyCount: 0,
    paymentKeyCount: 0,
    seed: "none",
    candidates: [],
  };
}

// The synthetic group an amount-only charge belongs to: the expected figure
// it sits closest to, when that figure is within the anchor band — else
// null, so a meaningless-description charge of an unrelated size is left out
// rather than lumped in. This is what lets the amount fallback rescue a
// recurring mortgage transfer whose bank text is just "Överföring" or a bare
// reference number — there's no merchant identity to group by, so the maths
// (the expected monthly figure) does the grouping instead. Returns null when
// no terms resolved, so a tag/payment walk never grows synthetic groups.
function nearestTargetKey(
  amount: number,
  targetAmounts: readonly number[],
): string | null {
  const magnitude = Math.abs(amount);
  let bestIdx = -1;
  let bestDelta = Infinity;
  targetAmounts.forEach((target, i) => {
    const delta = relativeDelta(magnitude, target);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIdx = i;
    }
  });
  if (bestIdx < 0 || bestDelta > MORTGAGE_AMOUNT_ANCHOR_TOLERANCE) return null;
  return `~amount:${bestIdx}`;
}

// The grouped view of the account's outflows that the scan phase hands to
// the candidate builder.
type ChargeGroups = {
  // The payment occurrences for each group, in date order: each group's
  // charges (the entries whose normalised description — or, for a meaningless
  // one, its amount group — matches) clustered by `clusterOccurrences`, so two
  // charges a weekend apart in the same calendar month both survive as
  // separate payments while a few-days-apart double-draw folds into one.
  // Tracked across the FULL history so a single tagged month can pull in every
  // other month of the same charge.
  byKey: Map<string, HistoryEntry[]>;
  labelByKey: Map<string, string>;
  // Keys grouped by amount rather than by description text — they only ever
  // feed the amount fallback (a meaningless description can't carry a tag).
  syntheticKeys: Set<string>;
  // Description keys anchored by a company / type tag, and by an existing
  // payment, kept apart so tags win when both are present.
  tagKeys: Set<string>;
  paymentKeys: Set<string>;
  // The most recent month any outflow lands in — how current the account's
  // data is. Ordinary spending recurs every month, so a mortgage that stopped
  // a few months ago shows up as a series whose last month falls short of
  // this, which `windowCovered` reads to demote it from "highly probable".
  latestOutflowMonth: string | undefined;
};

// Scan phase: walk the account's history once, dropping the entries that
// cannot be a mortgage charge (hidden, collapsed into a transfer, inflows),
// bucketing the rest into per-description charge groups — falling back to
// amount groups for meaningless descriptions — and resolving which groups a
// company / type tag or an existing payment anchors. Stamps the scan-funnel
// and group counters on `diag` as it goes.
function scanChargeGroups(
  input: MortgageDiscoveryInput,
  targetAmounts: readonly number[],
  diag: MortgageDiscoveryDiagnostics,
): ChargeGroups {
  const { entries, mortgageTypeId } = input;
  const companyIds = new Set(input.companyIds ?? []);
  const seedEntryIds = new Set(input.seedEntryIds ?? []);
  const ruleCache = newRuleMatchCache();

  const byKeyCharges = new Map<string, HistoryEntry[]>();
  const labelByKey = new Map<string, string>();
  const syntheticKeys = new Set<string>();
  const tagKeys = new Set<string>();
  const paymentKeys = new Set<string>();
  let latestOutflowMonth: string | undefined;

  for (const entry of entries) {
    if (entry.hidden) {
      diag.skippedHidden++;
      continue;
    }
    if (entry.collapsedIntoTransferId) {
      diag.skippedCollapsed++;
      continue;
    }
    if (entry.amount >= 0) {
      diag.skippedInflow++; // outflows only
      continue;
    }
    diag.outflowEntries++;

    const outflowMonth = entry.date.slice(0, 7);
    if (!latestOutflowMonth || outflowMonth > latestOutflowMonth)
      latestOutflowMonth = outflowMonth;

    const textKey = financeGroupKey(entry.description);
    let key: string;
    let synthetic: boolean;
    if (isNormalisedKeyMeaningful(textKey)) {
      key = textKey;
      synthetic = false;
    } else {
      // No usable merchant text. Salvage it for the amount fallback by
      // grouping on the closest expected figure, or drop it when none is near.
      diag.skippedMeaningless++;
      const salvaged = nearestTargetKey(entry.amount, targetAmounts);
      if (salvaged === null) continue;
      diag.salvagedByAmount++;
      key = salvaged;
      synthetic = true;
    }

    let charges = byKeyCharges.get(key);
    if (!charges) {
      charges = [];
      byKeyCharges.set(key, charges);
      if (synthetic) syntheticKeys.add(key);
      if (entry.description.trim()) labelByKey.set(key, entry.description);
    }
    charges.push(entry);

    // Synthetic (amount-grouped) keys never anchor on a tag or an existing
    // payment — a meaningless description carries no merchant identity, so the
    // amount fallback is the only signal they offer. Resolve tags / payment
    // seeds for the text-grouped charges only.
    if (synthetic) continue;

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

  // Collapse each group's raw charges into payment occurrences now that the
  // whole history has been seen — a weekend-slipped charge sharing a calendar
  // month with the next payment survives as its own occurrence rather than
  // being thrown away by a one-per-month winner.
  const byKey = new Map<string, HistoryEntry[]>();
  for (const [key, charges] of byKeyCharges)
    byKey.set(key, clusterOccurrences(charges));

  diag.groupCount = byKey.size;
  diag.tagKeyCount = tagKeys.size;
  diag.paymentKeyCount = paymentKeys.size;

  return {
    byKey,
    labelByKey,
    syntheticKeys,
    tagKeys,
    paymentKeys,
    latestOutflowMonth,
  };
}

// Candidate-building phase: judge every anchored group — and, whenever the
// loan terms resolve an expected figure, every group — against the
// ownership-window cut, the typical-amount centring, the cadence and
// window-coverage checks, the amount band (amount-only groups), and the
// plausibility gate, recording each group's keep/drop decision on `diag`
// and emitting the kept ones as series. `highlyProbable` starts false on
// every series; `promoteHighlyProbable` decides it in a second pass.
function buildCandidateSeries(
  groups: ChargeGroups,
  input: MortgageDiscoveryInput,
  targetAmounts: readonly number[],
  diag: MortgageDiscoveryDiagnostics,
): {
  series: MortgagePaymentSeries[];
  candidateByKey: Map<string, MortgageCandidateDiagnostic>;
  targetIndexByKey: Map<string, number>;
} {
  const { fromDate, toDate } = input;
  const {
    byKey,
    labelByKey,
    syntheticKeys,
    tagKeys,
    paymentKeys,
    latestOutflowMonth,
  } = groups;

  const hasTargets = targetAmounts.length > 0;
  const maxPlausibleDelta =
    (MORTGAGE_PLAUSIBILITY_FACTOR - 1) / MORTGAGE_PLAUSIBILITY_FACTOR;

  const candidateByKey = new Map<string, MortgageCandidateDiagnostic>();
  // The expected-figure index each kept series sits closest to — the bucket the
  // "highly probable" promotion picks one winner from (best per figure).
  const targetIndexByKey = new Map<string, number>();

  // The candidate pool. Every tagged / payment-seeded group is a candidate;
  // and whenever the loan terms resolve an expected figure, so is every other
  // outflow (the amount tier), winnowed to those near a figure by the band.
  // The tiers don't compete in a winner-takes-all cascade — they're all
  // surfaced and RANKED by strictness below, so a stray unrelated tag (a card
  // fee billed by the same bank that holds the mortgage) can't shadow the real
  // payment: the fee is dropped as implausible and the maths-found charge
  // still appears. tag / payment keys are a subset of `byKey`, so when the loan
  // resolves a figure the union is simply every group.
  const candidateKeys = hasTargets
    ? [...byKey.keys()]
    : [...new Set([...tagKeys, ...paymentKeys])];

  const series: MortgagePaymentSeries[] = [];
  for (const key of candidateKeys) {
    const occurrences = byKey.get(key);
    if (!occurrences || occurrences.length === 0) continue;
    const tagged = tagKeys.has(key);
    const seeded = !tagged && paymentKeys.has(key);
    // A group surfaced purely by its amount — not tagged, not a payment seed.
    const amountOnly = !tagged && !seeded;
    const keyAnchor: MortgagePaymentSeries["anchor"] = tagged
      ? "tag"
      : seeded
        ? "payment"
        : "amount";

    // Occurrences come from `clusterOccurrences` already in date order.
    // Keep only the ones whose charge falls inside the ownership window —
    // on or after the purchase date and on or before the sold date. A payment
    // can't predate ownership, and an earlier (or, once sold, later) home's
    // same-description charge is the previous / next property's mortgage, not
    // a payment on this one. The survivors also centre the band: the typical
    // charge is the median across them. With neither bound we keep every
    // occurrence. A series left with no surviving payment is dropped outright.
    const eligibleOccurrences =
      fromDate !== undefined || toDate !== undefined
        ? occurrences.filter((e) => {
            if (fromDate !== undefined && e.date < fromDate) return false;
            if (toDate !== undefined && e.date > toDate) return false;
            return true;
          })
        : occurrences;
    const monthKeysOf = (es: readonly HistoryEntry[]) =>
      es.map((e) => e.date.slice(0, 7));
    const amountsFor = (es: readonly HistoryEntry[]) =>
      es.map((e) => Math.abs(e.amount));
    // Centres on the eligible payments; with none eligible it's computed across
    // all of them purely for the diagnostic record.
    const suggestedAmount = median(
      amountsFor(
        eligibleOccurrences.length > 0 ? eligibleOccurrences : occurrences,
      ),
    );
    let targetDelta: number | undefined;
    let targetIndex: number | undefined;
    targetAmounts.forEach((target, i) => {
      const delta = relativeDelta(suggestedAmount, target);
      if (targetDelta === undefined || delta < targetDelta) {
        targetDelta = delta;
        targetIndex = i;
      }
    });

    // The cadence + window this series is judged against: the schedule of the
    // expected figure it sits closest to (`targetIndex`), falling back to a
    // monthly charge dated from the purchase when the caller passes no
    // per-target schedule. `cadenceMonths` lets a quarterly loan count its
    // charges every third month instead of every month.
    const schedule =
      targetIndex !== undefined
        ? input.targetSchedules?.[targetIndex]
        : undefined;
    const cadence = Math.max(1, Math.round(schedule?.cadenceMonths ?? 1));
    const startMonth = (schedule?.startDate ?? fromDate)?.slice(0, 7);

    // Recurs on its cadence with no gaps, over enough occurrences to be a
    // pattern (`MORTGAGE_RECURRENCE_MIN_MONTHS`).
    const eligibleMonthKeys = monthKeysOf(eligibleOccurrences);
    const spanMonths = spanOfMonths(eligibleMonthKeys);
    const regularCadence = cadenceRegular(eligibleMonthKeys, cadence);
    // Spans the whole window the loan has been active — from its start (the
    // loan-start date, or the purchase) to the latest charge the account has
    // seen — at that cadence. A charge that recurs cleanly but covers only, say,
    // 5 of the 8 months expected since the loan began (started late, or has
    // since stopped) is regular but NOT complete, so it isn't promoted. For a
    // sold property the loan was active only until the sale, so the window
    // ends at the sale month rather than the account's latest charge.
    const soldMonth = toDate?.slice(0, 7);
    const windowEndMonth =
      soldMonth !== undefined &&
      (latestOutflowMonth === undefined || soldMonth < latestOutflowMonth)
        ? soldMonth
        : latestOutflowMonth;
    const coversExpectedWindow = windowCovered(
      eligibleOccurrences.length,
      startMonth,
      windowEndMonth,
      cadence,
    );
    const synthetic = syntheticKeys.has(key);

    // Amount-only groups are EVERY outflow in the account; keep only the ones
    // whose typical charge lands near an expected figure, and don't even record
    // the rest — they're noise, not mortgage candidates, and would bury the
    // real ones in the diagnostics. Tagged / payment-seeded groups bypass the
    // band (their anchor is the metadata, not the maths) but still face the
    // plausibility gate below.
    if (
      amountOnly &&
      (targetDelta === undefined ||
        targetDelta > MORTGAGE_AMOUNT_ANCHOR_TOLERANCE)
    )
      continue;

    // `highlyProbable` is decided in a second pass below — at most one charge
    // per expected figure earns it — so it starts false here.
    const cand: MortgageCandidateDiagnostic = {
      label: labelByKey.get(key) ?? key,
      suggestedAmount,
      monthCount: occurrences.length,
      eligibleMonthCount: eligibleOccurrences.length,
      synthetic,
      regularCadence,
      coversExpectedWindow,
      highlyProbable: false,
      outcome: "kept",
      ...(targetDelta !== undefined ? { targetDelta } : {}),
    };
    candidateByKey.set(key, cand);
    diag.candidates.push(cand);
    if (targetIndex !== undefined) targetIndexByKey.set(key, targetIndex);

    if (eligibleOccurrences.length === 0) {
      cand.outcome = "no-eligible-month";
      continue;
    }
    // Plausibility: an order of magnitude off every expected figure can't be
    // the mortgage, however it got anchored.
    if (targetDelta !== undefined && targetDelta > maxPlausibleDelta) {
      cand.outcome = "plausibility";
      continue;
    }
    series.push({
      key,
      label: labelByKey.get(key) ?? key,
      suggestedAmount,
      spanMonths,
      months: eligibleOccurrences.map((e) => ({
        monthKey: e.date.slice(0, 7),
        date: e.date,
        amount: Math.abs(e.amount),
        entryId: e.id,
      })),
      anchor: keyAnchor,
      regularCadence,
      // Promoted in the second pass below.
      highlyProbable: false,
      ...(targetDelta !== undefined ? { targetDelta } : {}),
    });
  }

  return { series, candidateByKey, targetIndexByKey };
}

// Strictness order of the anchor tiers — a tagged charge leads, then a
// payment-seeded one, then an amount-only match.
function anchorRank(a: MortgagePaymentSeries["anchor"]): number {
  return a === "tag" ? 0 : a === "payment" ? 1 : 2;
}

// Promote the standout candidate per expected figure to "highly probable":
// among the kept series whose amount, cadence, and full-window coverage all
// match a given target, the strongest one earns it — chosen by the same
// strictness-then-closeness order the final ranking uses, so a charge the
// user tagged still wins over a marginally-closer untagged one. Going
// best-per-figure (not a single global winner) lets a property paid as one
// draw PER loan light up each loan's charge, while a property paid as one
// combined charge lights up only that — and a second clean-but-wrong charge
// sitting near the same figure (the screenshot's incomplete 5-of-8-months
// run) never also lights up, because it either loses to the stronger charge
// or fails the window check outright.
function promoteHighlyProbable(
  series: readonly MortgagePaymentSeries[],
  candidateByKey: ReadonlyMap<string, MortgageCandidateDiagnostic>,
  targetIndexByKey: ReadonlyMap<string, number>,
): void {
  const bestByTarget = new Map<number, MortgagePaymentSeries>();
  for (const s of series) {
    const cand = candidateByKey.get(s.key);
    const eligible =
      cand !== undefined &&
      !cand.synthetic &&
      s.regularCadence &&
      cand.coversExpectedWindow &&
      s.targetDelta !== undefined &&
      s.targetDelta <= MORTGAGE_AMOUNT_ANCHOR_TOLERANCE;
    if (!eligible) continue;
    const ti = targetIndexByKey.get(s.key);
    if (ti === undefined) continue;
    const best = bestByTarget.get(ti);
    const stronger =
      !best ||
      anchorRank(s.anchor) < anchorRank(best.anchor) ||
      (anchorRank(s.anchor) === anchorRank(best.anchor) &&
        (s.targetDelta! < best.targetDelta! ||
          (s.targetDelta === best.targetDelta &&
            s.suggestedAmount > best.suggestedAmount)));
    if (stronger) bestByTarget.set(ti, s);
  }
  for (const s of bestByTarget.values()) {
    s.highlyProbable = true;
    const cand = candidateByKey.get(s.key);
    if (cand) cand.highlyProbable = true;
  }
}

export function discoverMortgagePayments(
  input: MortgageDiscoveryInput,
): MortgageDiscoveryResult {
  const targetAmounts = (input.targetAmounts ?? []).filter((a) => a > 0);

  const diag = emptyMortgageDiagnostics();
  diag.totalEntries = input.entries.length;
  diag.targetAmounts = targetAmounts;

  const groups = scanChargeGroups(input, targetAmounts, diag);
  const { series, candidateByKey, targetIndexByKey } = buildCandidateSeries(
    groups,
    input,
    targetAmounts,
    diag,
  );
  promoteHighlyProbable(series, candidateByKey, targetIndexByKey);

  // Rank a HIGHLY PROBABLE charge first — a complete on-cadence recurrence + a
  // matching amount + stable text is a surer signal that a charge is the
  // mortgage than any single tag, so it trumps the tag / company anchor and
  // leads the list.
  // Below that, rank by STRICTNESS — a charge the user tagged (or already
  // recorded a payment for) is a surer bet than one matched only by its amount,
  // so it leads even when an amount-only charge sits a hair closer to the
  // expected figure. Within a strictness tier, the charge whose amount lines up
  // with the maths leads (closest `targetDelta` first); with no expected figure
  // at all, the largest typical charge leads so the amortisation draw beats the
  // interest draw when a loan is paid in two.
  series.sort((a, b) => {
    if (a.highlyProbable !== b.highlyProbable) return a.highlyProbable ? -1 : 1;
    const byStrictness = anchorRank(a.anchor) - anchorRank(b.anchor);
    if (byStrictness !== 0) return byStrictness;
    if (a.targetDelta !== undefined && b.targetDelta !== undefined)
      return a.targetDelta - b.targetDelta;
    if (a.targetDelta !== undefined) return -1;
    if (b.targetDelta !== undefined) return 1;
    return b.suggestedAmount - a.suggestedAmount;
  });

  // The reported seed is the tier of the LEADING surfaced series — what the
  // user is actually being shown — falling back to the strongest signal merely
  // attempted when nothing survived, for the empty-state nudge.
  const attemptedSeed: MortgageDiscoverySeed =
    groups.tagKeys.size > 0
      ? "tags"
      : groups.paymentKeys.size > 0
        ? "payments"
        : targetAmounts.length > 0
          ? "amount"
          : "none";
  const seed: MortgageDiscoverySeed =
    series.length > 0
      ? series[0].anchor === "tag"
        ? "tags"
        : series[0].anchor === "payment"
          ? "payments"
          : "amount"
      : attemptedSeed;
  diag.seed = seed;
  return { series, seed, diagnostics: diag };
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
