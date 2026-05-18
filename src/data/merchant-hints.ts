// Merchant-hint memory. Whenever the user assigns a category to a row
// (budget row, recurring entry, transaction, or — eventually — a
// promoted history entry), we tally that against the normalised
// description so the next import can suggest the same category.
//
// Pure: no React, no storage. The reducer calls `recordMerchantHints`
// before returning each new `UserData`; the validator drops hints
// whose categoryId no longer references a known category so a deleted
// category can't trap a hint in zombie state.

import {
  isNormalisedKeyMeaningful,
  normaliseDescription,
} from "./description-normaliser";
import type { MerchantHint, UserData } from "./types";

export type HintRecording = {
  description: string;
  // `null` clears any existing hint for the key — used when the user
  // strips a category off a row. `string` means "assign / reinforce".
  categoryId: string | null;
};

// Apply a batch of hint recordings to a state. Returns a new state
// when anything changed; the original (referentially) when every
// recording was a no-op (empty description, missing category, etc.)
// so reducers can keep their `===` identity checks cheap.
export function recordMerchantHints(
  state: UserData,
  recordings: readonly HintRecording[],
  now: number,
): UserData {
  if (recordings.length === 0) return state;
  const known = new Set(state.categories.map((c) => c.id));
  let next: Record<string, MerchantHint> | null = null;
  for (const r of recordings) {
    const key = normaliseDescription(r.description);
    if (!isNormalisedKeyMeaningful(key)) continue;
    if (r.categoryId === null) {
      // Clear: a user stripping the category off the only row that
      // ever set it should also drop the hint. We don't track a refer
      // -ence count, so this is more aggressive than "decrement"; it's
      // the right call because hints are advisory, not authoritative,
      // and the next category assignment will rebuild the hint.
      if (!state.merchantHints[key] && next === null) continue;
      if (next === null) next = { ...state.merchantHints };
      delete next[key];
      continue;
    }
    if (!known.has(r.categoryId)) continue;
    const existing = (next ?? state.merchantHints)[key] ?? null;
    if (next === null) next = { ...state.merchantHints };
    next[key] = {
      categoryId: r.categoryId,
      hitCount:
        (existing?.categoryId === r.categoryId ? existing.hitCount : 0) + 1,
      lastUsedAt: now,
    };
  }
  if (next === null) return state;
  return { ...state, merchantHints: next };
}

// Look up the suggested category for a description, or null when no
// hint exists. Used by the recurring-candidate promote flow to
// preselect the category on the confirm modal — the suggestion is
// always visible to the user, never silently applied.
export function suggestCategoryForDescription(
  hints: Readonly<Record<string, MerchantHint>>,
  description: string,
): string | null {
  const key = normaliseDescription(description);
  if (!isNormalisedKeyMeaningful(key)) return null;
  return hints[key]?.categoryId ?? null;
}
