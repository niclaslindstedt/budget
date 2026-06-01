// Explorative salary detector for the guided "Find salaries" walk. Where
// `detection.ts` scores budget-ledger rows the user has already typed,
// this scans an account's imported bank HISTORY from the earliest entry
// forward and recovers likely paychecks — even years back, where the
// newest-first metadata pass never reached and nothing was ever tagged.
//
// The trigger for the walk is the absence of top-level `Salary` objects,
// NOT the absence of tagged transactions: a salary-typed history entry
// only BOOSTS confidence here, it is never required and never limits the
// scan. Past-only by construction — every candidate is backed by a real
// deposit, so no future month is ever synthesised (gross/tax aren't
// known ahead of the money landing).
//
// Pure: fed an account's history + a dedupe set, emits chronological
// candidates. Reuses `detectRecurringCandidates` for the cadence /
// regularity scoring and `assignEmployerGroups` for the job-change /
// raise segmentation so the history path and the budget path segment
// identically.

import { detectRecurringCandidates } from "../budget/recurring-detection";
import {
  isNormalisedKeyMeaningful,
  normaliseDescription,
} from "../description-normaliser";
import { assignEmployerGroups, withinSalaryTolerance } from "./detection";
import { SALARY_TYPE_ID } from "./salary";
import type { HistoryEntry } from "../types";
import { todayIso } from "../../utils/date";

export type DiscoveredSalary = {
  monthKey: string; // "YYYY-MM"
  year: string; // "YYYY" — drives the per-year stepping
  date: string; // the winning deposit's date
  net: number; // the deposit that landed (netto)
  // The winning entry's bank description, so the user can eyeball whether
  // this is really the salary deposit. Falls back to the user-added
  // description when the bank text is empty (e.g. a manually-entered
  // history row carries only `userDescription`).
  description: string;
  sourceHistoryId: string; // the HistoryEntry this was discovered from
  confidence: number; // 0..1
  // Job-change segment index (same contract as `SalaryCandidate`):
  // consecutive months that hold steady share an index, a sustained
  // jump starts a new one.
  employerGroup: number;
  // The expected paycheck for this candidate's segment (the segment's
  // median net). Drives the "off-average — edit me" hinting in the UI.
  baselineNet: number;
  // True when the underlying bank entry is already typed as salary
  // (per-entry `userTypeId` or a salary-typed split). A confidence
  // signal only — never a requirement.
  typedSalary: boolean;
};

export type DiscoveryResult = {
  candidates: DiscoveredSalary[]; // chronological (oldest first)
  // Candidate indices where a new employer group starts (always
  // includes 0 when there is at least one candidate).
  boundaries: number[];
  // The subset of `boundaries` whose new level is a sustained increase —
  // a raise — rather than a drop or a job change to lower pay. Lets the
  // walk label the transition "Raise" instead of "new employer".
  raises: number[];
  // Median net per year — seeds the per-year baseline-confirm step.
  baselineByYear: Map<string, number>;
};

// One pay cluster: a contiguous stretch of months that held roughly one
// pay level. The boundary into a cluster is a sustained step — a rise
// (a raise / title change) or a drop / sideways move (usually a new
// employer, since an employer can't permanently cut your pay). Averaging
// the whole history hides these; the cluster list surfaces them.
export type SalaryCluster = {
  startMonthKey: string; // "YYYY-MM" — first paycheck in the cluster
  endMonthKey: string; // "YYYY-MM" — last paycheck in the cluster
  // Calendar span start→end inclusive, in whole months (counts any
  // skipped months in between, so it reads as a real tenure length).
  spanMonths: number;
  // Detected paychecks in the cluster (≤ spanMonths when months were
  // missed in the imported history).
  paycheckCount: number;
  // The cluster's typical net — the segment median. This is the SAME
  // baseline that flags an individual month as "off" (a light month is
  // likely vacation / sick / unpaid leave; a heavy one a bonus), so the
  // list and the per-month flag share one source of truth.
  baselineNet: number;
  // How this cluster began relative to the one before it. "start" is the
  // first cluster; "raise" is a sustained step up; "change" is a drop or
  // sideways move (a likely new employer).
  transition: "start" | "raise" | "change";
};

// Roll the per-month candidates up into the clusters between pay changes.
// Pure view over a `DiscoveryResult` — the segmentation was already done
// by `assignEmployerGroups`; this just measures each segment.
export function summariseSalaryClusters(
  result: Pick<DiscoveryResult, "candidates" | "boundaries" | "raises">,
): SalaryCluster[] {
  const { candidates, boundaries, raises } = result;
  if (candidates.length === 0) return [];
  const raiseSet = new Set(raises);
  const clusters: SalaryCluster[] = [];
  for (let b = 0; b < boundaries.length; b++) {
    const startIdx = boundaries[b];
    const endIdx =
      b + 1 < boundaries.length ? boundaries[b + 1] - 1 : candidates.length - 1;
    const start = candidates[startIdx];
    const end = candidates[endIdx];
    clusters.push({
      startMonthKey: start.monthKey,
      endMonthKey: end.monthKey,
      spanMonths: monthSpan(start.monthKey, end.monthKey),
      paycheckCount: endIdx - startIdx + 1,
      // Every member of a segment carries that segment's baseline.
      baselineNet: start.baselineNet,
      transition:
        b === 0 ? "start" : raiseSet.has(startIdx) ? "raise" : "change",
    });
  }
  return clusters;
}

// Inclusive whole-month distance between two "YYYY-MM" keys.
function monthSpan(start: string, end: string): number {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  return (ey - sy) * 12 + (em - sm) + 1;
}

export type DiscoveryInput = {
  // The chosen account's full imported history (`data.history[id]`).
  entries: readonly HistoryEntry[];
  // History entry ids already turned into top-level `Salary` objects —
  // their months are skipped so the same paycheck isn't offered twice.
  excludeHistoryIds?: ReadonlySet<string>;
  referenceDate?: string;
};

// A recurring deposit counts as part of the salary family when it's at
// least half the largest recurring deposit. A job change or a raise
// stays comfortably in this band; small steady inflows (child benefit,
// a fixed savings transfer) fall out so they don't masquerade as pay.
const SALARY_BAND = 0.5;

// The description shown for a discovered paycheck: the raw bank text when
// present, otherwise the user-added description (a manually-entered
// history row may carry only `userDescription`).
function displayDescription(entry: HistoryEntry): string {
  if (entry.description.trim()) return entry.description;
  const user = entry.userDescription?.trim();
  return user ? entry.userDescription! : entry.description;
}

function entryTypedAsSalary(entry: HistoryEntry): boolean {
  if (entry.userTypeId === SALARY_TYPE_ID) return true;
  if (entry.splits?.some((s) => s.typeId === SALARY_TYPE_ID)) return true;
  return false;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

export function discoverSalaries(input: DiscoveryInput): DiscoveryResult {
  const exclude = input.excludeHistoryIds ?? new Set<string>();
  const referenceDate = input.referenceDate ?? todayIso();
  const empty: DiscoveryResult = {
    candidates: [],
    boundaries: [],
    raises: [],
    baselineByYear: new Map(),
  };

  // 1. Find recurring patterns across the FULL history. The staleness
  //    guard is disabled (a huge factor) so a paycheck from a closed or
  //    long-dormant account years back still surfaces — discovery is
  //    deliberately past-focused, not "still active".
  const recurring = detectRecurringCandidates({
    entries: input.entries,
    referenceDate,
    staleAfterFactor: Number.MAX_SAFE_INTEGER,
  });

  // Keep the positive monthly / biweekly series — the cadence a
  // paycheck lands on.
  const paycheckSeries = recurring.filter(
    (c) =>
      c.suggestedAmount > 0 &&
      (c.cadence.kind === "monthly" || c.cadence.kind === "biweekly"),
  );
  if (paycheckSeries.length === 0) return empty;

  // The salary is the family of the LARGEST recurring deposits. Anchor
  // on the biggest, keep series within the job-change/raise band, and
  // drop smaller recurring inflows. A different employer name (a job
  // change) is a different normalised key, so this naturally spans
  // multiple employers across time.
  const anchor = Math.max(...paycheckSeries.map((c) => c.suggestedAmount));
  const seriesConfidence = new Map<string, number>();
  for (const c of paycheckSeries) {
    if (c.suggestedAmount >= anchor * SALARY_BAND) {
      seriesConfidence.set(c.key, c.confidence);
    }
  }
  if (seriesConfidence.size === 0) return empty;

  // Months already backed by an added salary — skip the whole month so
  // a smaller same-month deposit doesn't get re-offered in its place.
  const excludedMonths = new Set<string>();
  for (const entry of input.entries) {
    if (exclude.has(entry.id)) excludedMonths.add(entry.date.slice(0, 7));
  }

  // 2. Re-derive contributing entries: every positive, non-excluded
  //    entry whose normalised description is one of the kept series.
  //    One winner per month — the largest deposit, so a salary outranks
  //    a smaller same-month benefit that shares the band.
  const byMonth = new Map<string, HistoryEntry>();
  for (const entry of input.entries) {
    if (entry.hidden) continue;
    if (entry.collapsedIntoTransferId) continue;
    if (entry.amount <= 0) continue;
    const month = entry.date.slice(0, 7);
    if (excludedMonths.has(month)) continue;
    const key = normaliseDescription(entry.description);
    if (!isNormalisedKeyMeaningful(key)) continue;
    if (!seriesConfidence.has(key)) continue;
    const current = byMonth.get(month);
    if (!current || entry.amount > current.amount) byMonth.set(month, entry);
  }
  if (byMonth.size === 0) return empty;

  // 3. Chronological order, then segment by amount drift.
  const months = [...byMonth.keys()].sort();
  const winners = months.map((m) => byMonth.get(m)!);
  const { groups, boundaries, raises } = assignEmployerGroups(
    winners.map((e) => e.amount),
  );

  // Per-segment baseline = the median net of that group's months.
  const groupNets = new Map<number, number[]>();
  for (let i = 0; i < winners.length; i++) {
    const list = groupNets.get(groups[i]);
    if (list) list.push(winners[i].amount);
    else groupNets.set(groups[i], [winners[i].amount]);
  }
  const baselineByGroup = new Map<number, number>();
  for (const [g, nets] of groupNets) baselineByGroup.set(g, median(nets));

  // 4. Assemble candidates with confidence. A salary-typed entry is
  //    near-certain; an off-baseline month that isn't part of a
  //    sustained shift reads as a blip (bonus / leave) and scores lower
  //    so the walk flags it for a closer look.
  const candidates: DiscoveredSalary[] = winners.map((entry, i) => {
    const key = normaliseDescription(entry.description);
    const base = seriesConfidence.get(key) ?? 0.45;
    const baselineNet = baselineByGroup.get(groups[i]) ?? entry.amount;
    const typedSalary = entryTypedAsSalary(entry);
    let confidence = base;
    if (typedSalary) {
      confidence = Math.max(base, 0.9);
    } else if (!withinSalaryTolerance(entry.amount, baselineNet)) {
      confidence = base * 0.7;
    }
    return {
      monthKey: months[i],
      year: months[i].slice(0, 4),
      date: entry.date,
      net: entry.amount,
      description: displayDescription(entry),
      sourceHistoryId: entry.id,
      confidence,
      employerGroup: groups[i],
      baselineNet,
      typedSalary,
    };
  });

  // 5. Per-year baseline for the year-confirm step.
  const yearNets = new Map<string, number[]>();
  for (const c of candidates) {
    const list = yearNets.get(c.year);
    if (list) list.push(c.net);
    else yearNets.set(c.year, [c.net]);
  }
  const baselineByYear = new Map<string, number>();
  for (const [y, nets] of yearNets)
    baselineByYear.set(y, Math.round(median(nets)));

  return { candidates, boundaries, raises, baselineByYear };
}
