// Free-text → domain-value helpers used by every form that takes a
// user-typed name or optional description and folds it into a
// persisted shape. Two flavours mirror the two conventions on
// `src/data/types/`:
//
// - `normalizeName(text)` returns the trimmed value or `null` when
//   the input is empty after trimming. Use at submit-gates that need
//   both a "can save?" boolean and the trimmed value (categories,
//   account names, sheet names, types) — `value !== null` is the
//   save gate, `value` is the persisted name.
//
// - `normalizeOptional(text)` returns the trimmed value or
//   `undefined` for "absent / not provided" — the convention for
//   `field?: string` shapes (rule description, account description).
//   Folds the recurring `text.trim() === "" ? undefined : text.trim()`
//   pattern onto one call.

export function normalizeName(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeOptional(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
