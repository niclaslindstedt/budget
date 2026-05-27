// `Number.parseInt(text, 10)` wrapped to return `null` instead of NaN
// when the input isn't a finite integer. Lets callers chain a
// `value !== null` gate against the parse result instead of carrying
// the `Number.isFinite(parsed)` check at every site. Same semantics —
// the helper only collapses the parse + finite-check pair.
export function parseInt32(text: string): number | null {
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) ? n : null;
}
