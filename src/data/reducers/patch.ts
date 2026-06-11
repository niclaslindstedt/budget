// Apply a patch to an id-keyed entity, treating an explicit `undefined`
// value as "delete this key" rather than "set the key to undefined" — so
// clearing an optional field (drop a rate, clear a date, disable
// depreciation) keeps the live record byte-identical to one reloaded from
// storage, where absent optional fields simply aren't present, and
// re-saves / round-trips don't drift.
export function applyPatch<T extends { id: string }>(
  entity: T,
  patch: Partial<Omit<T, "id">>,
): T {
  const next: T = { ...entity };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete next[key as keyof T];
    } else {
      // The patch is typed against the entity, so each value matches its
      // key; the cast satisfies the index write the loop can't narrow.
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}
