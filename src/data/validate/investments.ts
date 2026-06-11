import type {
  CategoryIcon,
  InvestmentHolding,
  InvestmentKind,
  InvestmentValuePoint,
  InvestmentWrapper,
  StockPosition,
  StockPricePoint,
  StockTransaction,
} from "../types";
import { CATEGORY_ICONS, fail, isObject, type Result } from "./helpers";

// ISO yyyy-mm-dd shape check. Lenient on the tail so a stored timestamp
// still passes. Mirrors the savings / property validators.
function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

const WRAPPERS: ReadonlySet<InvestmentWrapper> = new Set<InvestmentWrapper>([
  "isk",
  "kf",
  "depot",
]);

const KINDS: ReadonlySet<InvestmentKind> = new Set<InvestmentKind>([
  "stock",
  "fund",
  "bond",
  "crypto",
  "metal",
  "other",
]);

// Validate one market-value snapshot. Advisory display data — a malformed
// point is dropped rather than rejecting the whole holding (mirrors the
// savings balance-point sweep).
function validateValuePoint(raw: unknown): InvestmentValuePoint | null {
  if (!isObject(raw)) return null;
  const { id, date, value } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (!isIsoDate(date)) return null;
  if (!isFiniteNumber(value)) return null;
  return { id, date, value };
}

// Validate one holding. Required `id` + `name` + `wrapper` fail the file —
// they're load-bearing (name is identity, wrapper drives tax); everything
// else is dropped-if-malformed so a single bad optional field can't trap
// an otherwise-valid budget.
export function validateInvestmentHolding(
  raw: unknown,
  path: string,
): Result<InvestmentHolding> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name, wrapper } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  if (
    typeof wrapper !== "string" ||
    !WRAPPERS.has(wrapper as InvestmentWrapper)
  )
    return fail(`${path}.wrapper`, `expected one of isk | kf | depot`);
  const holding: InvestmentHolding = {
    id,
    name,
    wrapper: wrapper as InvestmentWrapper,
    valueHistory: [],
  };
  if (typeof raw.kind === "string" && KINDS.has(raw.kind as InvestmentKind))
    holding.kind = raw.kind as InvestmentKind;
  if (
    typeof raw.glyph === "string" &&
    CATEGORY_ICONS.has(raw.glyph as CategoryIcon)
  )
    holding.glyph = raw.glyph as CategoryIcon;
  if (typeof raw.color === "string" && raw.color.length > 0)
    holding.color = raw.color;
  if (isFiniteNumber(raw.purchaseAmount))
    holding.purchaseAmount = raw.purchaseAmount;
  if (isIsoDate(raw.purchaseDate)) holding.purchaseDate = raw.purchaseDate;
  if (Array.isArray(raw.valueHistory)) {
    const seen = new Set<string>();
    for (const rawPoint of raw.valueHistory) {
      const point = validateValuePoint(rawPoint);
      if (!point || seen.has(point.id)) continue;
      seen.add(point.id);
      holding.valueHistory.push(point);
    }
  }
  return { ok: true, value: holding };
}

// Validate one buy / sell transaction. `shares` may be negative (a sell);
// only NaN / Infinity is rejected. A malformed transaction is dropped.
function validateTransaction(raw: unknown): StockTransaction | null {
  if (!isObject(raw)) return null;
  const { id, date, shares, pricePerShare } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (!isIsoDate(date)) return null;
  if (!isFiniteNumber(shares)) return null;
  if (!isFiniteNumber(pricePerShare)) return null;
  return { id, date, shares, pricePerShare };
}

function validatePricePoint(raw: unknown): StockPricePoint | null {
  if (!isObject(raw)) return null;
  const { id, date, pricePerShare } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (!isIsoDate(date)) return null;
  if (!isFiniteNumber(pricePerShare)) return null;
  return { id, date, pricePerShare };
}

// Validate one private stock position. Required `id` + `name` +
// `ownership` fail the file; the transaction / price logs are
// dropped-if-malformed.
export function validateStockPosition(
  raw: unknown,
  path: string,
): Result<StockPosition> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name, ownership } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  if (ownership !== "private" && ownership !== "company")
    return fail(`${path}.ownership`, `expected "private" or "company"`);
  const position: StockPosition = {
    id,
    name,
    ownership,
    transactions: [],
    priceHistory: [],
  };
  if (
    typeof raw.glyph === "string" &&
    CATEGORY_ICONS.has(raw.glyph as CategoryIcon)
  )
    position.glyph = raw.glyph as CategoryIcon;
  if (typeof raw.color === "string" && raw.color.length > 0)
    position.color = raw.color;
  if (Array.isArray(raw.transactions)) {
    const seen = new Set<string>();
    for (const rawTx of raw.transactions) {
      const tx = validateTransaction(rawTx);
      if (!tx || seen.has(tx.id)) continue;
      seen.add(tx.id);
      position.transactions.push(tx);
    }
  }
  if (Array.isArray(raw.priceHistory)) {
    const seen = new Set<string>();
    for (const rawPoint of raw.priceHistory) {
      const point = validatePricePoint(rawPoint);
      if (!point || seen.has(point.id)) continue;
      seen.add(point.id);
      position.priceHistory.push(point);
    }
  }
  return { ok: true, value: position };
}
