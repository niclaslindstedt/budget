import type { Action } from "../reducer";
import type { Loan, UserData } from "../types";

// Apply a patch, treating an explicit `undefined` value as "delete this key"
// rather than "set the key to undefined" — so clearing an optional field
// (drop the rate, unlink a mortgage) keeps the live record byte-identical
// to one reloaded from storage. Mirrors `applyPatch` in
// `reducers/savings.ts`.
function applyPatch<T extends { id: string }>(
  entity: T,
  patch: Partial<Omit<T, "id">>,
): T {
  const next: T = { ...entity };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete next[key as keyof T];
    } else {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

// Rewrite one loan by id, leaving the rest of the array untouched.
function updateLoanById(
  state: UserData,
  loanId: string,
  fn: (loan: Loan) => Loan,
): UserData {
  return {
    ...state,
    loans: state.loans.map((l) => (l.id === loanId ? fn(l) : l)),
  };
}

// CRUD for the loans catalog (`UserData.loans`) and the payments nested
// under each loan. Entirely user-curated — no presets — so there's no
// preset-immutability guard here. `deleteLoan` has no cascade: loans own
// no history buckets and are never transfer endpoints (their payments
// only *reference* bank entries via `sourceHistoryId`).
export function reduceLoans(state: UserData, action: Action): UserData | null {
  if (action.type === "addLoan") {
    return { ...state, loans: [...state.loans, action.loan] };
  }
  if (action.type === "updateLoan") {
    return updateLoanById(state, action.loanId, (l) =>
      applyPatch(l, action.patch),
    );
  }
  if (action.type === "deleteLoan") {
    return {
      ...state,
      loans: state.loans.filter((l) => l.id !== action.loanId),
    };
  }
  if (action.type === "addLoanPayments") {
    return updateLoanById(state, action.loanId, (l) => {
      // Defensive dedupe: a payment whose source entry is already recorded
      // (e.g. the auto-attach pass raced the modal) is silently skipped.
      const consumed = new Set<string>();
      for (const payment of l.payments) {
        if (payment.sourceHistoryId !== undefined)
          consumed.add(payment.sourceHistoryId);
      }
      const added = action.payments.filter(
        (p) => p.sourceHistoryId === undefined || !consumed.has(p.sourceHistoryId),
      );
      const next: Loan = { ...l, payments: [...l.payments, ...added] };
      if (action.patterns !== undefined && action.patterns.length > 0) {
        const union = new Set([...(l.paymentPatterns ?? []), ...action.patterns]);
        next.paymentPatterns = [...union];
      }
      return next;
    });
  }
  if (action.type === "deleteLoanPayment") {
    return updateLoanById(state, action.loanId, (l) => ({
      ...l,
      payments: l.payments.filter((p) => p.id !== action.paymentId),
    }));
  }
  if (action.type === "deleteAllLoanPayments") {
    return updateLoanById(state, action.loanId, (l) => ({
      ...l,
      payments: [],
    }));
  }
  return null;
}
