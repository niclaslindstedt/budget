import type {
  Mortgage,
  MortgageAmortization,
  MortgagePayment,
  MortgageRateChange,
  Property,
  PropertyRepair,
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
// rejecting the whole mortgage. The `amount` is read directly; a
// pre-merge payment that still carries the old `principal` / `interest`
// legs (e.g. a hand-edited file the migration didn't touch) folds them
// into a single amount so the value survives.
function validatePayment(raw: unknown): MortgagePayment | null {
  if (!isObject(raw)) return null;
  const { id, date } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (!isIsoDate(date)) return null;
  const amount = isFiniteNumber(raw.amount)
    ? nonNegative(raw.amount)
    : nonNegative(raw.principal) + nonNegative(raw.interest);
  const payment: MortgagePayment = { id, date, amount };
  if (typeof raw.sourceHistoryId === "string" && raw.sourceHistoryId !== "")
    payment.sourceHistoryId = raw.sourceHistoryId;
  return payment;
}

// Validate one repair / renovation. Its identity fields — `id`, `date`,
// `typeId`, and the `accountId` / `sourceHistoryId` pair locating the
// source bank charge — are all required (a repair with no source can't
// resolve its receipt). The `accountId` is NOT gated on the known-account
// set: a repair whose source account was later deleted keeps its snapshot
// (the receipt simply resolves as missing), mirroring how a
// `MortgagePayment.sourceHistoryId` is preserved unconditionally. The
// `amount` is coerced non-negative and `description` defaults to "". A
// malformed repair is dropped rather than rejecting the whole property.
function validateRepair(raw: unknown): PropertyRepair | null {
  if (!isObject(raw)) return null;
  const { id, date, typeId, accountId, sourceHistoryId } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (!isIsoDate(date)) return null;
  if (typeof typeId !== "string" || typeId === "") return null;
  if (typeof accountId !== "string" || accountId === "") return null;
  if (typeof sourceHistoryId !== "string" || sourceHistoryId === "")
    return null;
  return {
    id,
    date,
    typeId,
    accountId,
    sourceHistoryId,
    amount: nonNegative(raw.amount),
    description: typeof raw.description === "string" ? raw.description : "",
  };
}

// Validate one rate change. A blank `date` (the original rate) is kept as
// such; a non-blank one must look like an ISO date. The rate is coerced
// non-negative. A malformed entry is dropped rather than rejecting the
// mortgage.
function validateRateChange(raw: unknown): MortgageRateChange | null {
  if (!isObject(raw)) return null;
  const { id } = raw;
  if (typeof id !== "string" || id === "") return null;
  const date =
    typeof raw.date === "string" && (raw.date === "" || isIsoDate(raw.date))
      ? raw.date
      : null;
  if (date === null) return null;
  if (!isFiniteNumber(raw.rate)) return null;
  return { id, date, rate: nonNegative(raw.rate) };
}

// Validate a mortgage's amortisation. A discriminated object — `percent`
// of the initial loan (annual) or a `fixed` monthly sum, both
// non-negative. A malformed / unknown shape drops to undefined (the
// mortgage keeps no amortisation) rather than rejecting the mortgage.
function validateAmortization(raw: unknown): MortgageAmortization | undefined {
  if (!isObject(raw)) return undefined;
  if (raw.mode === "percent" && isFiniteNumber(raw.percent) && raw.percent >= 0)
    return { mode: "percent", percent: raw.percent };
  if (raw.mode === "fixed" && isFiniteNumber(raw.amount) && raw.amount >= 0)
    return { mode: "fixed", amount: raw.amount };
  return undefined;
}

// Validate one mortgage. The bound account lives on the parent property
// now (`Property.accountId`), so a mortgage carries only its name, terms,
// and payments. A malformed mortgage is dropped rather than failing the
// whole property.
function validateMortgage(raw: unknown): Mortgage | null {
  if (!isObject(raw)) return null;
  const { id, name } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (typeof name !== "string") return null;
  const mortgage: Mortgage = { id, name, payments: [] };
  // Loan terms — all manually entered and optional. A malformed value is
  // dropped (the field stays absent) rather than rejecting the mortgage.
  if (isFiniteNumber(raw.loanAmount)) mortgage.loanAmount = raw.loanAmount;
  if (isFiniteNumber(raw.currentBalance))
    mortgage.currentBalance = raw.currentBalance;
  if (isFiniteNumber(raw.interestRate))
    mortgage.interestRate = raw.interestRate;
  // Past rate changes (effective-dated). Drop malformed entries and dedupe
  // by id; an emptied list is left absent rather than stored as `[]`.
  if (Array.isArray(raw.rateHistory)) {
    const seen = new Set<string>();
    const rateHistory: MortgageRateChange[] = [];
    for (const rawChange of raw.rateHistory) {
      const change = validateRateChange(rawChange);
      if (!change || seen.has(change.id)) continue;
      seen.add(change.id);
      rateHistory.push(change);
    }
    if (rateHistory.length > 0) mortgage.rateHistory = rateHistory;
  }
  if (isFiniteNumber(raw.rateChangeMonths))
    mortgage.rateChangeMonths = raw.rateChangeMonths;
  if (isIsoDate(raw.nextRateChangeDate))
    mortgage.nextRateChangeDate = raw.nextRateChangeDate;
  const amortization = validateAmortization(raw.amortization);
  if (amortization) mortgage.amortization = amortization;
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
  knownCompanyIds: ReadonlySet<string>,
): Result<Property> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  const property: Property = {
    id,
    name,
    valueHistory: [],
    mortgages: [],
    repairs: [],
  };
  // The lender, referencing a known company. A dangling reference (the
  // company was deleted) is dropped — mirrors `Row.companyId`.
  if (
    typeof raw.companyId === "string" &&
    raw.companyId !== "" &&
    knownCompanyIds.has(raw.companyId)
  ) {
    property.companyId = raw.companyId;
  }
  // The bound account "Find mortgage payments" scans. Nullable so a
  // property can exist before the user binds it; a dangling reference (a
  // deleted account) is dropped to `null` rather than rejecting the file —
  // mirrors `validateSalaryView`'s account check.
  if (
    typeof raw.accountId === "string" &&
    raw.accountId !== "" &&
    knownAccountIds.has(raw.accountId)
  ) {
    property.accountId = raw.accountId;
  }
  if (isFiniteNumber(raw.purchaseAmount))
    property.purchaseAmount = raw.purchaseAmount;
  if (isIsoDate(raw.purchaseDate)) property.purchaseDate = raw.purchaseDate;
  // Living area in square metres. Non-negative finite only; a bad value
  // is dropped (the field goes absent) rather than rejecting the file.
  if (isFiniteNumber(raw.size) && raw.size >= 0) property.size = raw.size;
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
      const mortgage = validateMortgage(rawMortgage);
      if (!mortgage || seen.has(mortgage.id)) continue;
      seen.add(mortgage.id);
      property.mortgages.push(mortgage);
    }
  }
  if (Array.isArray(raw.repairs)) {
    const seen = new Set<string>();
    for (const rawRepair of raw.repairs) {
      const repair = validateRepair(rawRepair);
      if (!repair || seen.has(repair.id)) continue;
      seen.add(repair.id);
      property.repairs.push(repair);
    }
  }
  return { ok: true, value: property };
}
