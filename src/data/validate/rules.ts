import { PRESET_ENTRY_TYPE_IDS } from "../constants";
import type {
  EntryTypeKind,
  MatchRule,
  MerchantHint,
  PrimaryIncomeMerchant,
  RenamePattern,
  SeriesMatchRule,
  SeriesMetadata,
} from "../types";
import { isObject } from "./helpers";

// Merchant-hint validator. Drops hints whose typeId no longer
// references a known type so a deleted EntryType can't trap a hint in
// zombie state. Bogus shapes return null so the caller can skip the
// entry rather than rejecting the whole load — hints are advisory.
export function validateMerchantHint(
  raw: unknown,
  knownTypeIds: ReadonlySet<string>,
  knownCompanyIds: ReadonlySet<string>,
): MerchantHint | null {
  if (!isObject(raw)) return null;
  const { hitCount, lastUsedAt, typeId, description, companyId } = raw;
  if (typeof typeId !== "string" || typeId === "") return null;
  if (!knownTypeIds.has(typeId)) return null;
  if (typeof hitCount !== "number" || !Number.isFinite(hitCount)) return null;
  if (typeof lastUsedAt !== "number" || !Number.isFinite(lastUsedAt)) {
    return null;
  }
  const hint: MerchantHint = {
    typeId,
    hitCount: Math.max(0, Math.floor(hitCount)),
    lastUsedAt,
  };
  if (typeof description === "string" && description.trim() !== "") {
    hint.description = description;
  }
  if (
    typeof companyId === "string" &&
    companyId !== "" &&
    knownCompanyIds.has(companyId)
  ) {
    hint.companyId = companyId;
  }
  return hint;
}

// Match-rule validator. Drops rules whose typeId no longer resolves
// so a deleted type can't trap a rule in zombie state. Returns null
// for unsalvageable shapes (no pattern, no id) so the loader can skip
// the row rather than rejecting the whole file — rules are advisory
// like merchant hints.
export function validateMatchRule(
  raw: unknown,
  knownTypeIds: ReadonlySet<string>,
  knownCompanyIds: ReadonlySet<string>,
): MatchRule | null {
  if (!isObject(raw)) return null;
  const { id, pattern } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (typeof pattern !== "string" || pattern === "") return null;
  const rule: MatchRule = { id, pattern };
  if (typeof raw.description === "string" && raw.description.trim() !== "") {
    rule.description = raw.description;
  }
  if (raw.typeId === null) {
    rule.typeId = null;
  } else if (
    typeof raw.typeId === "string" &&
    raw.typeId !== "" &&
    knownTypeIds.has(raw.typeId)
  ) {
    rule.typeId = raw.typeId;
  }
  if (raw.companyId === null) {
    rule.companyId = null;
  } else if (
    typeof raw.companyId === "string" &&
    raw.companyId !== "" &&
    knownCompanyIds.has(raw.companyId)
  ) {
    rule.companyId = raw.companyId;
  }
  if (
    raw.amountSign === "any" ||
    raw.amountSign === "positive" ||
    raw.amountSign === "negative"
  ) {
    rule.amountSign = raw.amountSign;
  }
  if (
    raw.transferFilter === "any" ||
    raw.transferFilter === "exclude" ||
    raw.transferFilter === "only"
  ) {
    rule.transferFilter = raw.transferFilter;
  }
  if (typeof raw.amountMin === "number" && Number.isFinite(raw.amountMin)) {
    rule.amountMin = raw.amountMin;
  }
  if (typeof raw.amountMax === "number" && Number.isFinite(raw.amountMax)) {
    rule.amountMax = raw.amountMax;
  }
  // Drop an inverted band silently — a rule with min > max could
  // never fire and almost certainly indicates a hand-edited typo.
  if (
    rule.amountMin !== undefined &&
    rule.amountMax !== undefined &&
    rule.amountMin > rule.amountMax
  ) {
    delete rule.amountMin;
    delete rule.amountMax;
  }
  return rule;
}

// Rename-pattern validator. Advisory like `validateMerchantHint`:
// bogus shapes return null so the loader can skip the entry rather
// than rejecting the whole file. Empty suggested text would mean
// "suggest nothing" which is identical to having no pattern at all,
// so it's treated as unsalvageable too.
export function validateRenamePattern(
  raw: unknown,
  knownCompanyIds: ReadonlySet<string>,
): RenamePattern | null {
  if (!isObject(raw)) return null;
  const { suggestedDescription, hitCount, lastUsedAt, suggestedCompanyId } =
    raw;
  if (
    typeof suggestedDescription !== "string" ||
    suggestedDescription.trim() === ""
  ) {
    return null;
  }
  if (typeof hitCount !== "number" || !Number.isFinite(hitCount)) return null;
  if (typeof lastUsedAt !== "number" || !Number.isFinite(lastUsedAt)) {
    return null;
  }
  const pattern: RenamePattern = {
    suggestedDescription,
    hitCount: Math.max(0, Math.floor(hitCount)),
    lastUsedAt,
  };
  if (
    typeof suggestedCompanyId === "string" &&
    suggestedCompanyId !== "" &&
    knownCompanyIds.has(suggestedCompanyId)
  ) {
    pattern.suggestedCompanyId = suggestedCompanyId;
  }
  return pattern;
}

// Series-match-rule validator. Advisory like `validateMatchRule`:
// returns null for shapes that can't be salvaged so a bogus entry is
// silently dropped rather than rejecting the whole file. Tolerance
// values outside the sane band (negative, NaN, > 1) are clamped so a
// hand-edited file can't widen matching beyond what the import flow
// would normally accept.
export function validateSeriesMatchRule(raw: unknown): SeriesMatchRule | null {
  if (!isObject(raw)) return null;
  const { id, seriesId, pattern, amountTolerancePct, dateLagDays } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (typeof seriesId !== "string" || seriesId === "") return null;
  if (typeof pattern !== "string" || pattern === "") return null;
  const pct =
    typeof amountTolerancePct === "number" &&
    Number.isFinite(amountTolerancePct) &&
    amountTolerancePct >= 0 &&
    amountTolerancePct <= 1
      ? amountTolerancePct
      : 0;
  const lag =
    typeof dateLagDays === "number" &&
    Number.isFinite(dateLagDays) &&
    dateLagDays >= 0 &&
    dateLagDays <= 31
      ? Math.floor(dateLagDays)
      : 0;
  return { id, seriesId, pattern, amountTolerancePct: pct, dateLagDays: lag };
}

export function validatePrimaryIncomeMerchant(
  raw: unknown,
): PrimaryIncomeMerchant | null {
  if (!isObject(raw)) return null;
  if (typeof raw.key !== "string" || raw.key === "") return null;
  if (typeof raw.anchorDayOfMonth !== "number") return null;
  const day = Math.trunc(raw.anchorDayOfMonth);
  if (day < 1 || day > 31) return null;
  return { key: raw.key, anchorDayOfMonth: day };
}

export function validateSeriesMetadata(raw: unknown): SeriesMetadata | null {
  if (!isObject(raw)) return null;
  const out: SeriesMetadata = {};
  if (raw.isPrimaryIncome === true) out.isPrimaryIncome = true;
  if (typeof raw.anchorDayOfMonth === "number") {
    const day = Math.trunc(raw.anchorDayOfMonth);
    if (day >= 1 && day <= 31) out.anchorDayOfMonth = day;
  }
  return out;
}

// Per-user override map for the `kind` of preset entry types. Keys
// must be known preset ids; values must be one of the three valid
// kinds. Anything else is silently dropped so a hand-edited file
// can't trap the loader. Returns an empty object when missing or
// malformed.
export function validatePresetTypeKindOverrides(
  raw: unknown,
): Record<string, EntryTypeKind> {
  if (!isObject(raw)) return {};
  const out: Record<string, EntryTypeKind> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== "string" || key === "") continue;
    if (!PRESET_ENTRY_TYPE_IDS.has(key)) continue;
    if (value === "income" || value === "expense" || value === "any") {
      out[key] = value;
    }
  }
  return out;
}
