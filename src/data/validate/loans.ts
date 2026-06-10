import type {
  CategoryIcon,
  Loan,
  LoanBalancePoint,
  LoanKind,
  LoanPayment,
  Property,
} from "../types";
import { CATEGORY_ICONS, fail, isObject, type Result } from "./helpers";

// ISO yyyy-mm-dd shape check. Lenient on the tail so a stored timestamp
// (yyyy-mm-ddThh:…) still passes. Mirrors the savings validator's check.
function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
}

function isNonNegativeNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

const LOAN_KINDS: ReadonlySet<string> = new Set<LoanKind>([
  "student",
  "mortgage",
  "car",
  "private",
  "personal",
]);

// Validate one recorded payment. Advisory display data — a malformed
// payment is dropped rather than rejecting the whole loan (mirrors the
// mortgage-payment sweep).
function validatePayment(raw: unknown): LoanPayment | null {
  if (!isObject(raw)) return null;
  const { id, date, amount } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (!isIsoDate(date)) return null;
  if (!isNonNegativeNumber(amount)) return null;
  const payment: LoanPayment = { id, date, amount };
  if (typeof raw.sourceHistoryId === "string" && raw.sourceHistoryId !== "") {
    payment.sourceHistoryId = raw.sourceHistoryId;
  }
  return payment;
}

// Validate one balance-history snapshot. Advisory display data — a
// malformed point is dropped rather than rejecting the whole loan
// (mirrors the savings balance-point sweep).
function validateBalancePoint(raw: unknown): LoanBalancePoint | null {
  if (!isObject(raw)) return null;
  const { id, date, value } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (!isIsoDate(date)) return null;
  if (!isNonNegativeNumber(value)) return null;
  return { id, date, value };
}

// Validate one loan. Required `id` + `name` + a known `kind` fail the file —
// they're load-bearing identity; everything else is dropped-if-malformed so
// a single bad optional field can't trap an otherwise-valid budget. A
// dangling `companyId` is swept to absent, and the `propertyId` /
// `mortgageIds` link survives only as the subset of ids that resolve
// against the already-validated property — a deleted mortgage falls out of
// the list, and a link with no surviving ids drops entirely so the loan
// degrades to an unlinked mortgage rather than rejecting the load.
export function validateLoan(
  raw: unknown,
  path: string,
  knownCompanyIds: ReadonlySet<string>,
  properties: readonly Property[],
): Result<Loan> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name, kind } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  if (typeof kind !== "string" || !LOAN_KINDS.has(kind))
    return fail(`${path}.kind`, `unknown loan kind "${String(kind)}"`);
  const loan: Loan = {
    id,
    name,
    kind: kind as LoanKind,
    payments: [],
    balanceHistory: [],
  };
  if (
    typeof raw.glyph === "string" &&
    CATEGORY_ICONS.has(raw.glyph as CategoryIcon)
  ) {
    loan.glyph = raw.glyph as CategoryIcon;
  }
  if (typeof raw.color === "string" && raw.color.length > 0)
    loan.color = raw.color;
  if (typeof raw.description === "string") loan.description = raw.description;
  if (isIsoDate(raw.startDate)) loan.startDate = raw.startDate;
  if (isNonNegativeNumber(raw.monthlyPayment))
    loan.monthlyPayment = raw.monthlyPayment;
  if (isNonNegativeNumber(raw.rate)) loan.rate = raw.rate;
  if (isNonNegativeNumber(raw.startFee)) loan.startFee = raw.startFee;
  if (typeof raw.lenderName === "string" && raw.lenderName !== "")
    loan.lenderName = raw.lenderName;
  if (typeof raw.companyId === "string" && knownCompanyIds.has(raw.companyId)) {
    loan.companyId = raw.companyId;
  }
  if (typeof raw.propertyId === "string" && Array.isArray(raw.mortgageIds)) {
    const property = properties.find((p) => p.id === raw.propertyId);
    if (property) {
      const known = new Set(property.mortgages.map((m) => m.id));
      const seen = new Set<string>();
      const kept: string[] = [];
      for (const mortgageId of raw.mortgageIds) {
        if (typeof mortgageId !== "string" || !known.has(mortgageId)) continue;
        if (seen.has(mortgageId)) continue;
        seen.add(mortgageId);
        kept.push(mortgageId);
      }
      if (kept.length > 0) {
        loan.propertyId = raw.propertyId;
        loan.mortgageIds = kept;
      }
    }
  }
  if (Array.isArray(raw.payments)) {
    const seen = new Set<string>();
    for (const rawPayment of raw.payments) {
      const payment = validatePayment(rawPayment);
      if (!payment || seen.has(payment.id)) continue;
      seen.add(payment.id);
      loan.payments.push(payment);
    }
  }
  if (Array.isArray(raw.balanceHistory)) {
    const seen = new Set<string>();
    for (const rawPoint of raw.balanceHistory) {
      const point = validateBalancePoint(rawPoint);
      if (!point || seen.has(point.id)) continue;
      seen.add(point.id);
      loan.balanceHistory.push(point);
    }
  }
  if (Array.isArray(raw.paymentPatterns)) {
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const pattern of raw.paymentPatterns) {
      if (typeof pattern !== "string" || pattern === "") continue;
      if (seen.has(pattern)) continue;
      seen.add(pattern);
      kept.push(pattern);
    }
    if (kept.length > 0) loan.paymentPatterns = kept;
  }
  return { ok: true, value: loan };
}
