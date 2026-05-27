import { DEFAULT_SHEET_COLOR, DEFAULT_SHEET_GLYPH } from "../constants";
import type {
  AccountBudget,
  AccountsView,
  CellValue,
  Column,
  ColumnType,
  Row,
  Sheet,
  SheetItem,
  SheetType,
} from "../types";
import {
  CATEGORY_ICONS,
  fail,
  isCellValue,
  isObject,
  type Result,
  validateEnum,
} from "./helpers";

const COLUMN_TYPES: ReadonlySet<ColumnType> = new Set<ColumnType>([
  "date",
  "description",
  "type",
  "amount",
  "balance",
  "completed",
]);

const SHEET_TYPES: ReadonlySet<SheetType> = new Set<SheetType>([
  "budget",
  "accounts",
]);

export function validateColumn(raw: unknown, path: string): Result<Column> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, type, label } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof type !== "string" || !COLUMN_TYPES.has(type as ColumnType))
    return fail(`${path}.type`, `unknown column type "${String(type)}"`);
  if (typeof label !== "string")
    return fail(`${path}.label`, "expected a string");
  return { ok: true, value: { id, type: type as ColumnType, label } };
}

export function validateRow(
  raw: unknown,
  path: string,
  knownColumnIds: ReadonlySet<string>,
  knownTypeIds: ReadonlySet<string>,
  knownCompanyIds: ReadonlySet<string>,
): Result<Row> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const {
    id,
    cells,
    seriesId,
    typeId,
    isCorrection,
    amountFormula,
    isTransfer,
    typeIdLocked,
    companyId,
    fiscalMonthShift,
  } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (!isObject(cells)) return fail(`${path}.cells`, "expected an object");
  // Drop cells whose column no longer exists so a future column removal
  // doesn't make an otherwise-valid file unimportable.
  const validated: Record<string, CellValue> = {};
  for (const [k, v] of Object.entries(cells)) {
    if (!knownColumnIds.has(k)) continue;
    if (!isCellValue(v))
      return fail(`${path}.cells.${k}`, "expected string|number|boolean|null");
    validated[k] = v;
  }
  const row: Row = { id, cells: validated };
  if (seriesId !== undefined) {
    if (typeof seriesId !== "string" || seriesId === "")
      return fail(`${path}.seriesId`, "expected a non-empty string");
    row.seriesId = seriesId;
  }
  if (typeId !== undefined && typeId !== null) {
    if (typeof typeId !== "string" || typeId === "")
      return fail(`${path}.typeId`, "expected a non-empty string");
    // Drop dangling type references silently — a deleted EntryType
    // shouldn't trap the row in zombie state. The cell renderer
    // treats an unknown id as "no type" and falls back to the
    // description.
    if (knownTypeIds.has(typeId)) row.typeId = typeId;
  }
  if (isCorrection !== undefined) {
    if (typeof isCorrection !== "boolean")
      return fail(`${path}.isCorrection`, "expected a boolean");
    // Only persist `true` — a stored `false` is indistinguishable from
    // "field absent" and just bloats the on-disk snapshot.
    if (isCorrection) row.isCorrection = true;
  }
  if (amountFormula !== undefined) {
    if (typeof amountFormula !== "string")
      return fail(`${path}.amountFormula`, "expected a string");
    if (amountFormula !== "") row.amountFormula = amountFormula;
  }
  if (isTransfer !== undefined) {
    if (typeof isTransfer !== "boolean")
      return fail(`${path}.isTransfer`, "expected a boolean");
    // Only persist `true` — stored `false` is indistinguishable from
    // "field absent" and just bloats the snapshot.
    if (isTransfer) row.isTransfer = true;
  }
  if (typeIdLocked !== undefined) {
    if (typeof typeIdLocked !== "boolean")
      return fail(`${path}.typeIdLocked`, "expected a boolean");
    if (typeIdLocked) row.typeIdLocked = true;
  }
  if (companyId !== undefined && companyId !== null) {
    if (typeof companyId !== "string" || companyId === "")
      return fail(`${path}.companyId`, "expected a non-empty string");
    // Drop dangling company references silently — a deleted Company
    // shouldn't trap the row. Same contract as `typeId`.
    if (knownCompanyIds.has(companyId)) row.companyId = companyId;
  }
  if (fiscalMonthShift !== undefined) {
    if (fiscalMonthShift !== 1 && fiscalMonthShift !== -1)
      return fail(`${path}.fiscalMonthShift`, "expected -1 or 1");
    row.fiscalMonthShift = fiscalMonthShift;
  }
  return { ok: true, value: row };
}

export function validateAccountBudget(
  raw: unknown,
  path: string,
  knownAccountIds: ReadonlySet<string>,
  knownTypeIds: ReadonlySet<string>,
  knownCompanyIds: ReadonlySet<string>,
): Result<AccountBudget> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, type, accountId, columns, rows } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (type !== "accountBudget")
    return fail(`${path}.type`, `expected "accountBudget"`);
  // `accountId` is nullable so a budget can exist without being tied to
  // an account. When it is a string, keep the "non-empty + must reference
  // a known account" check so a typo or stale id is still caught.
  if (accountId !== null) {
    if (typeof accountId !== "string" || accountId === "")
      return fail(`${path}.accountId`, "expected a non-empty string or null");
    if (!knownAccountIds.has(accountId))
      return fail(
        `${path}.accountId`,
        `references unknown account "${accountId}"`,
      );
  }
  if (!Array.isArray(columns))
    return fail(`${path}.columns`, "expected an array");
  if (!Array.isArray(rows)) return fail(`${path}.rows`, "expected an array");

  const validatedColumns: Column[] = [];
  const seenColumnIds = new Set<string>();
  for (let i = 0; i < columns.length; i++) {
    const r = validateColumn(columns[i], `${path}.columns[${i}]`);
    if (!r.ok) return r;
    if (seenColumnIds.has(r.value.id))
      return fail(`${path}.columns[${i}].id`, `duplicate id "${r.value.id}"`);
    seenColumnIds.add(r.value.id);
    validatedColumns.push(r.value);
  }

  const validatedRows: Row[] = [];
  const seenRowIds = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = validateRow(
      rows[i],
      `${path}.rows[${i}]`,
      seenColumnIds,
      knownTypeIds,
      knownCompanyIds,
    );
    if (!r.ok) return r;
    if (seenRowIds.has(r.value.id))
      return fail(`${path}.rows[${i}].id`, `duplicate id "${r.value.id}"`);
    seenRowIds.add(r.value.id);
    validatedRows.push(r.value);
  }

  return {
    ok: true,
    value: {
      id,
      type: "accountBudget",
      accountId: accountId as string | null,
      columns: validatedColumns,
      rows: validatedRows,
    },
  };
}

export function validateAccountsView(
  raw: unknown,
  path: string,
): Result<AccountsView> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, type } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (type !== "accountsView")
    return fail(`${path}.type`, `expected "accountsView"`);
  return { ok: true, value: { id, type: "accountsView" } };
}

export function validateSheetItem(
  raw: unknown,
  path: string,
  knownAccountIds: ReadonlySet<string>,
  knownTypeIds: ReadonlySet<string>,
  knownCompanyIds: ReadonlySet<string>,
): Result<SheetItem> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const type = (raw as { type?: unknown }).type;
  if (type === "accountBudget") {
    return validateAccountBudget(
      raw,
      path,
      knownAccountIds,
      knownTypeIds,
      knownCompanyIds,
    );
  }
  if (type === "accountsView") {
    return validateAccountsView(raw, path);
  }
  return fail(`${path}.type`, `unknown sheet item type "${String(type)}"`);
}

export function validateSheet(
  raw: unknown,
  path: string,
  knownAccountIds: ReadonlySet<string>,
  knownTypeIds: ReadonlySet<string>,
  knownCompanyIds: ReadonlySet<string>,
): Result<Sheet> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name, items } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  if (!Array.isArray(items)) return fail(`${path}.items`, "expected an array");

  const validatedItems: SheetItem[] = [];
  const seenItemIds = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const r = validateSheetItem(
      items[i],
      `${path}.items[${i}]`,
      knownAccountIds,
      knownTypeIds,
      knownCompanyIds,
    );
    if (!r.ok) return r;
    if (seenItemIds.has(r.value.id))
      return fail(`${path}.items[${i}].id`, `duplicate id "${r.value.id}"`);
    seenItemIds.add(r.value.id);
    validatedItems.push(r.value);
  }

  // Display metadata. Soft-recovers each field to a sane default if
  // missing or bogus — these are cosmetic, so a typo'd glyph name
  // shouldn't lock the user out of an otherwise-valid sheet.
  const type = validateEnum(raw.type, SHEET_TYPES, "budget");
  const glyph = validateEnum(raw.glyph, CATEGORY_ICONS, DEFAULT_SHEET_GLYPH);
  const color =
    typeof raw.color === "string" && raw.color.length > 0
      ? raw.color
      : DEFAULT_SHEET_COLOR;
  const description =
    typeof raw.description === "string" ? raw.description : "";

  return {
    ok: true,
    value: {
      id,
      name,
      type,
      glyph,
      color,
      description,
      items: validatedItems,
    },
  };
}
