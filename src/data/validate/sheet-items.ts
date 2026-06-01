import type {
  AccountBudget,
  AccountsView,
  CellValue,
  Column,
  ColumnType,
  CorrectionRow,
  ItemsView,
  Row,
  SalaryView,
  UserRow,
} from "../types";
import { validateLineItemLinks } from "./account";
import { fail, isCellValue, isObject, type Result } from "./helpers";

// Per-flavour leaf validators for the `SheetItem` discriminated union.
//
// These live in their own module — separate from `validate/sheet.ts`,
// which orchestrates the whole `Sheet` and walks the sheet-type
// registry — precisely so the registry descriptors can import them
// without forming a cycle. `sheet-types/*` → `validate/sheet-items` →
// (`helpers`, `account`) is a DAG; `validate/sheet.ts` sits downstream
// of the registry and pulls the dispatch in from there.

// The known-id sets a sheet-item validator needs to drop dangling
// references (a deleted account / type / company / tag / item should
// not trap an otherwise-valid file). Bundled into one context object so
// every flavour's `validate` shares the same uniform signature even
// though singleton flavours (accounts, items) ignore most of it.
export type SheetItemValidationContext = {
  knownAccountIds: ReadonlySet<string>;
  knownTypeIds: ReadonlySet<string>;
  knownCompanyIds: ReadonlySet<string>;
  knownTagIds: ReadonlySet<string>;
  knownItemIds: ReadonlySet<string>;
};

const COLUMN_TYPES: ReadonlySet<ColumnType> = new Set<ColumnType>([
  "date",
  "description",
  "type",
  "amount",
  "balance",
  "completed",
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
  knownTagIds: ReadonlySet<string>,
  knownItemIds: ReadonlySet<string>,
): Result<Row> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const {
    id,
    cells,
    seriesId,
    typeId,
    isCorrection,
    amountFormula,
    amountMin,
    amountMax,
    isTransfer,
    typeIdLocked,
    companyId,
    tagIds,
    lineItems,
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
  let correctionFlag = false;
  if (isCorrection !== undefined) {
    if (typeof isCorrection !== "boolean")
      return fail(`${path}.isCorrection`, "expected a boolean");
    correctionFlag = isCorrection;
  }
  // Derive `kind` from the legacy `isCorrection` field so existing
  // snapshots (which don't carry `kind`) still narrow correctly.
  const row: UserRow | CorrectionRow = correctionFlag
    ? { kind: "correction", isCorrection: true, id, cells: validated }
    : { kind: "user", id, cells: validated };
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
  if (amountFormula !== undefined) {
    if (typeof amountFormula !== "string")
      return fail(`${path}.amountFormula`, "expected a string");
    if (amountFormula !== "") row.amountFormula = amountFormula;
  }
  // An estimate row carries BOTH bounds; a lone or non-finite bound is
  // meaningless, so drop the pair rather than persist a half-range.
  if (amountMin !== undefined || amountMax !== undefined) {
    if (
      typeof amountMin === "number" &&
      Number.isFinite(amountMin) &&
      typeof amountMax === "number" &&
      Number.isFinite(amountMax)
    ) {
      // Normalize ordering defensively so the matching predicates can
      // assume amountMin <= amountMax.
      row.amountMin = Math.min(amountMin, amountMax);
      row.amountMax = Math.max(amountMin, amountMax);
    }
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
  if (tagIds !== undefined && tagIds !== null) {
    if (!Array.isArray(tagIds))
      return fail(`${path}.tagIds`, "expected an array");
    // Drop dangling tag references silently — a deleted Tag shouldn't
    // trap the row. Dedup defensively and only persist a non-empty
    // result so an all-dangling array collapses back to "no tags".
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const tagId of tagIds) {
      if (typeof tagId !== "string" || tagId === "") continue;
      if (!knownTagIds.has(tagId) || seen.has(tagId)) continue;
      seen.add(tagId);
      kept.push(tagId);
    }
    if (kept.length > 0) row.tagIds = kept;
  }
  if (lineItems !== undefined) {
    // Drop dangling line-item links silently — a deleted Item shouldn't
    // trap the row. Only persist a non-empty result so an all-dangling
    // array collapses back to "no line items" (mirrors `tagIds`).
    const kept = validateLineItemLinks(lineItems, knownItemIds);
    if (kept.length > 0) row.lineItems = kept;
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
  ctx: SheetItemValidationContext,
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
    if (!ctx.knownAccountIds.has(accountId))
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
      ctx.knownTypeIds,
      ctx.knownCompanyIds,
      ctx.knownTagIds,
      ctx.knownItemIds,
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

export function validateItemsView(
  raw: unknown,
  path: string,
): Result<ItemsView> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, type } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (type !== "itemsView") return fail(`${path}.type`, `expected "itemsView"`);
  return { ok: true, value: { id, type: "itemsView" } };
}

export function validateSalaryView(
  raw: unknown,
  path: string,
  ctx: SheetItemValidationContext,
): Result<SalaryView> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, type, accountId } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (type !== "salaryView")
    return fail(`${path}.type`, `expected "salaryView"`);
  // `accountId` is nullable so a salary sheet can exist before the user
  // has bound a pay account. When it is a string, keep the "non-empty +
  // must reference a known account" check so a typo or stale id is
  // still caught — mirrors `validateAccountBudget`.
  if (accountId !== null) {
    if (typeof accountId !== "string" || accountId === "")
      return fail(`${path}.accountId`, "expected a non-empty string or null");
    if (!ctx.knownAccountIds.has(accountId))
      return fail(
        `${path}.accountId`,
        `references unknown account "${accountId}"`,
      );
  }
  return {
    ok: true,
    value: { id, type: "salaryView", accountId: accountId as string | null },
  };
}
