// Cumulative interest a property has cost its owner up to a given date — the
// money paid that never comes back, deducted from the value chart so a
// property that merely held its price doesn't read as break-even once the
// interest is counted. Two independent legs, each driving its own chart toggle:
//
//  - **Mortgage interest** — the interest charged on the property's own
//    mortgages (the loans you pay to the bank). Summed month by month from each
//    loan's start (or the property's purchase) up to the target date, taking
//    the rate and balance in effect that month from the shared finance helpers
//    so an amortising loan's interest falls over time and a recorded rate
//    change applies from the month it took effect.
//
//  - **Association interest** — the interest on the property's share of a
//    housing association's debt (the Swedish bostadsrätt case). You never see
//    this as a bank charge; it rides the monthly fee. Modelled as a constant
//    monthly interest on the indirect-debt share (`loanPerSize × size`) at the
//    association's rate — no amortisation, since an årsredovisning reports the
//    standing figure, not a schedule.
//
// Pure and presentation-free, mirroring `series.ts`: the chart calls these to
// shift the curve down, the modal owns the toggles.

import { propertyInitialLoanTotal } from "../finance/amortization";
import { resolveMonthlyInterestAt } from "../finance/interest";
import type { AssociationLoan, Property } from "../types";
import { isoToMonthNum, monthNumToIsoStart } from "../../utils/date";

// The association loan's per-area figure and rate in effect on `date`, walking
// its effective-dated `history`: the most recent change on or before the date
// wins; a date before the earliest recorded change uses that earliest entry
// (the original figures extend backward). Falls back to the headline
// `loanPerSize` / `rate` when no history is recorded. Mirrors `resolveRateAt`
// for a mortgage.
export function resolveAssociationLoanAt(
  loan: AssociationLoan,
  date: string,
): { loanPerSize: number; rate: number } {
  const history = loan.history;
  if (history && history.length > 0) {
    const sorted = [...history].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
    let current = sorted[0];
    for (const change of sorted) {
      if (change.date <= date) current = change;
      else break;
    }
    return { loanPerSize: current.loanPerSize, rate: current.rate };
  }
  return { loanPerSize: loan.loanPerSize, rate: loan.rate };
}

// The area used to apportion the association's debt: the association's own
// lägenhetsförteckning figure (`AssociationLoan.size`) when recorded — it can
// differ from the measured living area — falling back to the property's
// measured `size`. Undefined when neither is known.
function associationArea(property: Property): number | undefined {
  return property.associationLoan?.size ?? property.size;
}

// The property's share of the housing association's debt, in the user's
// currency: the *current* per-area figure times the apportioning area.
// Undefined when no association loan is recorded or neither area is known —
// there is nothing to charge indirect interest on.
export function associationLoanShare(property: Property): number | undefined {
  const loan = property.associationLoan;
  if (!loan) return undefined;
  const area = associationArea(property);
  if (area === undefined) return undefined;
  return loan.loanPerSize * area;
}

// The monthly interest on the association-debt share at the loan's *current*
// rate — the headline figure. Undefined when there is no share to charge it on.
export function monthlyAssociationInterest(
  property: Property,
): number | undefined {
  const share = associationLoanShare(property);
  if (share === undefined) return undefined;
  return ((property.associationLoan!.rate / 100) * share) / 12;
}

// Cumulative interest on the property's own mortgages from each loan's start
// (its `loanStartDate`, falling back to the property's `purchaseDate`) up to
// `isoDate`. Interest is summed for the months strictly before `isoDate` —
// at the start you have paid nothing, after one month you have paid one
// month's interest — using the rate and reconstructed balance in effect each
// month. Loans with no resolvable start (no `loanStartDate` and no
// `purchaseDate`) contribute nothing, since there is no anchor to accrue from.
export function cumulativeMortgageInterestAt(
  property: Property,
  isoDate: string,
): number {
  const percentBasis = propertyInitialLoanTotal(property.mortgages);
  const endMonth = isoToMonthNum(isoDate);
  let total = 0;
  for (const mortgage of property.mortgages) {
    const start = mortgage.loanStartDate ?? property.purchaseDate;
    if (!start) continue;
    const startMonth = isoToMonthNum(start);
    for (let m = startMonth; m < endMonth; m++) {
      const interest = resolveMonthlyInterestAt(
        mortgage,
        monthNumToIsoStart(m),
        start,
        percentBasis,
      );
      if (interest !== null) total += interest;
    }
  }
  return total;
}

// Cumulative interest on the property's share of the association's debt from
// the purchase date up to `isoDate`, summed month by month using the loan
// figure and rate in effect each month (so a yearly årsredovisning update
// accrues at the figures that applied that year). Interest is summed for the
// months strictly before `isoDate` — at the purchase date you have paid none,
// mirroring the mortgage leg. Zero when no association loan is recorded, the
// property has no apportioning area, or it has no purchase date to accrue from.
export function cumulativeAssociationInterestAt(
  property: Property,
  isoDate: string,
): number {
  const loan = property.associationLoan;
  if (!loan || !property.purchaseDate) return 0;
  const area = associationArea(property);
  if (area === undefined) return 0;
  const startMonth = isoToMonthNum(property.purchaseDate);
  const endMonth = isoToMonthNum(isoDate);
  let total = 0;
  for (let m = startMonth; m < endMonth; m++) {
    const { loanPerSize, rate } = resolveAssociationLoanAt(
      loan,
      monthNumToIsoStart(m),
    );
    total += ((rate / 100) * (loanPerSize * area)) / 12;
  }
  return total;
}
