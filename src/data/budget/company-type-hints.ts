// Company → type hints. Tagging a row with a company surfaces the types
// that company is associated with, two ways:
//
//   1. A company that resolves to exactly ONE type instant-fills it when
//      the company is picked on a row whose type isn't set yet (via
//      `autoTypeForCompany` below, consumed by `useAutoTypeForCompany`).
//   2. A company that resolves to SEVERAL types surfaces its top few as a
//      "Suggested" section at the top of the `TypePicker`, one tap each.
//
// A company's associated types come from two sources, ranked in this
// order:
//   - Manual associations the user pins in the Companies settings tab
//     (`Company.typeIds`), in their drag-controlled priority order.
//   - Types learned from past usage — every place the user has paired
//     `(companyId, typeId)`: budget rows, history-entry overrides, and
//     history-entry splits — ranked by how often the pairing occurs.
//
// Manual ids always rank ahead of merely-learned ones; learned ids are
// de-duplicated against the manual set. The combined list is capped (5
// by default) so the picker's "Suggested" band stays short.

import type { UserData } from "../types";

export const MAX_COMPANY_TYPE_HINTS = 5;

// Walk every explicit `(companyId, typeId)` pairing and tally, per
// company, how many times each type was used with it.
function tallyCompanyTypeUsage(
  data: UserData,
): Map<string, Map<string, number>> {
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
  return tallies;
}

// For every company (any with a manual pin or any learned pairing),
// return its ranked list of associated typeIds: manual pins first in
// their stored priority order, then learned types by descending usage
// count (ties broken by typeId for determinism), de-duplicated, capped
// at `max`. Companies with no association at all are omitted.
export function computeCompanyTypeHints(
  data: UserData,
  max: number = MAX_COMPANY_TYPE_HINTS,
): ReadonlyMap<string, readonly string[]> {
  const tallies = tallyCompanyTypeUsage(data);
  const manualByCompany = new Map<string, readonly string[]>();
  for (const company of data.companies) {
    if (company.typeIds && company.typeIds.length > 0) {
      manualByCompany.set(company.id, company.typeIds);
    }
  }

  const companyIds = new Set<string>([
    ...manualByCompany.keys(),
    ...tallies.keys(),
  ]);

  const out = new Map<string, readonly string[]>();
  for (const companyId of companyIds) {
    const manual = manualByCompany.get(companyId) ?? [];
    const seen = new Set<string>(manual);
    const learned = [...(tallies.get(companyId) ?? new Map()).entries()]
      .filter(([typeId]) => !seen.has(typeId))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([typeId]) => typeId);
    const ranked = [...manual, ...learned].slice(0, max);
    if (ranked.length > 0) out.set(companyId, ranked);
  }
  return out;
}

export const MAX_TYPE_COMPANY_HINTS = 5;

// The inverse of `computeCompanyTypeHints`: for every entry type, the
// companies most often paired with it, ranked by descending usage count
// (ties broken by companyId for determinism), capped at `max`. Picking a
// type first surfaces these as a "Suggested" band atop the description
// popover's CompanyPicker, so the user skips scrolling the full
// alphabetic list to reach the merchant they almost always use for that
// type. Unlike the company → type direction there is no manual-pin
// source (no inverse of `Company.typeIds`), so this is purely
// usage-derived. Types with no learned pairing are omitted.
export function computeTypeCompanyHints(
  data: UserData,
  max: number = MAX_TYPE_COMPANY_HINTS,
): ReadonlyMap<string, readonly string[]> {
  // typeId → (companyId → count). Built from the same explicit
  // `(companyId, typeId)` pairings the company → type tally walks, keyed
  // the other way round.
  const tallies = new Map<string, Map<string, number>>();
  const bump = (companyId: string | undefined, typeId: string | undefined) => {
    if (!companyId || !typeId) return;
    let inner = tallies.get(typeId);
    if (!inner) {
      inner = new Map();
      tallies.set(typeId, inner);
    }
    inner.set(companyId, (inner.get(companyId) ?? 0) + 1);
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

  const out = new Map<string, readonly string[]>();
  for (const [typeId, inner] of tallies) {
    const ranked = [...inner.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, max)
      .map(([companyId]) => companyId);
    if (ranked.length > 0) out.set(typeId, ranked);
  }
  return out;
}

// Derive the single-type instant-fill map from the ranked hints: a
// company whose ranked list resolves to exactly one type is confident
// enough to auto-fill it. The shape (companyId → typeId) is what the
// entry-edit modals and the row-level company writer already consume.
export function companyTypeSuggestionsFromHints(
  hints: ReadonlyMap<string, readonly string[]>,
): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const [companyId, typeIds] of hints) {
    if (typeIds.length === 1) out.set(companyId, typeIds[0]);
  }
  return out;
}

// Compose helper used by every modal and the AppShell row-level company
// writer. Returns the typeId to auto-fill, or `undefined` when no
// auto-fill should happen — either because the user already pinned a
// type, the company was cleared, or the company has no single confident
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
