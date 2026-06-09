import type { CategoryIcon, Saving, SavingBalancePoint } from "../types";
import { CATEGORY_ICONS, fail, isObject, type Result } from "./helpers";

// ISO yyyy-mm-dd shape check. Lenient on the tail so a stored timestamp
// (yyyy-mm-ddThh:…) still passes. Mirrors the property validator's check.
function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// Validate one balance-history snapshot. Advisory display data — a malformed
// point is dropped rather than rejecting the whole savings account (mirrors
// the property value-point sweep).
function validateBalancePoint(raw: unknown): SavingBalancePoint | null {
  if (!isObject(raw)) return null;
  const { id, date, value } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (!isIsoDate(date)) return null;
  if (!isFiniteNumber(value)) return null;
  return { id, date, value };
}

// Validate one savings account. Required `id` + `name` (and the `kind`
// discriminator) fail the file — they're load-bearing identity; everything
// else is dropped-if-malformed so a single bad optional field can't trap an
// otherwise-valid budget. Mirrors `validateAccount` for the bank-detail
// fields and `validateProperty` for the dated history. A savings account has
// no cross-references to verify, so it needs no known-id sets.
export function validateSaving(raw: unknown, path: string): Result<Saving> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name, kind } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (kind !== "savings") return fail(`${path}.kind`, `expected "savings"`);
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  const saving: Saving = { id, kind: "savings", name, balanceHistory: [] };
  if (typeof raw.description === "string") saving.description = raw.description;
  if (
    typeof raw.glyph === "string" &&
    CATEGORY_ICONS.has(raw.glyph as CategoryIcon)
  ) {
    saving.glyph = raw.glyph as CategoryIcon;
  }
  if (typeof raw.color === "string" && raw.color.length > 0)
    saving.color = raw.color;
  if (typeof raw.bank === "string") saving.bank = raw.bank;
  if (typeof raw.clearing === "string") saving.clearing = raw.clearing;
  if (typeof raw.accountNumber === "string")
    saving.accountNumber = raw.accountNumber;
  if (typeof raw.currency === "string" && raw.currency.length > 0)
    saving.currency = raw.currency;
  if (Array.isArray(raw.balanceHistory)) {
    const seen = new Set<string>();
    for (const rawPoint of raw.balanceHistory) {
      const point = validateBalancePoint(rawPoint);
      if (!point || seen.has(point.id)) continue;
      seen.add(point.id);
      saving.balanceHistory.push(point);
    }
  }
  return { ok: true, value: saving };
}
