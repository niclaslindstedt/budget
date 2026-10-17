import { useCallback } from "react";

import type { CompanyTypeSuggestionLookup } from "../data/company-type-amounts";
import { autoTypeForCompany } from "../data/company-type-hints";

// Wrap `autoTypeForCompany` for the entry-edit modals' company picker.
// Every `handlePickCompany` callback computes the same
// `autoTypeForCompany(typeId, pickedCompanyId, companyTypeSuggestions,
// amount)` to auto-fill an empty type when a company with a confident
// type association is chosen; routing them through one hook keeps that
// rule in a single place. `amount` is the form's current signed amount
// (or `null` when unknown) so a multi-type company can still auto-fill
// when the amount picks one type confidently. Returns a stable mapper
// (memoised on the current type, amount, and observed suggestions) from
// a freshly-picked company id to the type id to auto-fill, or
// `undefined` to leave the type untouched.
export function useAutoTypeForCompany(
  typeId: string | null,
  companyTypeSuggestions: CompanyTypeSuggestionLookup,
  amount: number | null = null,
): (companyId: string | null) => string | undefined {
  return useCallback(
    (companyId: string | null) =>
      autoTypeForCompany(typeId, companyId, companyTypeSuggestions, amount),
    [typeId, companyTypeSuggestions, amount],
  );
}
