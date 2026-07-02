import { loanInterestAccruedBetween } from "../loans/balance";
import type { Car, Loan } from "../types";
import { addMonthsIso } from "../../utils/date";
import { computeCarCurrentValue, resolveCarSnapshots } from "./value";

// Builds the lines behind the car "Visualize value" chart. Pure and
// presentation-free: emits `{ x, y }` points and the modal maps them to
// themed colours + translated labels.
//
// Unlike the property series (sampled at snapshot dates only — the only
// dates a market value is known for), the car curve is sampled MONTHLY:
// a depreciation rule is a continuous decay, and sampling it only where
// snapshots sit would render the curve as misleading straight lines
// between distant points.

export type SeriesPoint = { x: number; y: number };

export type CarValueSeriesOptions = {
  // Subtract the cumulative linked-expense spend up to each date, so
  // the curve reflects the money sunk into running the car that never
  // comes back.
  includeCosts: boolean;
  // Additionally subtract the cumulative interest accrued on the linked
  // loan up to each date. Silently inert when no loan (or no usable
  // rate / anchor) is attached — the modal gates the toggle on that.
  includeLoanInterest: boolean;
};

// Parse an ISO yyyy-mm-dd date to epoch ms (UTC midnight). Returns null
// for a malformed value so a bad snapshot is skipped rather than
// charting NaN.
function isoToMs(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

// The dates the value curve is sampled at: every month from the
// earliest known point (purchase or first snapshot) through `todayIso`,
// plus the exact snapshot dates so recorded lookups land on the curve
// precisely, plus today itself.
function sampleDates(car: Car, todayIso: string): string[] {
  const dates = new Set<string>();
  let earliest: string | undefined;
  for (const snapshot of resolveCarSnapshots(car)) {
    if (snapshot.date > todayIso) continue;
    dates.add(snapshot.date);
    if (earliest === undefined || snapshot.date < earliest)
      earliest = snapshot.date;
  }
  if (earliest === undefined) return [];
  for (let date = earliest; date < todayIso; date = addMonthsIso(date, 1)) {
    dates.add(date);
  }
  dates.add(todayIso);
  return [...dates].sort();
}

export function buildCarValueSeries(
  car: Car,
  loan: Loan | undefined,
  options: CarValueSeriesOptions,
  todayIso: string,
): SeriesPoint[] {
  const expenses = car.expenses
    .map((e) => ({ date: e.date, amount: e.amount }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Cumulative expense spend up to (and including) a date. Expenses are
  // pre-sorted, so the running sum can short-circuit once past it.
  const cumulativeExpensesAt = (iso: string): number => {
    let sum = 0;
    for (const e of expenses) {
      if (e.date <= iso) sum += e.amount;
      else break;
    }
    return sum;
  };

  const points: SeriesPoint[] = [];
  for (const date of sampleDates(car, todayIso)) {
    const value = computeCarCurrentValue(car, date);
    if (value === undefined) continue;
    const ms = isoToMs(date);
    if (ms === null) continue;
    let y = value;
    if (options.includeCosts) y -= cumulativeExpensesAt(date);
    if (options.includeLoanInterest && loan) {
      y -= loanInterestAccruedBetween(loan, "0001-01-01", date) ?? 0;
    }
    points.push({ x: ms, y });
  }
  return points;
}

// The odometer line: one point per snapshot carrying a mileage reading
// (the synthesised purchase point included). No interpolation — the
// user's readings are the only truth the app has.
export function buildCarMileageSeries(
  car: Car,
  todayIso: string,
): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (const snapshot of resolveCarSnapshots(car)) {
    if (snapshot.mileage === undefined) continue;
    if (snapshot.date > todayIso) continue;
    const ms = isoToMs(snapshot.date);
    if (ms === null) continue;
    points.push({ x: ms, y: snapshot.mileage });
  }
  return points.sort((a, b) => a.x - b.x);
}
