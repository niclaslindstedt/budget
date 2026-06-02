import type {
  Mortgage,
  MortgagePayment,
  Property,
  PropertyValuePoint,
} from "../types";
import { fail, isObject, type Result } from "./helpers";

// ISO yyyy-mm-dd shape check. Lenient on the tail so a stored timestamp
// (yyyy-mm-ddThh:…) still passes — the date prefix is all the property
// surfaces read. Mirrors the salary validator's check.
function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// A non-negative finite amount (a payment leg). Negatives and non-finite
// values are dropped to 0 rather than rejecting the whole file.
function nonNegative(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

// Validate one value-history snapshot. Advisory display data — a
// malformed point is dropped rather than rejecting the whole property
// (mirrors how roles / line-item links are swept elsewhere).
function validateValuePoint(raw: unknown): PropertyValuePoint | null {
  if (!isObject(raw)) return null;
  const { id, date, value } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (!isIsoDate(date)) return null;
  if (!isFiniteNumber(value)) return null;
  return { id, date, value };
}

// Validate one mortgage payment. Drops a malformed payment rather than
// rejecting the whole mortgage.
function validatePayment(raw: unknown): MortgagePayment | null {
  if (!isObject(raw)) return null;
  const { id, date } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (!isIsoDate(date)) return null;
  const payment: MortgagePayment = {
    id,
    date,
    principal: nonNegative(raw.principal),
    interest: nonNegative(raw.interest),
  };
  if (typeof raw.sourceHistoryId === "string" && raw.sourceHistoryId !== "")
    payment.sourceHistoryId = raw.sourceHistoryId;
  if (
    typeof raw.interestSourceHistoryId === "string" &&
    raw.interestSourceHistoryId !== ""
  )
    payment.interestSourceHistoryId = raw.interestSourceHistoryId;
  return payment;
}

// Validate one mortgage. `accountId` is nullable so a mortgage can exist
// before the user binds the account "Find mortgage payments" scans; a
// dangling reference (a deleted account) is dropped to `null` rather than
// rejecting the file — mirrors `validateSalaryView`'s account check. A
// malformed mortgage is dropped rather than failing the whole property.
function validateMortgage(
  raw: unknown,
  knownAccountIds: ReadonlySet<string>,
): Mortgage | null {
  if (!isObject(raw)) return null;
  const { id, name } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (typeof name !== "string") return null;
  const mortgage: Mortgage = { id, name, accountId: null, payments: [] };
  if (
    typeof raw.accountId === "string" &&
    raw.accountId !== "" &&
    knownAccountIds.has(raw.accountId)
  ) {
    mortgage.accountId = raw.accountId;
  }
  if (Array.isArray(raw.payments)) {
    const seen = new Set<string>();
    for (const rawPayment of raw.payments) {
      const payment = validatePayment(rawPayment);
      if (!payment || seen.has(payment.id)) continue;
      seen.add(payment.id);
      mortgage.payments.push(payment);
    }
  }
  return mortgage;
}

// Validate one Property. Required `id` + `name` fail the file (they're
// load-bearing identity); everything else is dropped-if-malformed so a
// single bad optional field can't trap an otherwise-valid budget.
export function validateProperty(
  raw: unknown,
  path: string,
  knownAccountIds: ReadonlySet<string>,
): Result<Property> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  const property: Property = { id, name, valueHistory: [], mortgages: [] };
  if (isFiniteNumber(raw.purchaseAmount))
    property.purchaseAmount = raw.purchaseAmount;
  if (isIsoDate(raw.purchaseDate)) property.purchaseDate = raw.purchaseDate;
  if (Array.isArray(raw.valueHistory)) {
    const seen = new Set<string>();
    for (const rawPoint of raw.valueHistory) {
      const point = validateValuePoint(rawPoint);
      if (!point || seen.has(point.id)) continue;
      seen.add(point.id);
      property.valueHistory.push(point);
    }
  }
  if (Array.isArray(raw.mortgages)) {
    const seen = new Set<string>();
    for (const rawMortgage of raw.mortgages) {
      const mortgage = validateMortgage(rawMortgage, knownAccountIds);
      if (!mortgage || seen.has(mortgage.id)) continue;
      seen.add(mortgage.id);
      property.mortgages.push(mortgage);
    }
  }
  return { ok: true, value: property };
}
