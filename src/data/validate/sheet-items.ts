import type {
  AccountBudget,
  AccountsView,
  CellValue,
  Column,
  ColumnType,
  CorrectionRow,
  InsightsEntityOverride,
  InsightsMode,
  InsightsView,
  InvestmentView,
  ItemsView,
  LoansView,
  PropertiesView,
  Row,
  SalaryView,
  SavingsView,
  Scenario,
  ScenarioAddedRow,
  ScenarioAmountModulation,
  ScenarioRowOverride,
  ScenariosView,
  UserRow,
} from "../types";
import { isNoopModulation } from "../scenarios/apply";
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
  knownTaxProfileIds: ReadonlySet<string>;
  knownSavingIds: ReadonlySet<string>;
  knownPropertyIds: ReadonlySet<string>;
  knownLoanIds: ReadonlySet<string>;
  // Every sheet id in the file, collected in a pre-pass over the raw
  // sheets array BEFORE the per-sheet validation loop — a scenarios
  // sheet may reference a base budget sheet that appears later in the
  // array, so forward references must resolve.
  knownSheetIds: ReadonlySet<string>;
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
    receiptPath,
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
  // The receipt file reference for the purchase this row records — see
  // `Row.receiptPath`. The file lives in the backend, not the JSON, so a
  // dangling path (file gone) is tolerated by the viewer rather than the
  // validator; only the empty / non-string cases drop here.
  if (typeof receiptPath === "string" && receiptPath !== "")
    row.receiptPath = receiptPath;
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

export function validatePropertiesView(
  raw: unknown,
  path: string,
): Result<PropertiesView> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, type } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (type !== "propertiesView")
    return fail(`${path}.type`, `expected "propertiesView"`);
  return { ok: true, value: { id, type: "propertiesView" } };
}

export function validateSavingsView(
  raw: unknown,
  path: string,
): Result<SavingsView> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, type } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (type !== "savingsView")
    return fail(`${path}.type`, `expected "savingsView"`);
  return { ok: true, value: { id, type: "savingsView" } };
}

export function validateLoansView(
  raw: unknown,
  path: string,
): Result<LoansView> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, type } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (type !== "loansView") return fail(`${path}.type`, `expected "loansView"`);
  return { ok: true, value: { id, type: "loansView" } };
}

export function validateInvestmentView(
  raw: unknown,
  path: string,
): Result<InvestmentView> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, type } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (type !== "investmentView")
    return fail(`${path}.type`, `expected "investmentView"`);
  return { ok: true, value: { id, type: "investmentView" } };
}

// Insight modes the validator recognises. Mirrors the `InsightsMode`
// union — extend both together when a second mode lands.
const INSIGHTS_MODES: ReadonlySet<InsightsMode> = new Set<InsightsMode>([
  "networth",
]);

// Normalise one raw per-entity override to its minimal persisted form,
// or `undefined` when nothing survives. Shared by the validator and the
// `setInsightsNetWorthSettings` reducer so a round-tripped file and a
// freshly-dispatched payload normalise identically: `excluded` only
// when `true`, `sharePct` only when finite and strictly inside (0, 100)
// — absent means 100 (fully owned), so a stored 100 is redundant.
export function normalizeInsightsOverride(
  raw: unknown,
): InsightsEntityOverride | undefined {
  if (!isObject(raw)) return undefined;
  const override: InsightsEntityOverride = {};
  if (raw.excluded === true) override.excluded = true;
  const { sharePct } = raw;
  if (
    typeof sharePct === "number" &&
    Number.isFinite(sharePct) &&
    sharePct > 0 &&
    sharePct < 100
  ) {
    override.sharePct = sharePct;
  }
  return Object.keys(override).length > 0 ? override : undefined;
}

export function validateInsightsView(
  raw: unknown,
  path: string,
  ctx: SheetItemValidationContext,
): Result<InsightsView> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, type, mode, networth } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (type !== "insightsView")
    return fail(`${path}.type`, `expected "insightsView"`);
  const view: InsightsView = { id, type: "insightsView" };
  // Drop an unknown mode silently — a file written by a newer build with
  // more modes still loads here, falling back to the default mode.
  if (typeof mode === "string" && INSIGHTS_MODES.has(mode as InsightsMode))
    view.mode = mode as InsightsMode;
  // Sweep override keys against every entity id-space the net-worth
  // roll-up draws from, so a deleted account / saving / item / property
  // / loan sheds its override instead of trapping the file. Overrides
  // that normalise to nothing collapse away, and an empty map drops the
  // `networth` field entirely — same minimal-snapshot contract as the
  // reducer.
  if (isObject(networth)) {
    const rawOverrides = networth.overrides;
    if (isObject(rawOverrides)) {
      const overrides: Record<string, InsightsEntityOverride> = {};
      for (const [entityId, rawOverride] of Object.entries(rawOverrides)) {
        if (
          !ctx.knownAccountIds.has(entityId) &&
          !ctx.knownSavingIds.has(entityId) &&
          !ctx.knownItemIds.has(entityId) &&
          !ctx.knownPropertyIds.has(entityId) &&
          !ctx.knownLoanIds.has(entityId)
        )
          continue;
        const override = normalizeInsightsOverride(rawOverride);
        if (override) overrides[entityId] = override;
      }
      if (Object.keys(overrides).length > 0) view.networth = { overrides };
    }
  }
  return { ok: true, value: view };
}

const MODULATION_OPS: readonly ScenarioAmountModulation["op"][] = [
  "add",
  "multiply",
  "percent",
];

function normalizeModulation(
  raw: unknown,
): ScenarioAmountModulation | undefined {
  if (!isObject(raw)) return undefined;
  const { op, value } = raw;
  if (
    typeof op !== "string" ||
    !(MODULATION_OPS as readonly string[]).includes(op)
  )
    return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const modulation: ScenarioAmountModulation = {
    op: op as ScenarioAmountModulation["op"],
    value,
  };
  // A modulation that cannot change anything (+0 / ×1) is the revert
  // shape, not a delta — drop it like an amount equal to the base.
  return isNoopModulation(modulation) ? undefined : modulation;
}

// Normalise one raw scenario row override to its minimal persisted
// form, or `undefined` when nothing survives. Shared by the validator
// and the `setScenarioOverride` reducer so a round-tripped file and a
// freshly-dispatched payload normalise identically: `amount` only when
// finite, `modulation` only when well-formed, not a no-op, and not
// shadowed by a fixed `amount` (the two are mutually exclusive —
// fixed wins), `excluded` only when `true`. An override that keeps
// none of the three is meaningless and collapses away (which is also
// the revert / re-include path).
export function normalizeScenarioOverride(
  raw: unknown,
): ScenarioRowOverride | undefined {
  if (!isObject(raw)) return undefined;
  const { rowId, amount, modulation } = raw;
  if (typeof rowId !== "string" || rowId === "") return undefined;
  const override: ScenarioRowOverride = { rowId };
  if (typeof amount === "number" && Number.isFinite(amount))
    override.amount = amount;
  if (override.amount === undefined) {
    const normalized = normalizeModulation(modulation);
    if (normalized !== undefined) override.modulation = normalized;
  }
  if (raw.excluded === true) override.excluded = true;
  return Object.keys(override).length > 1 ? override : undefined;
}

// ISO yyyy-mm-dd guard for monitor dates and scenario-row dates. Kept
// deliberately loose (no calendar math) — the same shape the budget
// date cells rely on for lexical comparability.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateScenarioAddedRow(raw: unknown): ScenarioAddedRow | undefined {
  if (!isObject(raw)) return undefined;
  const { id, date, description, amount } = raw;
  if (typeof id !== "string" || id === "") return undefined;
  if (typeof date !== "string" || !ISO_DATE_RE.test(date)) return undefined;
  if (typeof description !== "string") return undefined;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return undefined;
  return { id, date, description, amount };
}

// Scenarios are best-effort deltas over another sheet's rows, so the
// sweep style is drop-malformed rather than fail-the-file: a broken
// override or added row disappears instead of trapping the workspace.
// Only a structurally-broken scenario (missing id / name) fails, since
// silently dropping a whole named scenario would lose user work
// invisibly. Override `rowId`s are NOT cross-checked against the base
// budget's rows — the base lives in a different sheet; dangling ids
// are ignored at compute time instead.
function validateScenario(raw: unknown, path: string): Result<Scenario> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name, overrides, addedRows } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  const keptOverrides: ScenarioRowOverride[] = [];
  const seenRowIds = new Set<string>();
  if (Array.isArray(overrides)) {
    for (const rawOverride of overrides) {
      const override = normalizeScenarioOverride(rawOverride);
      if (!override || seenRowIds.has(override.rowId)) continue;
      seenRowIds.add(override.rowId);
      keptOverrides.push(override);
    }
  }
  const keptRows: ScenarioAddedRow[] = [];
  const seenAddedIds = new Set<string>();
  if (Array.isArray(addedRows)) {
    for (const rawRow of addedRows) {
      const row = validateScenarioAddedRow(rawRow);
      if (!row || seenAddedIds.has(row.id)) continue;
      seenAddedIds.add(row.id);
      keptRows.push(row);
    }
  }
  return {
    ok: true,
    value: { id, name, overrides: keptOverrides, addedRows: keptRows },
  };
}

export function validateScenariosView(
  raw: unknown,
  path: string,
  ctx: SheetItemValidationContext,
): Result<ScenariosView> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, type, baseSheetId, monitors, scenarios } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (type !== "scenariosView")
    return fail(`${path}.type`, `expected "scenariosView"`);
  // Coerce a dangling `baseSheetId` to null rather than failing — the
  // base sheet may have been deleted out from under the file; the page
  // then falls back to the base picker. (`null` stays null.)
  const base =
    typeof baseSheetId === "string" &&
    baseSheetId !== "" &&
    ctx.knownSheetIds.has(baseSheetId)
      ? baseSheetId
      : null;
  // Sweep monitors to valid ISO date strings, deduped and sorted — the
  // same invariant the reducer maintains on every edit.
  const keptMonitors: string[] = [];
  const seenMonitors = new Set<string>();
  if (Array.isArray(monitors)) {
    for (const m of monitors) {
      if (typeof m !== "string" || !ISO_DATE_RE.test(m)) continue;
      if (seenMonitors.has(m)) continue;
      seenMonitors.add(m);
      keptMonitors.push(m);
    }
  }
  keptMonitors.sort();
  const keptScenarios: Scenario[] = [];
  const seenScenarioIds = new Set<string>();
  if (Array.isArray(scenarios)) {
    for (let i = 0; i < scenarios.length; i++) {
      const r = validateScenario(scenarios[i], `${path}.scenarios[${i}]`);
      if (!r.ok) return r;
      if (seenScenarioIds.has(r.value.id))
        return fail(
          `${path}.scenarios[${i}].id`,
          `duplicate id "${r.value.id}"`,
        );
      seenScenarioIds.add(r.value.id);
      keptScenarios.push(r.value);
    }
  }
  return {
    ok: true,
    value: {
      id,
      type: "scenariosView",
      baseSheetId: base,
      monitors: keptMonitors,
      scenarios: keptScenarios,
    },
  };
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
  const view: SalaryView = {
    id,
    type: "salaryView",
    accountId: accountId as string | null,
  };
  // Drop a dangling `taxProfileId` silently — a deleted profile
  // shouldn't trap the sheet; the page just stops estimating. Same
  // contract as `accountId` on `accountBudget`.
  const { taxProfileId } = raw;
  if (
    typeof taxProfileId === "string" &&
    taxProfileId !== "" &&
    ctx.knownTaxProfileIds.has(taxProfileId)
  ) {
    view.taxProfileId = taxProfileId;
  }
  return { ok: true, value: view };
}
