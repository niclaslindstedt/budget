import { rowsInSeriesFrom } from "../budget/rows";
import type { Action } from "../reducer";
import { findBaseBudget } from "../scenarios/apply";
import { getStandardColumns } from "../sheet";
import type {
  Scenario,
  ScenarioAddedRow,
  ScenarioRowOverride,
  ScenariosView,
  UserData,
} from "../types";
import { normalizeScenarioOverride } from "../validate/sheet-items";

// Action `type` literals the scenarios descriptor's `reduceItem`
// claims. Declared here (next to the dispatch) and re-exported by the
// descriptor so the registry's `ownsItemAction` sees them.
export const SCENARIOS_ITEM_ACTION_TYPES = [
  "setScenariosBaseSheet",
  "addScenario",
  "updateScenario",
  "deleteScenario",
  "setScenarioOverride",
  "propagateScenarioOverrideToFuture",
  "addScenarioRow",
  "updateScenarioRow",
  "deleteScenarioRow",
  "setScenariosMonitors",
] as const;

type ScenariosItemAction = Extract<
  Action,
  { type: (typeof SCENARIOS_ITEM_ACTION_TYPES)[number] }
>;

function isScenariosItemAction(action: Action): action is ScenariosItemAction {
  return (SCENARIOS_ITEM_ACTION_TYPES as readonly string[]).includes(
    action.type,
  );
}

// Rewrite the targeted `scenariosView` item, leaving everything else
// untouched. `fn` returns the same reference to signal "no change", in
// which case the original state is returned so a redundant dispatch
// doesn't mint an undo step.
function updateScenariosView(
  state: UserData,
  sheetId: string,
  itemId: string,
  fn: (view: ScenariosView) => ScenariosView,
): UserData {
  let changed = false;
  const sheets = state.sheets.map((sheet) => {
    if (sheet.id !== sheetId) return sheet;
    let itemChanged = false;
    const items = sheet.items.map((item) => {
      if (item.id !== itemId || item.type !== "scenariosView") return item;
      const next = fn(item);
      if (next === item) return item;
      itemChanged = true;
      return next;
    });
    if (!itemChanged) return sheet;
    changed = true;
    return { ...sheet, items };
  });
  return changed ? { ...state, sheets } : state;
}

// Upsert one normalised override into a scenario's list — shared by the
// single-row `setScenarioOverride` path and the series sweep. The raw
// override is normalised first (the validator's contract), so an entry
// that keeps no field is REMOVED — that is the revert / re-include
// path. Same reference ⇒ no change.
function upsertOverride(
  scenario: Scenario,
  override: ScenarioRowOverride,
): Scenario {
  const normalized = normalizeScenarioOverride(override);
  const existing = scenario.overrides.find((o) => o.rowId === override.rowId);
  if (normalized === undefined) {
    if (existing === undefined) return scenario;
    return {
      ...scenario,
      overrides: scenario.overrides.filter((o) => o.rowId !== override.rowId),
    };
  }
  if (
    existing !== undefined &&
    existing.amount === normalized.amount &&
    existing.description === normalized.description &&
    existing.excluded === normalized.excluded
  )
    return scenario;
  return {
    ...scenario,
    overrides:
      existing === undefined
        ? [...scenario.overrides, normalized]
        : scenario.overrides.map((o) =>
            o.rowId === normalized.rowId ? normalized : o,
          ),
  };
}

// Rewrite one scenario by id inside a view. Same reference ⇒ no change.
function updateScenarioById(
  view: ScenariosView,
  scenarioId: string,
  fn: (scenario: Scenario) => Scenario,
): ScenariosView {
  let changed = false;
  const scenarios = view.scenarios.map((s) => {
    if (s.id !== scenarioId) return s;
    const next = fn(s);
    if (next === s) return s;
    changed = true;
    return next;
  });
  return changed ? { ...view, scenarios } : view;
}

// Scenarios-item dispatch tail: deltas (overrides / exclusions / added
// rows), monitor dates, and the base-sheet binding all live inside the
// targeted sheet's `scenariosView` item. Returns null when `action` is
// not a scenarios action so the outer reducer's descriptor walk can
// defer to the next flavour's `reduceItem`.
export function reduceScenariosItem(
  state: UserData,
  action: Action,
): UserData | null {
  if (!isScenariosItemAction(action)) return null;

  if (action.type === "setScenariosBaseSheet") {
    return updateScenariosView(state, action.sheetId, action.itemId, (view) => {
      if (view.baseSheetId === action.baseSheetId) return view;
      // Overrides and exclusions are keyed by the OLD base sheet's row
      // ids, which are meaningless against a different base — clear
      // every scenario's deltas (the UI confirms before dispatching
      // when deltas exist). Scenario names survive the rebind.
      return {
        ...view,
        baseSheetId: action.baseSheetId,
        scenarios: view.scenarios.map((s) =>
          s.overrides.length === 0 && s.addedRows.length === 0
            ? s
            : { ...s, overrides: [], addedRows: [] },
        ),
      };
    });
  }
  if (action.type === "addScenario") {
    return updateScenariosView(state, action.sheetId, action.itemId, (view) =>
      view.scenarios.some((s) => s.id === action.scenario.id)
        ? view
        : { ...view, scenarios: [...view.scenarios, action.scenario] },
    );
  }
  if (action.type === "updateScenario") {
    return updateScenariosView(state, action.sheetId, action.itemId, (view) =>
      updateScenarioById(view, action.scenarioId, (s) => {
        const name = action.patch.name;
        if (name === undefined || name === s.name) return s;
        return { ...s, name };
      }),
    );
  }
  if (action.type === "deleteScenario") {
    return updateScenariosView(state, action.sheetId, action.itemId, (view) => {
      const scenarios = view.scenarios.filter(
        (s) => s.id !== action.scenarioId,
      );
      if (scenarios.length === view.scenarios.length) return view;
      return { ...view, scenarios };
    });
  }
  if (action.type === "setScenarioOverride") {
    return updateScenariosView(state, action.sheetId, action.itemId, (view) =>
      updateScenarioById(view, action.scenarioId, (s) =>
        upsertOverride(s, action.override),
      ),
    );
  }
  if (action.type === "propagateScenarioOverrideToFuture") {
    return updateScenariosView(state, action.sheetId, action.itemId, (view) =>
      updateScenarioById(view, action.scenarioId, (s) => {
        const base = findBaseBudget(state.sheets, view.baseSheetId ?? null);
        if (!base) return s;
        const { dateCol, descCol, amountCol } = getStandardColumns(
          base.item.columns,
        );
        if (!dateCol || !descCol || !amountCol) return s;
        const anchor = base.item.rows.find((r) => r.id === action.rowId);
        if (!anchor || anchor.kind !== "user") return s;
        const valueCol = action.field === "amount" ? amountCol : descCol;
        let next = s;
        for (const target of rowsInSeriesFrom(
          base.item.rows,
          anchor,
          dateCol.id,
          action.untilIso,
        )) {
          if (target.kind !== "user") continue;
          const existing = next.overrides.find((o) => o.rowId === target.id);
          const override: ScenarioRowOverride = {
            ...existing,
            rowId: target.id,
          };
          // A swept value identical to the target's own base cell is a
          // revert for that row — drop the field so no no-op override
          // lingers (and the entry itself when nothing else remains).
          if (action.value === target.cells[valueCol.id]) {
            delete override[action.field];
          } else if (action.field === "amount") {
            if (typeof action.value === "number")
              override.amount = action.value;
          } else if (typeof action.value === "string") {
            override.description = action.value;
          }
          next = upsertOverride(next, override);
        }
        return next;
      }),
    );
  }
  if (action.type === "addScenarioRow") {
    return updateScenariosView(state, action.sheetId, action.itemId, (view) =>
      updateScenarioById(view, action.scenarioId, (s) =>
        s.addedRows.some((r) => r.id === action.row.id)
          ? s
          : { ...s, addedRows: [...s.addedRows, action.row] },
      ),
    );
  }
  if (action.type === "updateScenarioRow") {
    return updateScenariosView(state, action.sheetId, action.itemId, (view) =>
      updateScenarioById(view, action.scenarioId, (s) => {
        let changed = false;
        const addedRows = s.addedRows.map((r) => {
          if (r.id !== action.rowId) return r;
          const next: ScenarioAddedRow = { ...r, ...action.patch };
          if (
            next.date === r.date &&
            next.description === r.description &&
            next.amount === r.amount
          )
            return r;
          changed = true;
          return next;
        });
        return changed ? { ...s, addedRows } : s;
      }),
    );
  }
  if (action.type === "deleteScenarioRow") {
    return updateScenariosView(state, action.sheetId, action.itemId, (view) =>
      updateScenarioById(view, action.scenarioId, (s) => {
        const addedRows = s.addedRows.filter((r) => r.id !== action.rowId);
        if (addedRows.length === s.addedRows.length) return s;
        return { ...s, addedRows };
      }),
    );
  }
  // setScenariosMonitors — wholesale replace (add and remove both route
  // through here, one undo step each), normalised to the validator's
  // invariant: valid ISO dates only, deduped, sorted ascending.
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const m of action.monitors) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m) || seen.has(m)) continue;
    seen.add(m);
    kept.push(m);
  }
  kept.sort();
  return updateScenariosView(state, action.sheetId, action.itemId, (view) => {
    if (
      view.monitors.length === kept.length &&
      view.monitors.every((m, i) => m === kept[i])
    )
      return view;
    return { ...view, monitors: kept };
  });
}
