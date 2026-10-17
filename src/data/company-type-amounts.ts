// Amount-aware company → type prediction. The same company often sells
// different things at different price points — a grocery store's big
// weekly shop is "Groceries" while a quick sub-100 purchase is more
// likely "Snacks" — so ranking a company's types by usage count alone
// keeps putting the most common type first even when the amount clearly
// points elsewhere.
//
// This module learns, per `(companyId, typeId)` pairing, the signed
// amounts the user has filed under it (the same budget-row, history-entry
// override, and history-split sources `computeCompanyTypeHints` walks)
// and scores each type for a new amount with a kernel density estimate
// over log-amounts. Summing a kernel per past sample folds the usage
// prior in for free: a type used often near this amount outscores one
// used rarely near it, and both outscore a type only ever used at a very
// different price. Log-space makes the kernel scale-free — 40 vs 60 is
// as "close" as 400 vs 600.
//
// Two consumers:
//   - `createCompanyTypeHintLookup` re-ranks the `TypePicker` "Suggested"
//     band so the most likely types for this amount lead.
//   - `createCompanyTypeSuggestionLookup` extends the single-type
//     instant-fill to multi-type companies when the amount alone makes
//     one type a confident pick.
//
// Purely usage-derived, never stored, recomputed whenever `data` changes.

import { MAX_COMPANY_TYPE_HINTS } from "./company-type-hints";
import { findColumnByType } from "./sheet";
import type { UserData } from "./types";

// companyId → typeId → signed amounts the pairing was used with.
export type CompanyTypeAmountModel = ReadonlyMap<
  string,
  ReadonlyMap<string, readonly number[]>
>;

// Kernel bandwidth in natural-log units. 0.35 ≈ a factor of 1.4 either
// side carries most of a sample's weight: 100 vs 120 is a near match,
// 100 vs 300 contributes almost nothing.
const LOG_BANDWIDTH = 0.35;

// Total kernel weight below which the amount is too far from every past
// sample to say anything — the ranking falls back to the usage order.
const MIN_RANKING_EVIDENCE = 0.25;

// A multi-type company instant-fills only when the leading type holds at
// least this share of the amount-weighted evidence…
export const CONFIDENT_TYPE_SHARE = 0.8;
// …and has at least this much kernel weight behind it (≈ two close past
// samples), so one lucky sample can't auto-fill on its own.
export const MIN_CONFIDENT_SUPPORT = 2;

// Walk every explicit `(companyId, typeId)` pairing that carries a
// non-zero amount and collect the amounts per pairing.
export function computeCompanyTypeAmountModel(
  data: UserData,
): CompanyTypeAmountModel {
  const model = new Map<string, Map<string, number[]>>();
  const add = (
    companyId: string | null | undefined,
    typeId: string | null | undefined,
    amount: unknown,
  ) => {
    if (!companyId || !typeId) return;
    if (typeof amount !== "number" || !Number.isFinite(amount)) return;
    if (amount === 0) return;
    let byType = model.get(companyId);
    if (!byType) {
      byType = new Map();
      model.set(companyId, byType);
    }
    const list = byType.get(typeId);
    if (list) list.push(amount);
    else byType.set(typeId, [amount]);
  };
  for (const sheet of data.sheets) {
    for (const item of sheet.items) {
      if (item.type !== "accountBudget") continue;
      const amountId = findColumnByType(item.columns, "amount")?.id;
      if (!amountId) continue;
      for (const row of item.rows) {
        add(row.companyId, row.typeId, row.cells[amountId]);
      }
    }
  }
  for (const list of Object.values(data.history)) {
    for (const entry of list) {
      if (entry.splits && entry.splits.length > 0) {
        for (const split of entry.splits) {
          add(split.companyId, split.typeId, split.amount);
        }
        continue;
      }
      add(entry.userCompanyId, entry.userTypeId, entry.amount);
    }
  }
  return model;
}

// Score every type the company has been used with for `amount`: the sum
// of a Gaussian kernel over the log-distance to each past same-sign
// sample. Opposite-sign samples never count — a refund or an income
// says nothing about what a purchase is. Types with no same-sign sample
// are omitted.
export function scoreTypesForAmount(
  samplesByType: ReadonlyMap<string, readonly number[]>,
  amount: number,
): Map<string, number> {
  const scores = new Map<string, number>();
  if (!Number.isFinite(amount) || amount === 0) return scores;
  const x = Math.log(Math.abs(amount));
  const positive = amount > 0;
  const denom = 2 * LOG_BANDWIDTH * LOG_BANDWIDTH;
  for (const [typeId, samples] of samplesByType) {
    let score = 0;
    for (const s of samples) {
      if (s > 0 !== positive) continue;
      const d = Math.log(Math.abs(s)) - x;
      score += Math.exp(-(d * d) / denom);
    }
    if (score > 0) scores.set(typeId, score);
  }
  return scores;
}

// Re-rank a company's base hint ids (manual pins, then usage order) for
// `amount`. Types the company has been used with near this amount lead,
// highest score first; every other candidate keeps its base order after
// them. Types learned from usage but cut from the capped base list are
// considered too, so a rarely-used type can still surface when the
// amount matches it. Falls back to the base list when the amount is
// unknown or far from every past sample.
export function rankTypesForAmount(
  baseIds: readonly string[],
  samplesByType: ReadonlyMap<string, readonly number[]> | undefined,
  amount: number | null | undefined,
  max: number = MAX_COMPANY_TYPE_HINTS,
): readonly string[] {
  if (!samplesByType || typeof amount !== "number") return baseIds;
  const scores = scoreTypesForAmount(samplesByType, amount);
  let total = 0;
  for (const s of scores.values()) total += s;
  if (total < MIN_RANKING_EVIDENCE) return baseIds;
  const candidates = [...baseIds];
  const seen = new Set(baseIds);
  for (const typeId of scores.keys()) {
    if (!seen.has(typeId)) candidates.push(typeId);
  }
  // Negligible scores (a sample several bandwidths away) don't count as
  // an amount match — they keep their base position rather than jumping
  // ahead of a manual pin on a rounding error.
  const floor = total * 0.01;
  const scoreOf = (id: string) => {
    const s = scores.get(id) ?? 0;
    return s >= floor ? s : 0;
  };
  const baseRank = new Map(candidates.map((id, i) => [id, i]));
  return candidates
    .sort(
      (a, b) => scoreOf(b) - scoreOf(a) || baseRank.get(a)! - baseRank.get(b)!,
    )
    .slice(0, max);
}

// The one type the amount confidently points to for this company, or
// `undefined` when the evidence is thin or split. See
// `CONFIDENT_TYPE_SHARE` / `MIN_CONFIDENT_SUPPORT`.
export function predictTypeForAmount(
  samplesByType: ReadonlyMap<string, readonly number[]> | undefined,
  amount: number | null | undefined,
): string | undefined {
  if (!samplesByType || typeof amount !== "number") return undefined;
  const scores = scoreTypesForAmount(samplesByType, amount);
  let total = 0;
  let bestId: string | undefined;
  let best = 0;
  for (const [typeId, s] of scores) {
    total += s;
    if (s > best) {
      best = s;
      bestId = typeId;
    }
  }
  if (bestId === undefined) return undefined;
  if (best < MIN_CONFIDENT_SUPPORT) return undefined;
  if (best / total < CONFIDENT_TYPE_SHARE) return undefined;
  return bestId;
}

// Amount-aware view over the company → type hints. A plain
// `ReadonlyMap<string, readonly string[]>` satisfies it too (the amount
// argument is simply ignored), so tests and callers without amounts can
// keep passing the static hints.
export type CompanyTypeHintLookup = {
  get(companyId: string, amount?: number | null): readonly string[] | undefined;
};

// Amount-aware view over the single-type instant-fill map. A plain
// `ReadonlyMap<string, string>` satisfies it too.
export type CompanyTypeSuggestionLookup = {
  get(companyId: string, amount?: number | null): string | undefined;
};

export function createCompanyTypeHintLookup(
  hints: ReadonlyMap<string, readonly string[]>,
  model: CompanyTypeAmountModel,
): CompanyTypeHintLookup {
  return {
    get(companyId, amount) {
      const base = hints.get(companyId);
      if (!base) return undefined;
      return rankTypesForAmount(base, model.get(companyId), amount);
    },
  };
}

// A company that resolves to exactly one type always instant-fills it
// (the amount can't make a lone candidate wrong); a multi-type company
// instant-fills only when the amount confidently picks one.
export function createCompanyTypeSuggestionLookup(
  hints: ReadonlyMap<string, readonly string[]>,
  model: CompanyTypeAmountModel,
): CompanyTypeSuggestionLookup {
  return {
    get(companyId, amount) {
      const base = hints.get(companyId);
      if (!base || base.length === 0) return undefined;
      if (base.length === 1) return base[0];
      return predictTypeForAmount(model.get(companyId), amount);
    },
  };
}
