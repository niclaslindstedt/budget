import type { SwedishTaxParams, TaxParams, TaxProfile } from "../types";
import { fail, isObject, type Result } from "./helpers";

// Supported `TaxCountry` discriminants. A profile whose country isn't
// here is rejected so the engine never dispatches to a missing
// calculator. Grows one literal per country alongside `TaxCountry`.
const TAX_COUNTRIES = new Set(["SE"]);

const INCOME_KINDS = new Set(["employment", "pension"]);

// Validate the SE-specific params. The municipality id is kept as-is
// even when it isn't in the current table — the calculator falls back
// to the national average for an unknown kommun, so a stale id degrades
// gracefully rather than failing the load.
function validateSwedishParams(
  raw: Record<string, unknown>,
  path: string,
): Result<SwedishTaxParams> {
  const { municipalityId, churchMember, incomeKind } = raw;
  if (typeof municipalityId !== "string" || municipalityId === "")
    return fail(`${path}.municipalityId`, "expected a non-empty string");
  if (typeof churchMember !== "boolean")
    return fail(`${path}.churchMember`, "expected a boolean");
  if (typeof incomeKind !== "string" || !INCOME_KINDS.has(incomeKind))
    return fail(`${path}.incomeKind`, 'expected "employment" or "pension"');
  const params: SwedishTaxParams = {
    country: "SE",
    municipalityId,
    churchMember,
    incomeKind: incomeKind as SwedishTaxParams["incomeKind"],
  };
  // Optional year override — drop a non-finite / out-of-shape value.
  if (typeof raw.year === "number" && Number.isFinite(raw.year))
    params.year = Math.trunc(raw.year);
  if (typeof raw.birthYear === "number" && Number.isFinite(raw.birthYear))
    params.birthYear = Math.trunc(raw.birthYear);
  return { ok: true, value: params };
}

function validateTaxParams(raw: unknown, path: string): Result<TaxParams> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const country = raw.country;
  if (typeof country !== "string" || !TAX_COUNTRIES.has(country))
    return fail(`${path}.country`, `unknown tax country "${String(country)}"`);
  // Today the union has only SE; the branch keeps the per-country
  // dispatch explicit so a new country slots in beside it.
  if (country === "SE") return validateSwedishParams(raw, path);
  return fail(`${path}.country`, `unsupported tax country "${country}"`);
}

export function validateTaxProfile(
  raw: unknown,
  path: string,
): Result<TaxProfile> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  const params = validateTaxParams(raw.params, `${path}.params`);
  if (!params.ok) return params;
  return { ok: true, value: { id, name, params: params.value } };
}
