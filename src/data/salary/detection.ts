// Pure detector that scans budget income and suggests likely salaries —
// one per month — for the "Find salaries" flow on the Salary sheet.
//
// The hard part is telling a paycheck apart from other big deposits
// (an inheritance, a loan payout, a tax refund). The rule the brief
// asks for: pick the biggest income each month, but PREFER income that
// recurs over a one-off large number. We encode that as a score —
// flagged "main salary" series win outright, then the Salary entry-type,
// then any recurring series, and only then raw amount breaks ties. So a
// 250k inheritance never beats the 35k that lands every month.
//
// Pure: fed flat rows + a reference date, emits sorted candidates. The
// caller (the Salary page) gathers the rows from `UserData` and turns
// accepted candidates into `Salary` objects via `addSalaries`.

import { getStandardColumns } from "../sheet";
import { SALARY_TYPE_ID } from "./salary";
import type { Sheet, UserData } from "../types";

// One income row distilled to just what scoring needs.
export type DetectionRow = {
  rowId: string;
  date: string; // ISO yyyy-mm-dd
  amount: number; // signed; only positives are considered
  isSalaryType: boolean; // typeId === the Salary preset type
  isPrimaryIncome: boolean; // row's series flagged "main salary"
  hasSeriesId: boolean; // part of a recurring series
};

export type SalaryCandidate = {
  monthKey: string; // "YYYY-MM"
  date: string; // the winning row's payment date
  net: number; // detected deposit (netto)
  sourceRowId: string;
  confidence: number; // 0..1
  // Job-change segment index. Consecutive months that hold steady share
  // an index; a sustained jump (see below) starts a new one, hinting at
  // an employer change the user can act on in the Find modal.
  employerGroup: number;
};

export type DetectResult = {
  candidates: SalaryCandidate[]; // chronological (oldest first)
  // Candidate indices where a new employer group starts (always
  // includes 0 when there is at least one candidate). Lets the modal
  // draw "likely new employer" separators.
  boundaries: number[];
};

export type DetectInput = {
  rows: readonly DetectionRow[];
  // Source row ids already turned into salaries — skipped so the same
  // paycheck isn't offered twice.
  excludeSourceRowIds?: ReadonlySet<string>;
};

// Score weights, biggest signal first. A flagged main-salary series
// dwarfs everything; the Salary entry-type and any recurring series
// follow; amount only ever breaks ties between equal scores.
const SCORE_PRIMARY_INCOME = 1000;
const SCORE_SALARY_TYPE = 400;
const SCORE_RECURRING = 200;

function scoreRow(row: DetectionRow): number {
  let s = 0;
  if (row.isPrimaryIncome) s += SCORE_PRIMARY_INCOME;
  if (row.isSalaryType) s += SCORE_SALARY_TYPE;
  if (row.hasSeriesId) s += SCORE_RECURRING;
  return s;
}

// Confidence reflects how sure we are the winner is a salary (not just
// the month's biggest deposit). A flagged series is near-certain; a
// bare biggest-number with no recurring signal is a weak guess.
function confidenceForRow(row: DetectionRow): number {
  if (row.isPrimaryIncome) return 0.97;
  if (row.isSalaryType && row.hasSeriesId) return 0.9;
  if (row.isSalaryType) return 0.75;
  if (row.hasSeriesId) return 0.6;
  return 0.35;
}

function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

// How far a paycheck may drift from the running salary level and still
// count as "the same salary". Month-to-month pay wobbles (overtime, a
// partial-absence month, a reimbursement that rode along) routinely move
// the net by a few percent without being a real change, so a tight band
// would flag ordinary months as unusual and split a steady employer into
// phantom segments. Only a sustained move beyond this band reads as a
// genuine shift — a raise or a job change.
export const SAME_SALARY_TOLERANCE = 0.1;

// Two net amounts are "the same salary" when within the tolerance band.
export function withinSalaryTolerance(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false;
  return Math.abs(a - b) / Math.max(a, b) <= SAME_SALARY_TOLERANCE;
}

export function detectSalaries(input: DetectInput): DetectResult {
  const exclude = input.excludeSourceRowIds ?? new Set<string>();

  // Pick one winner per month: highest score, amount breaks ties. Only
  // positive, non-excluded rows are eligible.
  const winners = new Map<string, DetectionRow>();
  for (const row of input.rows) {
    if (row.amount <= 0) continue;
    if (exclude.has(row.rowId)) continue;
    const key = monthKeyOf(row.date);
    const current = winners.get(key);
    if (!current) {
      winners.set(key, row);
      continue;
    }
    const a = scoreRow(row);
    const b = scoreRow(current);
    if (a > b || (a === b && row.amount > current.amount)) {
      winners.set(key, row);
    }
  }

  const sortedKeys = [...winners.keys()].sort();
  const candidates: SalaryCandidate[] = sortedKeys.map((key) => {
    const row = winners.get(key)!;
    return {
      monthKey: key,
      date: row.date,
      net: row.amount,
      sourceRowId: row.rowId,
      confidence: confidenceForRow(row),
      employerGroup: 0,
    };
  });

  const { groups, boundaries } = assignEmployerGroups(
    candidates.map((c) => c.net),
  );
  for (let i = 0; i < candidates.length; i++) {
    candidates[i].employerGroup = groups[i];
  }

  return { candidates, boundaries };
}

// Job-change / raise segmentation over a chronological sequence of net
// amounts. Walks the run keeping a running average. A month within the
// salary tolerance of the run average extends it. A month that diverges
// only starts a NEW group when the divergence sustains for three
// consecutive months (the "3× new salary in a row" hint) — otherwise
// it's treated as an off-average blip (bonus, parental leave, VAB) and
// folded into the current group so a single odd paycheck never splits an
// employer.
//
// Returns a per-index `groups` array, the `boundaries` (indices where a
// new group starts, always including 0 when there's at least one entry),
// and `raises` (the subset of boundaries whose new level sits ABOVE the
// previous run — a sustained pay rise rather than a drop or a sideways
// move). Shared by `detectSalaries` (budget-row scoring) and
// `discoverSalaries` (bank-history scan) so both segment identically.
export function assignEmployerGroups(nets: readonly number[]): {
  groups: number[];
  boundaries: number[];
  raises: number[];
} {
  const groups: number[] = new Array(nets.length).fill(0);
  const boundaries: number[] = [];
  const raises: number[] = [];
  if (nets.length === 0) return { groups, boundaries, raises };

  boundaries.push(0);
  let group = 0;
  let runMean = nets[0];
  let runLen = 1;
  for (let i = 1; i < nets.length; i++) {
    const net = nets[i];
    if (withinSalaryTolerance(net, runMean)) {
      runLen += 1;
      runMean = (runMean * (runLen - 1) + net) / runLen;
      groups[i] = group;
      continue;
    }
    const next1 = nets[i + 1];
    const next2 = nets[i + 2];
    const sustained =
      next1 !== undefined &&
      next2 !== undefined &&
      withinSalaryTolerance(net, next1) &&
      withinSalaryTolerance(net, next2);
    if (sustained) {
      group += 1;
      boundaries.push(i);
      // A new level above the level we were holding is a raise; a drop or
      // sideways move is left to read as a (possible) job change.
      if (net > runMean) raises.push(i);
      runMean = net;
      runLen = 1;
      groups[i] = group;
    } else {
      // Blip — keep it in the current group, don't disturb the run
      // average (so a 2× bonus doesn't drag the steady-state up).
      groups[i] = group;
    }
  }
  return { groups, boundaries, raises };
}

// Gather the budget income rows the detector scores, flattened across
// every budget sheet (the detection scope is the whole workspace). A
// row counts as a salary candidate input when it has a positive amount
// and is not a balance correction or a transfer.
export function gatherSalaryDetectionRows(data: UserData): DetectionRow[] {
  const out: DetectionRow[] = [];
  for (const sheet of data.sheets as Sheet[]) {
    for (const item of sheet.items) {
      if (item.type !== "accountBudget") continue;
      const { dateCol, amountCol } = getStandardColumns(item.columns);
      if (!dateCol || !amountCol) continue;
      for (const row of item.rows) {
        if (row.kind !== "user") continue;
        if (row.isTransfer) continue;
        const dateVal = row.cells[dateCol.id];
        const amountVal = row.cells[amountCol.id];
        if (typeof dateVal !== "string" || dateVal === "") continue;
        if (typeof amountVal !== "number" || !Number.isFinite(amountVal))
          continue;
        if (amountVal <= 0) continue;
        const isPrimaryIncome =
          row.seriesId !== undefined &&
          data.seriesMetadata[row.seriesId]?.isPrimaryIncome === true;
        out.push({
          rowId: row.id,
          date: dateVal,
          amount: amountVal,
          isSalaryType: row.typeId === SALARY_TYPE_ID,
          isPrimaryIncome,
          hasSeriesId: row.seriesId !== undefined,
        });
      }
    }
  }
  return out;
}
