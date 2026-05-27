// Persistent memory of which type the user assigned to which
// merchant. Keyed by the normalised description so cosmetic
// differences ("Spotify *123", "SPOTIFY") map to a single hint. The
// recurring-candidate promote flow reads this to pre-suggest a type;
// the history-row promote-to-recurring flow extends the same hint
// with a user-typed description so past and future history entries
// display under the user's label rather than the raw bank text. The
// hint's category is derived through `typeId → type.categoryId` —
// it isn't stored on the hint itself. Always advisory — the UI
// surfaces the suggestion to the user, never auto-applies silently.
export type MerchantHint = {
  typeId: string;
  // How many times the user has assigned this type to this merchant.
  // Higher counts could later inform suggestion ordering; today the
  // panel just shows the count for transparency.
  hitCount: number;
  // Unix ms timestamp of the most recent assignment. Used by the
  // "Merchant memory" settings section to show "last used …" and as
  // a tiebreaker if two hints ever collide on the same key (the
  // validator already enforces a single hint per key, but the field
  // costs nothing and keeps the door open).
  lastUsedAt: number;
  // Optional user-typed label that overrides the bank's description
  // wherever this merchant shows up. Set by the history-row promote
  // flow so a row of "ICA SUPERMARKET 12345" can display as
  // "Groceries" once the user names it.
  description?: string;
  // Optional company association the user attached to the merchant.
  // Lower priority than `HistoryEntry.userCompanyId` and matching
  // `MatchRule.companyId`, higher priority than no resolution. Dropped
  // silently by the validator when the referenced company no longer
  // exists, same contract as `typeId`.
  companyId?: string;
};

// User-defined rule that relabels imported bank-history entries by
// wildcard-matching against their raw description. Distinct from
// `MerchantHint` (which keys off the lossy normalised description and
// is auto-populated by promote flows): a `MatchRule` is explicit
// memory, edited by hand through the pattern modal so a noisy
// merchant like "App Store *Buzzer 9XXX" can be collapsed under a
// single user-typed label by matching `*App Store*`.
//
// Pattern is a simple glob: `*` matches any run of characters
// (including empty), other characters match themselves literally and
// case-insensitively. The pattern is implicitly anchored — wrap with
// `*…*` for substring matching.
//
// `amountSign` filters by transaction direction so a "BAUHAUS" rule
// labels incoming refunds only or outgoing purchases only. The
// `transferFilter` follows the same shape applied to whether the
// entry is part of a cross-account transfer (i.e. carries a
// `collapsedIntoTransferId`) — useful when a description token
// like "BAUHAUS" can appear both on real purchases and on transfers
// the user labelled themselves.
//
// All three filter fields default to `any`; absent fields on disk
// are normalised by the validator to the same default.
export type MatchRule = {
  id: string;
  pattern: string;
  description?: string;
  typeId?: string | null;
  // Optional company stamped onto matching rows / history entries.
  // Follows the same shape as `typeId`: `null` means "explicit no
  // company" (clears any prior pick), `undefined` means "don't touch
  // company". Validator drops a dangling reference to a deleted
  // company silently — same contract as `typeId`.
  companyId?: string | null;
  amountSign?: "any" | "positive" | "negative";
  transferFilter?: "any" | "exclude" | "only";
  // Signed lower / upper bounds on the entry amount, applied on top
  // of `amountSign`. Either may be absent — a missing bound is open-
  // ended in that direction. Useful when one description token
  // covers several services and only one falls in a given price
  // band (e.g. an autogiro line that bills 250–380 kr for one
  // insurance product and a different amount for another).
  amountMin?: number;
  amountMax?: number;
};

// Per-account memory of "the bank wrote X, the user calls it Y".
// Recorded every time the user types a fresh description over a
// history entry (`HistoryEntryEditModal` or the budget-view quick-
// rename — both route through the `updateHistoryEntry` reducer
// chokepoint). The next bank-history import looks the normalised
// bank description back up and offers the stored text as a suggested
// rename in `RenamePredictorModal`. Scope is per-account so the same
// merchant can carry different user labels in different accounts.
// See `src/data/rename-patterns.ts` for the pure helpers; the on-disk
// shape is `Record<accountId, Record<normalisedKey, RenamePattern>>`.
export type RenamePattern = {
  suggestedDescription: string;
  hitCount: number;
  lastUsedAt: number;
  // Optional company id learned alongside the description rename.
  // When the user types a fresh description on a history entry AND
  // assigns a company, the next import suggests both — the modal
  // surfaces the description as the editable field, the company rides
  // along silently so the predicted rename also tags the merchant.
  // Dropped silently by the validator when the referenced company no
  // longer exists.
  suggestedCompanyId?: string;
};

// User-defined rule that auto-reconciles future bank-history entries
// against rows belonging to a recurring series. Learned at confirm
// time in the reconciliation modal — when the user merges one
// occurrence of "Rent" with a "SIMPLEKO" bank entry and picks
// "Apply to whole series", the modal records the inferred pattern
// (`*SIMPLEKO*`), the amount-tolerance band, and the date-lag in
// days. Subsequent imports that match the same series + pattern +
// band collapse silently, no modal required.
//
// `pattern` is the same glob shape as `MatchRule.pattern` (`*`
// matches any run; case-insensitive; substring matching needs
// explicit wrapping `*…*`). `amountTolerancePct` is the percentage
// delta the user accepted at confirmation time, frozen so a one-off
// coincidence doesn't widen all future matches. `dateLagDays` is
// the max observed `history.date - row.date` clamped to
// `RECONCILIATION_DATE_LAG_DAYS`.
export type SeriesMatchRule = {
  id: string;
  seriesId: string;
  pattern: string;
  amountTolerancePct: number;
  dateLagDays: number;
};

// Per-series user metadata keyed by `seriesId` in `UserData.seriesMetadata`.
// Series are not first-class entities (rows share a `seriesId` and the
// recurrence rule isn't persisted), so this map gives the small set of
// per-series toggles a home that survives row deletions. Today only the
// "primary income" path uses it; the shape is open so future per-series
// settings (color override, ignore-in-stats, …) drop in without another
// migration.
//
// `isPrimaryIncome` flags the user's main salary series so the grouping
// pipeline knows to push early-arriving occurrences into the next fiscal
// month. `anchorDayOfMonth` is the "real" payday (the day the salary
// would land if no holiday shift applied) — `computePrimaryIncomeShift`
// reads it to decide whether an actual occurrence arrived early enough
// to warrant the shift.
export type SeriesMetadata = {
  isPrimaryIncome?: boolean;
  anchorDayOfMonth?: number;
};

// One learned "this bank pattern is my salary" rule. Stored as an
// array on `UserData.primaryIncomeMerchants` so a job switch (or a
// secondary income stream from a different bank) just appends a new
// entry instead of overwriting the existing one. `key` is the
// normalised description (`normaliseDescription(entry.description)`)
// so cosmetic bank variations collapse to a single rule; `anchorDayOfMonth`
// is the "real" payday for that source — 25 for one job, 27 for
// another, etc. — and entries dated earlier in the month get
// `fiscalMonthShift = 1` stamped on them so the salary still counts
// toward the next fiscal month.
export type PrimaryIncomeMerchant = {
  key: string;
  anchorDayOfMonth: number;
};
