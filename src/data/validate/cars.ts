import type {
  Car,
  CarExpense,
  CarOwnership,
  CarSnapshot,
  CategoryIcon,
} from "../types";
import { validateItemDepreciation } from "./account";
import { CATEGORY_ICONS, fail, isObject, type Result } from "./helpers";

// ISO yyyy-mm-dd shape check. Lenient on the tail so a stored timestamp
// (yyyy-mm-ddThh:…) still passes. Mirrors the loans validator's check.
function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
}

function isNonNegativeNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

const CAR_OWNERSHIPS: ReadonlySet<string> = new Set<CarOwnership>([
  "owned",
  "leased",
  "shared",
  "pool",
]);

// Validate one value / mileage snapshot. Advisory display data — a
// malformed point is dropped rather than rejecting the whole car
// (mirrors the loans balance-point sweep). A snapshot with neither a
// value nor a mileage carries no information, so it drops too.
function validateSnapshot(raw: unknown): CarSnapshot | null {
  if (!isObject(raw)) return null;
  const { id, date } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (!isIsoDate(date)) return null;
  const snapshot: CarSnapshot = { id, date };
  if (isNonNegativeNumber(raw.value)) snapshot.value = raw.value;
  if (isNonNegativeNumber(raw.mileage)) snapshot.mileage = raw.mileage;
  if (snapshot.value === undefined && snapshot.mileage === undefined)
    return null;
  return snapshot;
}

// Validate one linked expense. Advisory — a malformed expense is
// dropped rather than rejecting the whole car. The source pair is
// both-or-neither: an expense with only one half of
// `accountId` / `sourceHistoryId` keeps neither and degrades to a
// manual expense rather than carrying a half-link the finder can't key
// on. `typeId` is kept as-is (a dangling id renders as uncategorised —
// the denormalised amount / date are still true).
function validateExpense(raw: unknown): CarExpense | null {
  if (!isObject(raw)) return null;
  const { id, date, amount, description, typeId } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (!isIsoDate(date)) return null;
  if (!isNonNegativeNumber(amount)) return null;
  if (typeof description !== "string") return null;
  if (typeof typeId !== "string") return null;
  const expense: CarExpense = { id, date, amount, description, typeId };
  if (
    typeof raw.accountId === "string" &&
    raw.accountId !== "" &&
    typeof raw.sourceHistoryId === "string" &&
    raw.sourceHistoryId !== ""
  ) {
    expense.accountId = raw.accountId;
    expense.sourceHistoryId = raw.sourceHistoryId;
  }
  return expense;
}

// Validate one car. Required `id` + `name` + a known `ownership` fail the
// file — they're load-bearing identity; everything else is
// dropped-if-malformed so a single bad optional field can't trap an
// otherwise-valid budget. A dangling `loanId` is swept to absent (order
// cars after loans in `validate/index.ts` so the known-id set exists),
// and `sharePct` survives only in the exclusive (0, 100) range — 100 is
// the "absent" encoding, mirroring the insights override.
export function validateCar(
  raw: unknown,
  path: string,
  knownLoanIds: ReadonlySet<string>,
): Result<Car> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name, ownership } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  if (typeof ownership !== "string" || !CAR_OWNERSHIPS.has(ownership))
    return fail(
      `${path}.ownership`,
      `unknown car ownership "${String(ownership)}"`,
    );
  const car: Car = {
    id,
    name,
    ownership: ownership as CarOwnership,
    snapshots: [],
    expenses: [],
  };
  if (
    typeof raw.glyph === "string" &&
    CATEGORY_ICONS.has(raw.glyph as CategoryIcon)
  ) {
    car.glyph = raw.glyph as CategoryIcon;
  }
  if (typeof raw.color === "string" && raw.color.length > 0)
    car.color = raw.color;
  if (typeof raw.description === "string") car.description = raw.description;
  if (isIsoDate(raw.purchaseDate)) car.purchaseDate = raw.purchaseDate;
  if (isNonNegativeNumber(raw.purchasePrice))
    car.purchasePrice = raw.purchasePrice;
  if (isNonNegativeNumber(raw.purchaseMileage))
    car.purchaseMileage = raw.purchaseMileage;
  if (
    typeof raw.sharePct === "number" &&
    Number.isFinite(raw.sharePct) &&
    raw.sharePct > 0 &&
    raw.sharePct < 100
  ) {
    car.sharePct = raw.sharePct;
  }
  const depreciation = validateItemDepreciation(raw.depreciation);
  if (depreciation) car.depreciation = depreciation;
  if (typeof raw.loanId === "string" && knownLoanIds.has(raw.loanId)) {
    car.loanId = raw.loanId;
  }
  if (isIsoDate(raw.soldAt)) car.soldAt = raw.soldAt;
  if (isNonNegativeNumber(raw.soldFor)) car.soldFor = raw.soldFor;
  if (Array.isArray(raw.snapshots)) {
    const seen = new Set<string>();
    for (const rawSnapshot of raw.snapshots) {
      const snapshot = validateSnapshot(rawSnapshot);
      if (!snapshot || seen.has(snapshot.id)) continue;
      seen.add(snapshot.id);
      car.snapshots.push(snapshot);
    }
  }
  if (Array.isArray(raw.expenses)) {
    const seen = new Set<string>();
    for (const rawExpense of raw.expenses) {
      const expense = validateExpense(rawExpense);
      if (!expense || seen.has(expense.id)) continue;
      seen.add(expense.id);
      car.expenses.push(expense);
    }
  }
  return { ok: true, value: car };
}
