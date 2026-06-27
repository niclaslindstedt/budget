// Locate the leading run of `text` that a type-ahead `query` matched,
// so the matched characters can be highlighted on the active option.
// Mirrors the matching rule in `useTypeahead`: a case-insensitive
// prefix match on the trimmed label. Returns the `[start, end)` slice
// indices into the original `text`, or `null` when there's nothing to
// highlight — an empty query, or a label that doesn't start with the
// query once any leading whitespace (which the matcher ignores) is
// skipped.
export function matchPrefixRange(
  text: string,
  query: string,
): { start: number; end: number } | null {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return null;
  // The matcher compares against `label.trim()`, so skip the same
  // leading whitespace here and map the match back onto the raw text.
  const leading = text.length - text.trimStart().length;
  const body = text.slice(leading);
  if (!body.toLowerCase().startsWith(q)) return null;
  return { start: leading, end: leading + q.length };
}
