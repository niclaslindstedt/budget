// Company → type auto-fill suggestions. When the user tags a row with
// a company that they've already used together with a single type often
// enough, the picker auto-fills the row's type from past evidence.
//
// "Often enough" is the user-configurable
// `Settings.companyTypeAutoFillMinOccurrences` threshold; "single type"
// means every past tagged-with-company occurrence shares one typeId.
// Tied or mixed companies don't surface here — auto-fill must be
// confident.

import type { UserData } from "../types";

// Walk every place the user explicitly pairs `(companyId, typeId)` —
// budget rows, history-entry overrides, and history-entry splits — and
// return, for each company that meets the threshold AND has only one
// distinct type ever paired with it, the typeId to auto-fill on the
// next row tagged to that company. A `minOccurrences` of 0 turns the
// suggestion off entirely.
export function computeCompanyTypeSuggestions(
  data: UserData,
  minOccurrences: number,
): ReadonlyMap<string, string> {
  if (minOccurrences <= 0) return new Map();
  const tallies = new Map<string, Map<string, number>>();
  const bump = (companyId: string | undefined, typeId: string | undefined) => {
    if (!companyId || !typeId) return;
    let inner = tallies.get(companyId);
    if (!inner) {
      inner = new Map();
      tallies.set(companyId, inner);
    }
    inner.set(typeId, (inner.get(typeId) ?? 0) + 1);
  };
  for (const sheet of data.sheets) {
    for (const item of sheet.items) {
      if (item.type !== "accountBudget") continue;
      for (const row of item.rows) {
        bump(row.companyId, row.typeId);
      }
    }
  }
  for (const list of Object.values(data.history)) {
    for (const entry of list) {
      if (entry.splits && entry.splits.length > 0) {
        for (const split of entry.splits) {
          bump(split.companyId ?? undefined, split.typeId ?? undefined);
        }
        continue;
      }
      bump(entry.userCompanyId, entry.userTypeId);
    }
  }
  const out = new Map<string, string>();
  for (const [companyId, typesMap] of tallies) {
    if (typesMap.size !== 1) continue;
    const entry = typesMap.entries().next().value;
    if (!entry) continue;
    const [typeId, count] = entry;
    if (count >= minOccurrences) out.set(companyId, typeId);
  }
  return out;
}

// Compose helper used by every modal and the AppShell row-level
// company writer. Returns the typeId to auto-fill, or `undefined` when
// no auto-fill should happen — either because the user already pinned a
// type, the company was cleared, or the company has no confident
// suggestion. Callers decide whether to write that into local state or
// dispatch it alongside the company write.
export function autoTypeForCompany(
  currentTypeId: string | null,
  nextCompanyId: string | null,
  suggestions: ReadonlyMap<string, string>,
): string | undefined {
  if (currentTypeId !== null) return undefined;
  if (nextCompanyId === null) return undefined;
  return suggestions.get(nextCompanyId);
}
