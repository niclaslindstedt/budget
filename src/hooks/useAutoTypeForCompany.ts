import { useCallback } from "react";

import { autoTypeForCompany } from "../data/company-type-hints";

// Wrap `autoTypeForCompany` for the entry-edit modals' company picker.
// Every `handlePickCompany` callback computes the same
// `autoTypeForCompany(typeId, pickedCompanyId, companyTypeSuggestions)`
// to auto-fill an empty type when a company with a confident type
// association is chosen; routing them through one hook keeps that rule
// in a single place. Returns a stable mapper (memoised on the current
// type + observed suggestions) from a freshly-picked company id to the
// type id to auto-fill, or `undefined` to leave the type untouched.
export function useAutoTypeForCompany(
  typeId: string | null,
  companyTypeSuggestions: ReadonlyMap<string, string>,
): (companyId: string | null) => string | undefined {
  return useCallback(
    (companyId: string | null) =>
      autoTypeForCompany(typeId, companyId, companyTypeSuggestions),
    [typeId, companyTypeSuggestions],
  );
}
