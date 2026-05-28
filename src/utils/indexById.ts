// Build a `Map<id, item>` from an array of items that carry a string
// `id`. Callers reach for this when a downstream loop would otherwise
// rescan the array linearly per lookup — the index is built once at the
// boundary and the per-lookup cost drops to O(1).
export function indexById<T extends { id: string }>(
  items: readonly T[],
): Map<string, T> {
  const m = new Map<string, T>();
  for (const item of items) m.set(item.id, item);
  return m;
}
