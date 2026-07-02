import { loanInterestAccruedBetween } from "../loans/balance";
import type { Car, CarExpense, Loan } from "../types";
import { isoToMonthNum } from "../../utils/date";
import { carDepreciationToDate, carDistanceDriven } from "./value";

// Pure cost math for the Cars sheet — the "real cost of having this
// car" aggregations. Three legs make up the total:
//
//   - expenses — the linked transportation charges (fuel, insurance,
//     tax, parking, service, leasing / pool fees, …).
//   - depreciation — value lost since purchase (owned / shared cars
//     only; a leased / pool car's value loss IS its leasing fee, which
//     already arrives as an expense).
//   - loan interest — what borrowing for the car has cost so far, via
//     the linked loan. Amortisation is deliberately NOT a cost — it's
//     equity moving from the bank to the user; the loss it finances is
//     already counted by the depreciation leg.
//
// Everything here is presentation-free; the page maps figures to
// translated labels and themed colours.

// The `${accountId}:${entryId}` key of a transaction-backed expense, or
// undefined for a manual one. The finder uses these to drop charges
// already attributed to any car.
export function carExpenseKey(expense: CarExpense): string | undefined {
  if (expense.accountId === undefined || expense.sourceHistoryId === undefined)
    return undefined;
  return `${expense.accountId}:${expense.sourceHistoryId}`;
}

function inRange(date: string, fromIso?: string, toIso?: string): boolean {
  if (fromIso !== undefined && date < fromIso) return false;
  if (toIso !== undefined && date > toIso) return false;
  return true;
}

// Total linked-expense spend per entry type across the (inclusive)
// range. Feeds the cost chart's legend totals and the card's summary.
export function carCostBreakdown(
  car: Car,
  fromIso?: string,
  toIso?: string,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const expense of car.expenses) {
    if (!inRange(expense.date, fromIso, toIso)) continue;
    totals.set(
      expense.typeId,
      (totals.get(expense.typeId) ?? 0) + expense.amount,
    );
  }
  return totals;
}

// Linked-expense spend bucketed month → type → total across the
// (inclusive) range — the stacked-bar-chart feed. Months are
// `isoToMonthNum` keys so consumers can iterate a contiguous span and
// fill gaps with zero.
export function carMonthlyCosts(
  car: Car,
  fromIso?: string,
  toIso?: string,
): Map<number, Map<string, number>> {
  const months = new Map<number, Map<string, number>>();
  for (const expense of car.expenses) {
    if (!inRange(expense.date, fromIso, toIso)) continue;
    const month = isoToMonthNum(expense.date);
    let byType = months.get(month);
    if (!byType) {
      byType = new Map<string, number>();
      months.set(month, byType);
    }
    byType.set(
      expense.typeId,
      (byType.get(expense.typeId) ?? 0) + expense.amount,
    );
  }
  return months;
}

export type CarCostLegs = {
  // Sum of every linked expense on or before the date. Always known.
  expenses: number;
  // Value lost since purchase. Undefined when it can't be computed —
  // no purchase price, or a leased / pool car.
  depreciation: number | undefined;
  // Interest accrued on the linked loan so far. Undefined when there is
  // no linked loan or the loan lacks a rate / balance anchor — the UI
  // renders the leg as unknown, never as 0.
  loanInterest: number | undefined;
};

// The three cost legs as of `iso`, kept separate so surfaces can show
// the composition (and toggle legs) rather than one opaque total.
export function carTotalCostOfOwnership(
  car: Car,
  loan: Loan | undefined,
  iso: string,
): CarCostLegs {
  let expenses = 0;
  for (const expense of car.expenses) {
    if (expense.date <= iso) expenses += expense.amount;
  }
  const interest = loan
    ? loanInterestAccruedBetween(loan, "0001-01-01", iso)
    : null;
  return {
    expenses,
    depreciation: carDepreciationToDate(car, iso),
    loanInterest: interest ?? undefined,
  };
}

// The headline "real cost" figure: total cost of ownership per unit of
// distance driven (SEK/km with metric conventions). Sums whichever legs
// are known and divides by `carDistanceDriven`. Undefined without
// odometer data or before any distance has been driven — a rate over
// zero kilometres is noise, not information.
export function carCostPerDistance(
  car: Car,
  loan: Loan | undefined,
  iso: string,
): number | undefined {
  const distance = carDistanceDriven(car, iso);
  if (distance === undefined || distance <= 0) return undefined;
  const legs = carTotalCostOfOwnership(car, loan, iso);
  const total =
    legs.expenses + (legs.depreciation ?? 0) + (legs.loanInterest ?? 0);
  return total / distance;
}
