import { getStandardColumns } from "../sheet";
import type {
  AccountBudget,
  Row,
  Scenario,
  ScenarioAddedRow,
  ScenarioAmountModulation,
  ScenarioRowOverride,
  Sheet,
  UserRow,
} from "../types";

// Synthetic-row id prefix for scenario-only added rows, mirroring the
// `hist:` / `tx:` prefixes the budget synthesizers use. Deterministic
// (derived from the persisted `ScenarioAddedRow.id`, never `newId()`)
// so re-applying a scenario yields stable ids — React keys and the
// month tables' row identity survive recomputes.
const ADDED_ROW_ID_PREFIX = "scn:";

export function scenarioAddedRowId(addedId: string): string {
  return `${ADDED_ROW_ID_PREFIX}${addedId}`;
}

// True when a row id inside an applied scenario clone names a
// scenario-only added row (edited via `updateScenarioRow`, not via
// overrides).
export function isScenarioAddedRowId(rowId: string): boolean {
  return rowId.startsWith(ADDED_ROW_ID_PREFIX);
}

// The persisted `ScenarioAddedRow.id` behind an applied clone row id,
// or undefined for ordinary rows.
export function scenarioAddedIdFromRowId(rowId: string): string | undefined {
  return isScenarioAddedRowId(rowId)
    ? rowId.slice(ADDED_ROW_ID_PREFIX.length)
    : undefined;
}

// Apply a live amount adjustment to a base amount. Rounded to cents so
// percent / multiply factors don't leak float noise into balances.
export function modulateAmount(
  base: number,
  modulation: ScenarioAmountModulation,
): number {
  const raw =
    modulation.op === "add"
      ? base + modulation.value
      : modulation.op === "multiply"
        ? base * modulation.value
        : base * (1 + modulation.value / 100);
  return Math.round(raw * 100) / 100;
}

// True when a modulation cannot change any amount — the normalizer
// drops these so a "+0" / "×1" commit reads as a revert, mirroring how
// a fixed amount equal to the base clears instead of storing a no-op.
export function isNoopModulation(m: ScenarioAmountModulation): boolean {
  return m.op === "multiply" ? m.value === 1 : m.value === 0;
}

// Resolve the base budget a scenarios sheet models on: the first
// `accountBudget` item of the sheet with `baseSheetId`. Null when the
// binding is unset, dangling, or points at a non-budget sheet.
export function findBaseBudget(
  sheets: readonly Sheet[],
  baseSheetId: string | null,
): { sheet: Sheet; item: AccountBudget } | null {
  if (baseSheetId === null) return null;
  const sheet = sheets.find((s) => s.id === baseSheetId);
  if (!sheet) return null;
  const item = sheet.items.find(
    (i): i is AccountBudget => i.type === "accountBudget",
  );
  return item ? { sheet, item } : null;
}

// The scenario's overrides as a map for O(1) per-row lookups. Compute
// and rendering both key off this.
export function overridesByRowId(
  scenario: Scenario,
): Map<string, ScenarioRowOverride> {
  const map = new Map<string, ScenarioRowOverride>();
  for (const o of scenario.overrides) map.set(o.rowId, o);
  return map;
}

// Clone `base` with one scenario's deltas applied; `null` scenario is
// the implicit Baseline and returns `base` untouched. The clone is what
// `computeBudgetState` then runs on, so balances, formula aggregates,
// month grouping, and the chart all see the scenario's reality:
//
// - An overridden amount replaces the amount cell (and strips
//   `amountFormula` so the override wins over the formula).
// - A modulation rewrites the amount cell FROM the base amount at apply
//   time — that is what keeps it live: a base-row edit flows straight
//   through (+5000 on whatever the salary is now). Skipped on formula
//   rows, where the static cell is not the row's real amount.
// - An EXCLUDED row stays in the array — the month table still renders
//   it, struck through — but its amount cell is zeroed (formula
//   stripped) so it contributes nothing to balances or month
//   aggregates. Renderers show the base amount via `overridesByRowId`.
// - Added rows append as `UserRow`s with deterministic `scn:` ids.
//
// Overrides whose `rowId` no longer exists in the base are silently
// ignored (the base row was deleted; the validator keeps the entry but
// it is inert). Synthesized transfer / history rows are not touched
// here — they merge later inside `computeBudgetState` exactly as on
// the budget page.
export function applyScenario(
  base: AccountBudget,
  scenario: Scenario | null,
): AccountBudget {
  if (scenario === null) return base;
  if (scenario.overrides.length === 0 && scenario.addedRows.length === 0)
    return base;
  const { dateCol, descCol, amountCol } = getStandardColumns(base.columns);
  if (!dateCol || !descCol || !amountCol) return base;

  const overrides = overridesByRowId(scenario);
  const rows: Row[] =
    overrides.size === 0
      ? base.rows
      : base.rows.map((row) => {
          // Only persisted user rows are override targets — correction
          // rows are balance dividers and synthesized rows never live
          // in `base.rows`.
          if (row.kind !== "user") return row;
          const override = overrides.get(row.id);
          if (override === undefined) return row;
          const next: UserRow = { ...row, cells: { ...row.cells } };
          if (override.excluded === true) {
            next.cells[amountCol.id] = 0;
            delete next.amountFormula;
          } else if (override.amount !== undefined) {
            next.cells[amountCol.id] = override.amount;
            delete next.amountFormula;
          } else if (
            override.modulation !== undefined &&
            row.amountFormula === undefined
          ) {
            const baseAmount = row.cells[amountCol.id];
            if (typeof baseAmount === "number")
              next.cells[amountCol.id] = modulateAmount(
                baseAmount,
                override.modulation,
              );
          }
          return next;
        });

  const added: Row[] = scenario.addedRows.map((r) => ({
    kind: "user",
    id: scenarioAddedRowId(r.id),
    // Carried onto the clone so recurring added rows render with the
    // budget table's Repeat glyph.
    ...(r.seriesId !== undefined ? { seriesId: r.seriesId } : {}),
    cells: {
      [dateCol.id]: r.date,
      [descCol.id]: r.description,
      [amountCol.id]: r.amount,
    },
  }));

  return {
    ...base,
    rows: added.length === 0 ? rows : [...rows, ...added],
  };
}

// One line of the "view changes" diff between a scenario and the
// baseline, date-ascending. Dangling overrides are skipped. Override
// and excluded entries carry the base row's taxonomy refs so the diff
// modal can render the same company / type-name fallback the tables
// use when the row has no user-authored description.
export type ScenarioDiffEntry =
  | {
      kind: "override";
      rowId: string;
      date: string;
      description: string;
      typeId?: string;
      companyId?: string;
      baseAmount: number;
      // The effective new amount — fixed, or computed from the base
      // amount when the override is a modulation (which is then also
      // carried so the diff can render its ×2 / +5000 notation).
      amount: number;
      modulation?: ScenarioAmountModulation;
    }
  | {
      kind: "excluded";
      rowId: string;
      date: string;
      description: string;
      typeId?: string;
      companyId?: string;
      baseAmount: number;
    }
  | { kind: "added"; row: ScenarioAddedRow };

export function diffScenario(
  base: AccountBudget,
  scenario: Scenario,
): ScenarioDiffEntry[] {
  const { dateCol, descCol, amountCol } = getStandardColumns(base.columns);
  if (!dateCol || !descCol || !amountCol) return [];
  const rowsById = new Map(base.rows.map((r) => [r.id, r]));
  const entries: { date: string; entry: ScenarioDiffEntry }[] = [];
  for (const override of scenario.overrides) {
    const row = rowsById.get(override.rowId);
    if (!row || row.kind !== "user") continue;
    const rawDate = row.cells[dateCol.id];
    const rawDesc = row.cells[descCol.id];
    const rawAmount = row.cells[amountCol.id];
    const date = typeof rawDate === "string" ? rawDate : "";
    const description = typeof rawDesc === "string" ? rawDesc : "";
    const baseAmount = typeof rawAmount === "number" ? rawAmount : 0;
    if (override.excluded === true) {
      entries.push({
        date,
        entry: {
          kind: "excluded",
          rowId: row.id,
          date,
          description,
          ...(row.typeId !== undefined ? { typeId: row.typeId } : {}),
          ...(row.companyId !== undefined ? { companyId: row.companyId } : {}),
          baseAmount,
        },
      });
      continue;
    }
    // Only changes that actually differ from the base row count — an
    // override re-stating the base value (committed without editing,
    // or edited back by hand) must not surface a no-op "old → old"
    // line. Modulations on formula rows are inert at apply time, so
    // they are inert here too.
    const isModulated =
      override.amount === undefined &&
      override.modulation !== undefined &&
      row.amountFormula === undefined;
    const newAmount = isModulated
      ? modulateAmount(baseAmount, override.modulation!)
      : override.amount;
    if (newAmount === undefined || newAmount === baseAmount) continue;
    const entry: ScenarioDiffEntry = {
      kind: "override",
      rowId: row.id,
      date,
      description,
      ...(row.typeId !== undefined ? { typeId: row.typeId } : {}),
      ...(row.companyId !== undefined ? { companyId: row.companyId } : {}),
      baseAmount,
      amount: newAmount,
    };
    if (isModulated) entry.modulation = override.modulation;
    entries.push({ date, entry });
  }
  for (const row of scenario.addedRows) {
    entries.push({ date: row.date, entry: { kind: "added", row } });
  }
  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return entries.map((e) => e.entry);
}
