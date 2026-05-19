// Compare semver triples without pre-release tags. Returns a negative
// number if `a < b`, zero if equal, positive if `a > b`. Defensive
// against missing segments (`"1.2"` → `[1, 2, 0]`) so a hand-edited
// CHANGELOG version doesn't crash the popup.
export function cmpSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}
