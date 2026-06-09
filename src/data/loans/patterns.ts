// Learned bank-description memory for loan payments. When the user
// imports payments onto a loan, the imported entries' descriptions are
// normalised and remembered on the loan so the next `importBankHistory`
// run can auto-attach matching charges without a modal — same key-space
// as `merchantHints` / `primaryIncomeMerchants`.

import {
  isNormalisedKeyMeaningful,
  normaliseDescription,
} from "../description-normaliser";

// Union the loan's existing patterns with the keys learned from the just-
// imported entries' raw bank descriptions. Returns `undefined` when the
// union is empty so the optional field stays absent rather than storing
// an empty array.
export function learnPaymentPatterns(
  existing: readonly string[] | undefined,
  importedDescriptions: readonly string[],
): string[] | undefined {
  const keys = new Set<string>(existing ?? []);
  for (const description of importedDescriptions) {
    const key = normaliseDescription(description);
    if (!isNormalisedKeyMeaningful(key)) continue;
    keys.add(key);
  }
  if (keys.size === 0) return undefined;
  return [...keys];
}

// True when a bank description collapses to one of the loan's learned
// pattern keys.
export function matchesPaymentPattern(
  patterns: readonly string[] | undefined,
  description: string,
): boolean {
  if (patterns === undefined || patterns.length === 0) return false;
  return patterns.includes(normaliseDescription(description));
}
