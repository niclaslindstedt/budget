// Merchant-hint memory. Whenever the user assigns a type to a row
// (budget row, recurring entry, transfer, or a promoted history
// entry), we tally that against the normalised description so the
// next import can suggest the same type. The hint's category is
// derived through `typeId → type.categoryId` and isn't stored on
// the hint itself.
//
// Pure: no React, no storage. The reducer calls `recordMerchantHints`
// before returning each new `UserData`; the validator drops hints
// whose typeId no longer references a known type so a deleted type
// can't trap a hint in zombie state.

import {
  isNormalisedKeyMeaningful,
  normaliseDescription,
} from "./description-normaliser";
import { bumpHitCount } from "./hit-count";
import type { MerchantHint, UserData } from "./types";

export type HintRecording = {
  description: string;
  // `null` clears any existing hint for the key — used when the user
  // strips the type off a row. `string` means "assign / reinforce".
  typeId: string | null;
  // Optional user-typed label that overrides the raw bank
  // description on synthesized history rows sharing the normalised
  // key. Undefined means "don't touch"; explicit empty string clears
  // any existing override.
  description_override?: string;
  // Optional company association the user tagged on the row. Undefined
  // preserves any existing company on the hint; `null` clears the
  // company; a string assigns it. Carries through the same merchant-
  // hint surface as `typeId` so future synthesized rows can inherit it.
  companyId?: string | null;
};

// Apply a batch of hint recordings to a state. Returns a new state
// when anything changed; the original (referentially) when every
// recording was a no-op (empty description, missing type, etc.) so
// reducers can keep their `===` identity checks cheap.
export function recordMerchantHints(
  state: UserData,
  recordings: readonly HintRecording[],
  now: number,
): UserData {
  if (recordings.length === 0) return state;
  const knownTypes = new Set(state.types.map((t) => t.id));
  const knownCompanies = new Set(state.companies.map((c) => c.id));
  let next: Record<string, MerchantHint> | null = null;
  for (const r of recordings) {
    const key = normaliseDescription(r.description);
    if (!isNormalisedKeyMeaningful(key)) continue;
    if (r.typeId === null) {
      // Clear: a user stripping the type off the only row that ever
      // set it should also drop the hint. We don't track a reference
      // count, so this is more aggressive than "decrement"; it's the
      // right call because hints are advisory, not authoritative, and
      // the next type assignment will rebuild the hint.
      if (!state.merchantHints[key] && next === null) continue;
      if (next === null) next = { ...state.merchantHints };
      delete next[key];
      continue;
    }
    if (!knownTypes.has(r.typeId)) continue;
    const existing = (next ?? state.merchantHints)[key] ?? null;
    if (next === null) next = { ...state.merchantHints };
    const hint: MerchantHint = {
      typeId: r.typeId,
      hitCount: bumpHitCount(
        existing?.hitCount ?? null,
        existing?.typeId === r.typeId,
      ),
      lastUsedAt: now,
    };
    // description_override: undefined preserves, empty string clears,
    // any other string assigns.
    if (r.description_override === undefined) {
      if (existing?.description) hint.description = existing.description;
    } else if (r.description_override.trim() !== "") {
      hint.description = r.description_override;
    }
    // companyId: undefined preserves, null clears, string assigns
    // (when it resolves to a known company).
    if (r.companyId === undefined) {
      if (existing?.companyId) hint.companyId = existing.companyId;
    } else if (r.companyId !== null && knownCompanies.has(r.companyId)) {
      hint.companyId = r.companyId;
    }
    next[key] = hint;
  }
  if (next === null) return state;
  return { ...state, merchantHints: next };
}

// Look up the suggested type for a description, or null when no hint
// exists. Used by the recurring-candidate promote flow to preselect
// the type on the confirm modal — the suggestion is always visible
// to the user, never silently applied.
export function suggestTypeForDescription(
  hints: Readonly<Record<string, MerchantHint>>,
  description: string,
): string | null {
  const key = normaliseDescription(description);
  if (!isNormalisedKeyMeaningful(key)) return null;
  return hints[key]?.typeId ?? null;
}

// Look up the company a description's merchant hint carries, or null
// when no hint (or no company on the hint) exists. Used by the
// recurring-candidate promote flow to preselect the company on the
// confirm modal — the suggestion is always visible to the user,
// never silently applied.
export function suggestCompanyForDescription(
  hints: Readonly<Record<string, MerchantHint>>,
  description: string,
): string | null {
  const key = normaliseDescription(description);
  if (!isNormalisedKeyMeaningful(key)) return null;
  return hints[key]?.companyId ?? null;
}
