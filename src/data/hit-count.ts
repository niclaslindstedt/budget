// "Reinforce-or-reset" hit counter used by the two pattern-memory
// stores (rename-patterns, merchant-hints). Both record a winning
// value alongside a hit count; the next observation either matches
// (increment) or replaces it (reset to 1). Centralising the contract
// keeps the two stores from drifting and gives any future memory
// store the same shape for free.

// Returns `existing + 1` when the new observation reinforces the
// stored winner, `1` otherwise. `existing` is `null` when there is
// no prior record.
export function bumpHitCount(
  existing: number | null,
  sameWinner: boolean,
): number {
  return existing !== null && sameWinner ? existing + 1 : 1;
}
