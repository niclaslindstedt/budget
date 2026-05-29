import { DEFAULT_SHEET_GLYPH } from "../constants/taxonomy";
import type {
  Account,
  Category,
  CategoryIcon,
  Company,
  EntryType,
  Tag,
} from "../types";
import {
  CATEGORY_ICONS,
  fail,
  isObject,
  type Result,
  validateEnum,
} from "./helpers";

export function validateAccount(raw: unknown, path: string): Result<Account> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  const account: Account = { id, name };
  // Every extra field is optional and free-form; we accept strings
  // straight through, and validate `glyph` against the same allowlist
  // categories use. Unknown fields are simply dropped.
  if (typeof raw.description === "string")
    account.description = raw.description;
  if (
    typeof raw.glyph === "string" &&
    CATEGORY_ICONS.has(raw.glyph as CategoryIcon)
  ) {
    account.glyph = raw.glyph as CategoryIcon;
  }
  if (typeof raw.color === "string" && raw.color.length > 0)
    account.color = raw.color;
  if (typeof raw.bank === "string") account.bank = raw.bank;
  if (typeof raw.clearing === "string") account.clearing = raw.clearing;
  if (typeof raw.accountNumber === "string")
    account.accountNumber = raw.accountNumber;
  if (typeof raw.iban === "string") account.iban = raw.iban;
  if (typeof raw.bic === "string") account.bic = raw.bic;
  if (typeof raw.currency === "string" && raw.currency.length > 0)
    account.currency = raw.currency;
  if (
    typeof raw.openingBalance === "number" &&
    Number.isFinite(raw.openingBalance)
  )
    account.openingBalance = raw.openingBalance;
  return { ok: true, value: account };
}

export function validateCompany(raw: unknown, path: string): Result<Company> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  return { ok: true, value: { id, name } };
}

export function validateTag(raw: unknown, path: string): Result<Tag> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name, color } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  if (typeof color !== "string" || color === "")
    return fail(`${path}.color`, "expected a non-empty string");
  return { ok: true, value: { id, name, color } };
}

export function validateCategory(raw: unknown, path: string): Result<Category> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name, color, icon } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  if (typeof color !== "string" || color === "")
    return fail(`${path}.color`, "expected a non-empty string");
  // Glyph is cosmetic — fall back to the default rather than trapping
  // the whole file (an unknown name typically means a glyph removed
  // in a newer build, or one added in a newer build than this one
  // knows about). This mirrors `validateSheet` above.
  const safeIcon = validateEnum(icon, CATEGORY_ICONS, DEFAULT_SHEET_GLYPH);
  return {
    ok: true,
    value: { id, name, color, icon: safeIcon },
  };
}

export function validateEntryType(
  raw: unknown,
  path: string,
  knownCategoryIds: ReadonlySet<string>,
): Result<EntryType> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name, color, glyph, categoryId, kind } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  if (typeof color !== "string" || color === "")
    return fail(`${path}.color`, "expected a non-empty string");
  // Glyph is cosmetic — fall back to the default rather than trapping
  // the whole file. An unknown name typically means a glyph removed
  // in a newer build, or one added in a newer build than this one
  // knows about; previously this `fail` cascaded into a fresh-budget
  // fallback that could overwrite the user's data on next save.
  const safeGlyph = validateEnum(glyph, CATEGORY_ICONS, DEFAULT_SHEET_GLYPH);
  if (typeof categoryId !== "string" || categoryId === "")
    return fail(`${path}.categoryId`, "expected a non-empty string");
  if (!knownCategoryIds.has(categoryId))
    return fail(
      `${path}.categoryId`,
      `references unknown category "${categoryId}"`,
    );
  // `kind` is optional. We accept the three valid values and silently
  // drop "any" (the implicit default for user types) so a round-trip
  // never adds spurious fields. Unknown values fall back to absent
  // rather than failing — the field is a UI filter, not data the
  // user can't reproduce.
  const cleaned: EntryType = {
    id,
    name,
    color,
    glyph: safeGlyph,
    categoryId,
  };
  if (kind === "income" || kind === "expense") cleaned.kind = kind;
  return { ok: true, value: cleaned };
}
