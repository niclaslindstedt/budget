// Pure detector for recurring patterns in imported bank-statement
// history. Buckets entries by normalised description, then ranks each
// bucket by cadence regularity, amount consistency, and occurrence
// count. The output is a list of `RecurringCandidate`s the UI surfaces
// in a side-panel so the user can one-click-promote them into a real
// recurring budget series.
//
// Pure: no React, no localStorage, no side effects. The whole module
// is fed history entries and a dismissal allowlist, and emits a sorted
// list of candidates. Promotion itself happens at the reducer level —
// this module does not generate the future dates (it suggests a
// cadence; the reducer feeds that into `expandRecurrence`).

import {
  isNormalisedKeyMeaningful,
  normaliseDescription,
} from "./description-normaliser";
import type { HistoryEntry } from "./types";

// Cadence kinds the detector recognises. Each maps to a
// `RecurrenceRule` the reducer can hand to `expandRecurrence`.
export type DetectedCadenceKind =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export type DetectedCadence = {
  kind: DetectedCadenceKind;
  // Median days between consecutive occurrences. Used for the
  // `intervalDays` payload on weekly / biweekly cadences and for
  // confidence scoring.
  medianGapDays: number;
  // For monthly / quarterly / yearly cadences: the typical day-of-
  // month of an occurrence. Undefined for the day-based cadences.
  dayOfMonth?: number;
};

export type RecurringCandidate = {
  // Stable key (the normalised description) so the UI can route a
  // dismissal back to the dismissal list without depending on entry
  // ids that change between imports.
  key: string;
  // Original-case representative description, picked from the most
  // recent occurrence so the user sees a real string from their bank.
  description: string;
  // Signed median amount (a salary lands positive, Spotify negative).
  medianAmount: number;
  cadence: DetectedCadence;
  occurrenceCount: number;
  // 0..1 score combining cadence regularity, amount stability, and
  // occurrence count. The UI sorts by this descending.
  confidence: number;
  firstDate: string;
  lastDate: string;
  // Ids of the history entries that contributed, in chronological
  // order. Used for traceability in the panel preview and (later) for
  // a "show source rows" affordance.
  sampleEntryIds: string[];
};

// Heuristics: a recurring pattern needs at least this many occurrences
// to be considered. Two charges could be coincidence; three starts to
// look like a habit. The brief calls out monthly Spotify and biweekly
// salary, both of which clear this bar after a few months of data.
const MIN_OCCURRENCES = 3;

// Minimum confidence a candidate must clear before being surfaced.
// Anything below this drops off the panel entirely so the user isn't
// drowning in low-quality suggestions on the first import.
const MIN_CONFIDENCE = 0.45;

export type DetectInput = {
  entries: readonly HistoryEntry[];
  // Normalised keys the user has previously dismissed with "Not
  // recurring". Detection skips them so noise doesn't keep coming
  // back on every import.
  dismissedKeys?: ReadonlySet<string>;
  // Reference date for the "is this still active?" guard. The UI
  // passes today's ISO so a one-off subscription that ended last year
  // doesn't keep nagging.
  referenceDate?: string;
  // Maximum days since the last occurrence for a candidate to be
  // considered "active". Defaults to ~3× the median cadence so a
  // missed month doesn't drop a yearly insurance off the panel.
  staleAfterFactor?: number;
};

export function detectRecurringCandidates(
  input: DetectInput,
): RecurringCandidate[] {
  const dismissed = input.dismissedKeys ?? new Set<string>();
  const referenceDate = input.referenceDate ?? todayIso();
  const staleAfterFactor = input.staleAfterFactor ?? 3;

  // Bucket by normalised description, ignoring entries the user has
  // shelved (hidden: true) or already collapsed into a transaction —
  // both of those carry no signal for "this is recurring".
  const buckets = new Map<string, HistoryEntry[]>();
  for (const entry of input.entries) {
    if (entry.hidden) continue;
    if (entry.collapsedIntoTransactionId) continue;
    const key = normaliseDescription(entry.description);
    if (!isNormalisedKeyMeaningful(key)) continue;
    if (dismissed.has(key)) continue;
    const list = buckets.get(key);
    if (list) list.push(entry);
    else buckets.set(key, [entry]);
  }

  const out: RecurringCandidate[] = [];
  for (const [key, bucketRaw] of buckets) {
    if (bucketRaw.length < MIN_OCCURRENCES) continue;
    const bucket = [...bucketRaw].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );

    const gaps: number[] = [];
    for (let i = 1; i < bucket.length; i++) {
      gaps.push(daysBetween(bucket[i - 1].date, bucket[i].date));
    }
    const medianGap = median(gaps);
    if (!Number.isFinite(medianGap) || medianGap <= 0) continue;

    const cadenceKind = classifyCadence(medianGap);
    if (!cadenceKind) continue;

    const amounts = bucket.map((e) => e.amount);
    const medianAmount = median(amounts);

    // Skip suggestions that are mostly zero (interest-free statements,
    // empty reversals); the panel would render a row that promotes to
    // a zero-amount series, which is pointless.
    if (Math.abs(medianAmount) < 0.005) continue;

    // Active-window guard: latest occurrence must be recent relative
    // to the cadence. Three medians of headroom keeps a "missed one
    // month" pattern around without flagging a long-dead subscription.
    const daysSinceLast = daysBetween(
      bucket[bucket.length - 1].date,
      referenceDate,
    );
    if (daysSinceLast > medianGap * staleAfterFactor) continue;

    const gapVariance = relativeStdDev(gaps, medianGap);
    const amountVariance = relativeStdDev(
      amounts.map(Math.abs),
      Math.abs(medianAmount),
    );
    const confidence = scoreConfidence({
      occurrenceCount: bucket.length,
      gapVariance,
      amountVariance,
    });
    if (confidence < MIN_CONFIDENCE) continue;

    const cadence: DetectedCadence = {
      kind: cadenceKind,
      medianGapDays: medianGap,
    };
    if (
      cadenceKind === "monthly" ||
      cadenceKind === "quarterly" ||
      cadenceKind === "yearly"
    ) {
      cadence.dayOfMonth = medianDayOfMonth(bucket.map((e) => e.date));
    }

    out.push({
      key,
      // Pick the latest occurrence's description as the representative
      // so the user sees their bank's most recent rendering of the
      // name (which is also what `description` lookups against the
      // hint store will round-trip on the next import).
      description: bucket[bucket.length - 1].description,
      medianAmount,
      cadence,
      occurrenceCount: bucket.length,
      confidence,
      firstDate: bucket[0].date,
      lastDate: bucket[bucket.length - 1].date,
      sampleEntryIds: bucket.map((e) => e.id),
    });
  }

  out.sort((a, b) => b.confidence - a.confidence);
  return out;
}

function classifyCadence(medianGapDays: number): DetectedCadenceKind | null {
  // Each band is generous on the lower side and conservative on the
  // upper side: a paycheck that lands a few days early some months
  // stays "biweekly", but a quarterly bill never gets confused for a
  // monthly one.
  if (medianGapDays >= 5 && medianGapDays <= 9) return "weekly";
  if (medianGapDays >= 12 && medianGapDays <= 17) return "biweekly";
  if (medianGapDays >= 25 && medianGapDays <= 35) return "monthly";
  if (medianGapDays >= 80 && medianGapDays <= 100) return "quarterly";
  if (medianGapDays >= 340 && medianGapDays <= 380) return "yearly";
  return null;
}

function scoreConfidence(input: {
  occurrenceCount: number;
  gapVariance: number;
  amountVariance: number;
}): number {
  // Occurrence score: 3 → 0.5, 6 → 0.83, 12+ → 1.0. Plateaus past a
  // year so a five-year-old gym fee doesn't dwarf a six-month signal.
  const occScore = Math.min(1, input.occurrenceCount / 12);

  // Gap variance: a relative stddev of 0 → 1.0, 0.5 → ~0.5, 1+ → 0.
  // Salaries that always land on the 25th score near 1; spotty
  // subscriptions that bounce around hit the floor.
  const gapScore = Math.max(0, 1 - input.gapVariance);

  // Amount variance: a Spotify charge that's always 119 kr → 1.0;
  // utility bills that swing 30% scores ~0.7.
  const amountScore = Math.max(0, 1 - input.amountVariance);

  // Weighted average — gap regularity is the strongest signal that
  // "this is on a schedule", amount stability is a tiebreaker, and
  // occurrence count is the credibility prior.
  return gapScore * 0.5 + amountScore * 0.25 + occScore * 0.25;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function relativeStdDev(values: readonly number[], reference: number): number {
  if (values.length === 0 || reference === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / values.length;
  const stddev = Math.sqrt(variance);
  return stddev / Math.abs(reference);
}

function medianDayOfMonth(isoDates: readonly string[]): number {
  const days = isoDates
    .map((d) => Number(d.slice(8, 10)))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 31);
  if (days.length === 0) return 1;
  const m = median(days);
  return Math.max(1, Math.min(28, Math.round(m)));
}

function daysBetween(aIso: string, bIso: string): number {
  const a = parseIso(aIso);
  const b = parseIso(bIso);
  if (a === null || b === null) return 0;
  return Math.round((b - a) / 86_400_000);
}

function parseIso(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  return Date.UTC(y, m - 1, d);
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
