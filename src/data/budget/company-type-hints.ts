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

import {
  isNormalisedKeyMeaningful,
  normaliseDescription,
} from "../description-normaliser";
import { findColumnByType } from "../sheet";
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

export const MAX_DESCRIPTION_COMPANY_HINTS = 5;

// Description → company candidates. Every time the user flags a row or
// a bank-history entry with a company, that `(description, companyId)`
// pairing teaches the picker which merchant goes with which company.
// The description is run through the shared `normaliseDescription` so
// dates, reference numbers, and currency tokens are stripped and
// cosmetic statement noise collapses ("KORTKÖP SPOTIFY 12/05" and
// "SPOTIFY*P34AB" map to one key); the companies most often paired with
// that key are then ranked by descending usage (ties broken by
// companyId for determinism) and capped at `max`. The next time a row
// or entry with the same merchant pattern needs a company, the
// `CompanyPicker` surfaces these as a one-tap "Suggested" band — the
// same treatment the type → company hints get, but keyed off the
// description instead of a picked type, so it works before any type is
// set. Purely usage-derived (no manual-pin source) and recomputed from
// data, so the guesses get steadily smarter as more entries are
// tagged. Keys too short to identify a merchant are skipped, as are
// rows / entries with no company. The same `(companyId, typeId)`
// sources the type tallies walk are reused, keyed on the normalised
// description instead.
export function computeDescriptionCompanyHints(
  data: UserData,
  max: number = MAX_DESCRIPTION_COMPANY_HINTS,
): ReadonlyMap<string, readonly string[]> {
  // normalisedKey → (companyId → count)
  const tallies = new Map<string, Map<string, number>>();
  const bump = (
    description: string | undefined,
    companyId: string | undefined,
  ) => {
    if (!description || !companyId) return;
    const key = normaliseDescription(description);
    if (!isNormalisedKeyMeaningful(key)) return;
    let inner = tallies.get(key);
    if (!inner) {
      inner = new Map();
      tallies.set(key, inner);
    }
    inner.set(companyId, (inner.get(companyId) ?? 0) + 1);
  };
  for (const sheet of data.sheets) {
    for (const item of sheet.items) {
      if (item.type !== "accountBudget") continue;
      const descId = findColumnByType(item.columns, "description")?.id;
      if (!descId) continue;
      for (const row of item.rows) {
        const desc = row.cells[descId];
        if (typeof desc !== "string") continue;
        bump(desc, row.companyId);
      }
    }
  }
  for (const list of Object.values(data.history)) {
    for (const entry of list) {
      if (entry.splits && entry.splits.length > 0) {
        for (const split of entry.splits) {
          bump(entry.description, split.companyId ?? undefined);
        }
        continue;
      }
      bump(entry.description, entry.userCompanyId);
    }
  }

  const out = new Map<string, readonly string[]>();
  for (const [key, inner] of tallies) {
    const ranked = [...inner.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, max)
      .map(([companyId]) => companyId);
    if (ranked.length > 0) out.set(key, ranked);
  }
  return out;
}

// Resolve a description to its ranked company candidates via the map
// from `computeDescriptionCompanyHints`. Centralises the normalisation
// + meaningfulness guard so every CompanyPicker call site looks the
// merchant up the same way. Empty when the description is blank, too
// short to be meaningful, or has no learned company pairing yet.
export function descriptionCompanyHintsFor(
  hints: ReadonlyMap<string, readonly string[]>,
  description: string | null | undefined,
): readonly string[] {
  if (!description) return [];
  const key = normaliseDescription(description);
  if (!isNormalisedKeyMeaningful(key)) return [];
  return hints.get(key) ?? [];
}

// Merge description-derived company candidates with type-derived ones
// into a single ranked, de-duplicated band. Description hits lead —
// they're the strongest signal (the same merchant the user tagged
// before) — and the type's usual companies fill the rest, so the
// `CompanyPicker` "Suggested" band reads "the company you used for this
// merchant" first, then "companies you tend to use for this type".
// Capped so the band stays short.
export function mergeCompanyHintIds(
  descriptionHintIds: readonly string[],
  typeHintIds: readonly string[],
  max: number = MAX_DESCRIPTION_COMPANY_HINTS,
): readonly string[] {
  if (descriptionHintIds.length === 0) return typeHintIds.slice(0, max);
  if (typeHintIds.length === 0) return descriptionHintIds.slice(0, max);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of descriptionHintIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) return out;
  }
  for (const id of typeHintIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) return out;
  }
  return out;
}
