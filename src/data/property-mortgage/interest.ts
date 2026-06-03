// Resolve a mortgage's monthly interest charge — the interest paid each
// month at the current rate — to a concrete amount in the user's
// currency. Interest accrues on the outstanding debt, so this is
//
//   monthly = balance × interestRate/100 ÷ 12
//
// where `balance` is the `currentBalance` (what's left to pay) when known,
// falling back to the original `loanAmount` otherwise. Returns `null` when
// neither a balance nor an interest rate is recorded — there is nothing to
// charge interest on. Mirrors `resolveMonthlyAmortization`'s "null when not
// enough info" contract so the finder can present "rate unknown" cleanly.

import type { Mortgage } from "../types";

export function resolveMonthlyInterest(mortgage: Mortgage): number | null {
  if (mortgage.interestRate === undefined) return null;
  const balance = mortgage.currentBalance ?? mortgage.loanAmount;
  if (balance === undefined) return null;
  return ((mortgage.interestRate / 100) * balance) / 12;
}
