// Rename-pattern memory. Whenever the user types a fresh description
// over a history entry's bank text — via `HistoryEntryEditModal` (the
// pen button) or the budget-view quick-rename on a synthesized history
// row — we tally that mapping against the normalised bank description
// under the entry's account. The next import looks the key back up to
// suggest the same rename for fresh entries that arrive with cosmetic
// differences (the date prefix being the obvious one).
//
// Scope is per-account by deliberate choice: the same merchant can
// carry different user labels in different accounts (a salary line is
// "Salary" on one card and "Spouse — salary" on another). The
// normalised key already strips the volatile date prefix and currency /
// reference tokens — see `normaliseDescription` for the full list.
//
// Pure: no React, no storage. The reducer calls `recordRename` from
// `updateHistoryEntry` (the single chokepoint for any rename a user
// types) and `bumpRenamePattern` from `applyImportRenames` (which
// already knows the suggestion came from a learned pattern, so no fresh
// recording happens there — only the existing hit-count / lastUsedAt
// get refreshed).

import {
  isNormalisedKeyMeaningful,
  normaliseDescription,
} from "./description-normaliser";
import { bumpHitCount } from "./hit-count";
import type { HistoryEntry, RenamePattern, UserData } from "./types";

// Map shape persisted at `UserData.renamePatterns[accountId][key]`.
// Kept as a plain Record so the validator and the migration step can
// produce / consume it without an extra adapter layer.
export type RenamePatternStore = Record<
  string /* accountId */,
  Record<string /* normalisedBankDescription */, RenamePattern>
>;

// One predicted rename for a freshly-imported entry. The modal renders
// these as editable rows; accepted suggestions ride through
// `applyImportRenames` to land on the entry's `userDescription`.
export type RenameSuggestion = {
  entryId: string;
  originalDescription: string;
  suggestedDescription: string;
  hitCount: number;
  lastUsedAt: number;
};

// Fold a single rename into the store. Returns the original store
// when the input was a no-op (empty / too-short key, identical text,
// blank user description) so the reducer can keep its `===` identity
// checks cheap. A blank `userDescription` is treated as "no signal";
// we don't learn from clears so the next import doesn't keep
// suggesting a stripped override.
export function recordRename(
  patterns: Readonly<RenamePatternStore>,
  accountId: string,
  bankDescription: string,
  userDescription: string,
  now: number,
): RenamePatternStore {
  const trimmed = userDescription.trim();
  if (trimmed === "") return patterns as RenamePatternStore;
  const key = normaliseDescription(bankDescription);
  if (!isNormalisedKeyMeaningful(key)) return patterns as RenamePatternStore;
  const accountBucket = patterns[accountId];
  const existing = accountBucket?.[key];
  const next: RenamePattern = {
    suggestedDescription: trimmed,
    hitCount: bumpHitCount(
      existing?.hitCount ?? null,
      existing?.suggestedDescription === trimmed,
    ),
    lastUsedAt: now,
  };
  if (
    existing &&
    existing.suggestedDescription === next.suggestedDescription &&
    existing.hitCount === next.hitCount &&
    existing.lastUsedAt === next.lastUsedAt
  ) {
    return patterns as RenamePatternStore;
  }
  return {
    ...patterns,
    [accountId]: {
      ...accountBucket,
      [key]: next,
    },
  };
}

// Refresh the hit-count / lastUsedAt of an existing pattern without
// changing the suggested text. Used by `applyImportRenames` so an
// accepted suggestion floats to the top of future predictions without
// re-recording a fresh rename event (which would be circular learning).
// Returns the original store when there's nothing to refresh (no
// matching pattern, or the suggestion's text drifted away from what
// the store holds — that case routes through `recordRename` instead).
export function bumpRenamePattern(
  patterns: Readonly<RenamePatternStore>,
  accountId: string,
  bankDescription: string,
  acceptedDescription: string,
  now: number,
): RenamePatternStore {
  const trimmed = acceptedDescription.trim();
  if (trimmed === "") return patterns as RenamePatternStore;
  const key = normaliseDescription(bankDescription);
  if (!isNormalisedKeyMeaningful(key)) return patterns as RenamePatternStore;
  const accountBucket = patterns[accountId];
  const existing = accountBucket?.[key];
  if (!existing) return patterns as RenamePatternStore;
  if (existing.suggestedDescription !== trimmed) {
    return recordRename(patterns, accountId, bankDescription, trimmed, now);
  }
  return {
    ...patterns,
    [accountId]: {
      ...accountBucket,
      [key]: {
        ...existing,
        hitCount: existing.hitCount + 1,
        lastUsedAt: now,
      },
    },
  };
}

// Produce one suggestion per matching entry. Skips entries that already
// carry a user override (`userDescription`) — predicting a rename for
// an entry the user already labelled would be redundant. Ordered by
// confidence (hit-count desc, recency desc) so the most-trusted
// renames render at the top of the modal.
export function predictRenames(
  patterns: Readonly<RenamePatternStore>,
  accountId: string,
  entries: readonly HistoryEntry[],
): RenameSuggestion[] {
  const bucket = patterns[accountId];
  if (!bucket) return [];
  const out: RenameSuggestion[] = [];
  for (const entry of entries) {
    if (entry.userDescription && entry.userDescription.trim() !== "") continue;
    const key = normaliseDescription(entry.description);
    if (!isNormalisedKeyMeaningful(key)) continue;
    const pattern = bucket[key];
    if (!pattern) continue;
    if (pattern.suggestedDescription.trim() === entry.description.trim()) {
      // The "rename" would be a no-op — the bank already wrote what
      // the user calls it. Skip so the modal doesn't surface noise.
      continue;
    }
    out.push({
      entryId: entry.id,
      originalDescription: entry.description,
      suggestedDescription: pattern.suggestedDescription,
      hitCount: pattern.hitCount,
      lastUsedAt: pattern.lastUsedAt,
    });
  }
  out.sort((a, b) => {
    if (a.hitCount !== b.hitCount) return b.hitCount - a.hitCount;
    return b.lastUsedAt - a.lastUsedAt;
  });
  return out;
}

// Helper for the reducer: the previous effective text for an entry is
// `userDescription || description`. Used to decide whether a fresh
// patch's `userDescription` is genuinely a rename (worth learning from)
// or a no-op cosmetic edit (same text, just re-typed).
export function effectiveDescription(entry: HistoryEntry): string {
  const u = entry.userDescription?.trim();
  if (u) return u;
  return entry.description;
}

// Drop every pattern stored for accounts that no longer exist. Mirrors
// the same "no zombie state" hygiene the merchant-hint validator does
// on load — when an account is deleted, its rename memory goes with it.
// Used by the validator.
export function pruneRenamePatterns(
  patterns: Readonly<RenamePatternStore>,
  knownAccountIds: ReadonlySet<string>,
): RenamePatternStore {
  const out: RenamePatternStore = {};
  for (const [accountId, bucket] of Object.entries(patterns)) {
    if (!knownAccountIds.has(accountId)) continue;
    out[accountId] = bucket;
  }
  return out;
}

// Re-export so call sites that already have the original normaliser
// don't have to chase two imports. Lets a consumer ask "did this entry
// produce a meaningful learning key?" without dragging the normaliser
// module in directly.
export { isNormalisedKeyMeaningful, normaliseDescription, type UserData };
