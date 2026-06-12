import { useEffect, useMemo, useState } from "react";
import {
  GitCompareArrows,
  LineChart as LineChartIcon,
  Pencil,
  Plus,
} from "lucide-react";

import type { Action } from "../../data/reducer";
import { allTypes } from "../../data/presets/merge";
import {
  buildSynthesizedRows,
  getLastSeriesDate,
} from "../../data/budget/rows";
import {
  currentFiscalMonthKey,
  fiscalMonthSeedIso,
  sortMonthKeys,
} from "../../data/fiscal-month";
import {
  diffScenario,
  findBaseBudget,
  modulateAmount,
  overridesByRowId,
} from "../../data/scenarios/apply";
import {
  balanceAtDate,
  computeScenarioState,
  monthlyEndBalances,
} from "../../data/scenarios/series";
import { newId } from "../../data/sheet";
import type {
  Scenario,
  ScenarioAddedRow,
  ScenarioAmountModulation,
  ScenarioRowOverride,
  ScenariosView,
  Settings,
  Sheet,
  UserData,
  UserRow,
} from "../../data/types";
import { useT } from "../../i18n";
import { indexById } from "../../utils/indexById";
import { ActiveRowProvider } from "../ActiveRowProvider";
import { ApplySeriesDialog } from "../ApplySeriesDialog";
import { ConfirmDialog } from "../ConfirmDialog";
import { SelectPicker, type SelectOption } from "../form";
import { useModalDispatch } from "../modal-dispatch";
import {
  SheetTitleMenu,
  favoriteMenuItem,
  type SheetTitleMenuItem,
} from "../SheetTitleMenu";
import { BASELINE_COLOR_VAR, scenarioColorVar } from "./scenario-colors";
import { ScenarioEditModal } from "./ScenarioEditModal";
import { ScenarioModulateModal } from "./ScenarioModulateModal";
import { ScenarioMonthTable } from "./ScenarioMonthTable";
import { ScenarioPicker } from "./ScenarioPicker";
import { ScenarioRowModal } from "./ScenarioRowModal";
import {
  ScenariosChartModal,
  type ScenarioChartVariant,
} from "./ScenariosChartModal";
import { ScenariosAddMonitorModal } from "./ScenariosAddMonitorModal";
import { ScenariosDiffModal } from "./ScenariosDiffModal";
import { ScenariosMonitorRow } from "./ScenariosMonitorRow";

// The Scenarios page plays what-if variants against ONE base budget
// sheet. Everything on screen derives from live data: the implicit
// Baseline is the base budget run through the exact pipeline the budget
// page uses, and each scenario is the same pipeline run on a clone with
// that scenario's deltas applied. Editing here only ever writes deltas
// into this sheet's `scenariosView` item — never into the base budget.

type Props = {
  sheet: Sheet;
  data: UserData;
  settings: Settings;
  dispatch: (action: Action) => void;
};

const BASELINE_KEY = "baseline";

type RowModalState =
  | { kind: "add"; seedDate: string }
  | { kind: "edit"; row: ScenarioAddedRow };

// "Apply this edit to the rest of the recurring series?" staging slot —
// set when an amount commit or a live adjustment lands on a base row
// with a `seriesId` that continues past the anchor date. The
// ApplySeriesDialog consumes it; confirming dispatches the override
// sweep.
type PendingSeriesApply = {
  rowId: string;
  change:
    | { kind: "amount"; amount: number }
    | { kind: "modulation"; modulation: ScenarioAmountModulation };
  fieldLabel: string;
  anchorDate: string;
  lastSeriesDate: string | null;
};

export function ScenariosPage({ sheet, data, settings, dispatch }: Props) {
  const t = useT();
  const dispatchModal = useModalDispatch();

  const view = sheet.items.find(
    (item): item is ScenariosView => item.type === "scenariosView",
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [sheet.id]);

  // Ephemeral UI state — deliberately not persisted (a tab switch must
  // not mint an undo step or a storage write).
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [showEarlierMonths, setShowEarlierMonths] = useState(false);
  const [rowModal, setRowModal] = useState<RowModalState | null>(null);
  const [modulateRowId, setModulateRowId] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<
    { kind: "create" } | { kind: "rename"; scenario: Scenario } | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<Scenario | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [pendingSeriesApply, setPendingSeriesApply] =
    useState<PendingSeriesApply | null>(null);
  const [pendingBaseSheetId, setPendingBaseSheetId] = useState<string | null>(
    null,
  );
  const [addMonitorOpen, setAddMonitorOpen] = useState(false);
  // Anchor rows whose hidden-transfer run is expanded inline — same
  // per-row reveal the budget table drives via `useBudgetLayoutState`.
  // Reset when the sheet or the active variant changes (each variant
  // renders its own row set).
  const [expandedTransferAnchors, setExpandedTransferAnchors] = useState<
    Set<string>
  >(() => new Set());
  useEffect(() => {
    setExpandedTransferAnchors(new Set());
  }, [sheet.id, activeScenarioId]);
  const toggleTransferAnchor = (rowId: string) => {
    setExpandedTransferAnchors((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const viewScenarios = view?.scenarios;
  const viewMonitors = view?.monitors;
  const scenarios = useMemo(() => viewScenarios ?? [], [viewScenarios]);
  const monitors = useMemo(() => viewMonitors ?? [], [viewMonitors]);
  const activeScenario =
    scenarios.find((s) => s.id === activeScenarioId) ?? null;

  const base = findBaseBudget(data.sheets, view?.baseSheetId ?? null);

  // Same merge memo shape as AppShell's `allTypesMerged` — narrowed deps
  // so unrelated edits don't re-mint the array (and with it the
  // synthesis memo below).
  const typesMerged = useMemo(
    () => allTypes(data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.hiddenPresetTypeIds, data.presetTypeKindOverrides, data.types],
  );
  const typesById = useMemo(() => indexById(typesMerged), [typesMerged]);
  const companiesById = useMemo(
    () => indexById(data.companies),
    [data.companies],
  );
  const accountsById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of data.accounts) m.set(a.id, a.name);
    return m;
  }, [data.accounts]);

  const baseItem = base?.item ?? null;
  const baseAccountId = baseItem?.accountId ?? null;
  const history = useMemo(
    () => (baseAccountId ? (data.history[baseAccountId] ?? []) : []),
    [baseAccountId, data.history],
  );
  const openingBalance = baseAccountId
    ? (data.accounts.find((a) => a.id === baseAccountId)?.openingBalance ?? 0)
    : 0;

  // Shared across every variant — synthesized rows don't depend on
  // `item.rows`, so the baseline and all scenarios reuse one walk.
  const synthesizedRows = useMemo(
    () =>
      baseItem
        ? buildSynthesizedRows(
            baseItem.columns,
            baseItem.accountId,
            data.transfers,
            history,
            accountsById,
            data.merchantHints,
            data.matchRules,
            data.companies,
            typesMerged,
          )
        : [],
    [
      baseItem,
      data.transfers,
      history,
      accountsById,
      data.merchantHints,
      data.matchRules,
      data.companies,
      typesMerged,
    ],
  );

  // One full pipeline run per variant. The chart and the monitors need
  // every scenario, the tables need the baseline + active one — with a
  // handful of scenarios the simplest correct thing is to compute all
  // of them in one memo.
  const variantStates = useMemo(() => {
    const states = new Map<string, ReturnType<typeof computeScenarioState>>();
    if (!baseItem) return states;
    states.set(
      BASELINE_KEY,
      computeScenarioState({
        baseItem,
        scenario: null,
        openingBalance,
        data,
        settings,
        history,
        typesById,
        synthesizedRows,
      }),
    );
    for (const scenario of scenarios) {
      states.set(
        scenario.id,
        computeScenarioState({
          baseItem,
          scenario,
          openingBalance,
          data,
          settings,
          history,
          typesById,
          synthesizedRows,
        }),
      );
    }
    return states;
  }, [
    baseItem,
    scenarios,
    openingBalance,
    data,
    settings,
    history,
    typesById,
    synthesizedRows,
  ]);

  // Monthly end balances per variant — the visualize modal clips them
  // to its forward horizon itself.
  const endBalancesByVariant = useMemo(() => {
    const out = new Map<string, Map<string, number>>();
    for (const [key, state] of variantStates)
      out.set(key, monthlyEndBalances(state));
    return out;
  }, [variantStates]);

  const monitorValues = useMemo(() => {
    const out = new Map<string, ReadonlyMap<string, number>>();
    for (const monitor of monitors) {
      const values = new Map<string, number>();
      for (const [key, state] of variantStates)
        values.set(key, balanceAtDate(state, monitor, openingBalance));
      out.set(monitor, values);
    }
    return out;
  }, [monitors, variantStates, openingBalance]);

  // Table inputs for the active tab.
  const activeState = variantStates.get(activeScenario?.id ?? BASELINE_KEY);
  const activeOverrides = useMemo(
    () =>
      activeScenario
        ? overridesByRowId(activeScenario)
        : new Map<string, ScenarioRowOverride>(),
    [activeScenario],
  );
  const {
    editableRowIds,
    formulaRowIds,
    baseUserRowsById,
    baseAmounts,
    baseDescriptions,
  } = useMemo(() => {
    const ids = new Set<string>();
    const formulaIds = new Set<string>();
    const byId = new Map<string, UserRow>();
    const amounts = new Map<string, number>();
    const descriptions = new Map<string, string>();
    if (baseItem) {
      const amountCol = baseItem.columns.find((c) => c.type === "amount");
      const descCol = baseItem.columns.find((c) => c.type === "description");
      for (const row of baseItem.rows) {
        if (row.kind !== "user") continue;
        ids.add(row.id);
        if (row.amountFormula !== undefined) formulaIds.add(row.id);
        byId.set(row.id, row);
        const v = amountCol ? row.cells[amountCol.id] : undefined;
        if (typeof v === "number") amounts.set(row.id, v);
        const d = descCol ? row.cells[descCol.id] : undefined;
        if (typeof d === "string") descriptions.set(row.id, d);
      }
    }
    return {
      editableRowIds: ids,
      formulaRowIds: formulaIds,
      baseUserRowsById: byId,
      baseAmounts: amounts,
      baseDescriptions: descriptions,
    };
  }, [baseItem]);

  // Month list for the tables: ascending, current fiscal month onward
  // by default — scenarios are forward-looking, and the bank-covered
  // past can't change anyway. A toggle reveals the full history.
  const monthKeys = useMemo(() => {
    if (!activeState) return [] as string[];
    const keys = sortMonthKeys(activeState.sortedMonthGroups.keys());
    if (showEarlierMonths) return keys;
    const current = currentFiscalMonthKey(settings.startOfMonth);
    const upcoming = keys.filter((k) => k === "undated" || k >= current);
    return upcoming.length > 0 ? upcoming : keys;
  }, [activeState, showEarlierMonths, settings.startOfMonth]);
  const hasEarlierMonths = useMemo(() => {
    if (!activeState) return false;
    const current = currentFiscalMonthKey(settings.startOfMonth);
    return sortMonthKeys(activeState.sortedMonthGroups.keys()).some(
      (k) => k !== "undated" && k < current,
    );
  }, [activeState, settings.startOfMonth]);

  // Delta dispatch helpers — every table affordance funnels through the
  // upsert-by-rowId `setScenarioOverride` action; merging with the
  // existing entry happens here so the table stays presentational.
  function patchOverride(
    rowId: string,
    patch: Partial<Omit<ScenarioRowOverride, "rowId">>,
  ) {
    if (!view || !activeScenario) return;
    const existing = activeOverrides.get(rowId);
    dispatch({
      type: "setScenarioOverride",
      sheetId: sheet.id,
      itemId: view.id,
      scenarioId: activeScenario.id,
      override: { rowId, ...existing, ...patch },
    });
  }

  // When the committed row belongs to a recurring series that continues
  // past it, stage the "apply to upcoming entries too?" prompt — same
  // flow as committing a series cell on the budget page.
  function maybeStageSeriesApply(
    rowId: string,
    change: PendingSeriesApply["change"],
  ) {
    if (!baseItem || !activeScenario) return;
    const row = baseUserRowsById.get(rowId);
    if (!row?.seriesId) return;
    const dateCol = baseItem.columns.find((c) => c.type === "date");
    const amountCol = baseItem.columns.find((c) => c.type === "amount");
    if (!dateCol || !amountCol) return;
    const anchorDate =
      typeof row.cells[dateCol.id] === "string"
        ? (row.cells[dateCol.id] as string)
        : "";
    const lastSeriesDate = getLastSeriesDate(
      baseItem.rows,
      row.seriesId,
      dateCol.id,
    );
    if (lastSeriesDate === null || lastSeriesDate <= anchorDate) return;
    setPendingSeriesApply({
      rowId,
      change,
      fieldLabel: amountCol.label,
      anchorDate,
      lastSeriesDate,
    });
  }

  // The amount a row currently shows: fixed override if set, modulated
  // base when a live adjustment applies, the base amount otherwise.
  function shownAmount(rowId: string): number | undefined {
    const override = activeOverrides.get(rowId);
    const base = baseAmounts.get(rowId);
    if (override?.amount !== undefined) return override.amount;
    if (
      override?.modulation !== undefined &&
      base !== undefined &&
      !formulaRowIds.has(rowId)
    )
      return modulateAmount(base, override.modulation);
    return base;
  }

  // Commits route through a base-value comparison so a value typed (or
  // typed back) equal to the base row CLEARS the override instead of
  // storing a no-op "change" — the diff modal then only ever shows
  // actual changes. A commit equal to the value already on screen is a
  // pure no-op: no override write, and crucially no "apply to the rest
  // of the series?" prompt for an edit that didn't change anything. A
  // fixed amount always displaces a live adjustment — they are mutually
  // exclusive.
  function handleCommitAmount(rowId: string, amount: number) {
    if (shownAmount(rowId) === amount) return;
    patchOverride(rowId, {
      amount: baseAmounts.get(rowId) === amount ? undefined : amount,
      modulation: undefined,
    });
    maybeStageSeriesApply(rowId, { kind: "amount", amount });
  }
  function handleSaveModulation(
    rowId: string,
    modulation: ScenarioAmountModulation,
  ) {
    const existing = activeOverrides.get(rowId)?.modulation;
    if (existing?.op === modulation.op && existing?.value === modulation.value)
      return;
    patchOverride(rowId, { modulation, amount: undefined });
    maybeStageSeriesApply(rowId, { kind: "modulation", modulation });
  }

  const chartVariants: ScenarioChartVariant[] = [
    {
      key: BASELINE_KEY,
      label: t("scenarios.baselineTab"),
      colorVar: BASELINE_COLOR_VAR,
      dashed: true,
    },
    ...scenarios.map((s, i) => ({
      key: s.id,
      label: s.name,
      colorVar: scenarioColorVar(i),
    })),
  ];

  const budgetSheets = data.sheets.filter((s) => s.type === "budget");
  const baseOptions: SelectOption<string>[] = budgetSheets.map((s) => ({
    value: s.id,
    label: s.name,
  }));

  const anyDeltas = scenarios.some(
    (s) => s.overrides.length > 0 || s.addedRows.length > 0,
  );
  function requestBaseChange(nextId: string) {
    if (!view || nextId === view.baseSheetId) return;
    if (anyDeltas) {
      setPendingBaseSheetId(nextId);
    } else {
      dispatch({
        type: "setScenariosBaseSheet",
        sheetId: sheet.id,
        itemId: view.id,
        baseSheetId: nextId,
      });
    }
  }

  const titleMenuItems: SheetTitleMenuItem[] = [
    favoriteMenuItem(sheet, t, dispatchModal),
    ...(base
      ? [
          {
            key: "visualize",
            icon: <LineChartIcon size={16} aria-hidden focusable={false} />,
            label: t("scenarios.visualizeAction"),
            onClick: () => setChartOpen(true),
          },
        ]
      : []),
    ...(activeScenario
      ? [
          {
            key: "diff",
            icon: <GitCompareArrows size={16} aria-hidden focusable={false} />,
            label: t("scenarios.diffAction"),
            onClick: () => setDiffOpen(true),
          },
        ]
      : []),
    {
      key: "edit",
      icon: <Pencil size={16} aria-hidden focusable={false} />,
      label: t("sheet.editSheet"),
      onClick: () =>
        dispatchModal({ kind: "open-edit-sheet", sheetId: sheet.id }),
    },
  ];

  if (!view) return null;

  return (
    <section>
      <header className="mb-2 flex items-center justify-center md:mb-6">
        <h2 className="m-0">
          <SheetTitleMenu sheetName={sheet.name} items={titleMenuItems} />
        </h2>
      </header>

      {!base ? (
        <section
          className="mx-auto flex max-w-md flex-col gap-3 rounded border border-line bg-surface px-4 py-6"
          data-sheet-content
        >
          <h3 className="m-0 text-center text-sm font-bold tracking-wider uppercase text-fg-bright">
            {t("scenarios.pickBaseTitle")}
          </h3>
          <p className="m-0 text-center text-sm text-muted">
            {t("scenarios.pickBaseBody")}
          </p>
          {budgetSheets.length === 0 ? (
            <p className="m-0 rounded border border-line bg-surface-2 px-3 py-2 text-center text-xs text-muted">
              {t("scenarios.noBudgetSheets")}
            </p>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">
                {t("scenarios.pickBaseLabel")}
              </span>
              <SelectPicker
                value={view.baseSheetId ?? ""}
                options={[
                  {
                    value: "",
                    label: t("scenarios.noBaseOption"),
                    disabled: true,
                  },
                  ...baseOptions,
                ]}
                onChange={(next) => {
                  if (next !== "") requestBaseChange(next);
                }}
                ariaLabel={t("scenarios.pickBaseLabel")}
              />
            </label>
          )}
        </section>
      ) : (
        <div className="flex flex-col gap-6" data-sheet-content>
          <ScenarioPicker
            scenarios={scenarios}
            activeScenarioId={activeScenario?.id ?? null}
            onSelect={setActiveScenarioId}
            onAdd={() => setEditModal({ kind: "create" })}
            onRename={(scenario) => setEditModal({ kind: "rename", scenario })}
            onDelete={setDeleteTarget}
          />

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="m-0 text-xs font-bold tracking-wider uppercase text-fg-bright">
                {t("scenarios.monitorsTitle")}
              </h3>
              <button
                type="button"
                aria-label={t("scenarios.addMonitor")}
                title={t("scenarios.addMonitor")}
                onClick={() => setAddMonitorOpen(true)}
                className="flex size-6 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <Plus size={14} aria-hidden focusable={false} />
              </button>
            </div>
            <ScenariosMonitorRow
              monitors={monitors}
              scenarios={scenarios}
              valuesByMonitor={monitorValues}
              settings={settings}
              onSetMonitors={(next) =>
                dispatch({
                  type: "setScenariosMonitors",
                  sheetId: sheet.id,
                  itemId: view.id,
                  monitors: next,
                })
              }
            />
          </div>

          <ActiveRowProvider>
            <div className="flex flex-col gap-3">
              {activeScenario === null && (
                <p className="m-0 rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
                  {t("scenarios.baselineReadOnly")}
                </p>
              )}
              {hasEarlierMonths && (
                <button
                  type="button"
                  onClick={() => setShowEarlierMonths((v) => !v)}
                  className="group flex cursor-pointer items-center gap-2 border-0 bg-transparent px-0 py-1 text-xs text-muted hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <span aria-hidden className="h-px flex-1 bg-line" />
                  <span className="whitespace-nowrap">
                    {showEarlierMonths
                      ? t("scenarios.hideEarlierMonths")
                      : t("scenarios.showEarlierMonths")}
                  </span>
                  <span aria-hidden className="h-px flex-1 bg-line" />
                </button>
              )}
              {activeState &&
                monthKeys.map((monthKey) => (
                  <ScenarioMonthTable
                    key={monthKey}
                    monthKey={monthKey}
                    rows={activeState.sortedMonthGroups.get(monthKey) ?? []}
                    balances={activeState.balances}
                    dateColId={activeState.dateCol?.id}
                    descColId={
                      baseItem?.columns.find((c) => c.type === "description")
                        ?.id
                    }
                    amountColId={
                      baseItem?.columns.find((c) => c.type === "amount")?.id
                    }
                    overrides={activeOverrides}
                    baseAmounts={baseAmounts}
                    typesById={typesById}
                    companiesById={companiesById}
                    expandedTransferAnchors={expandedTransferAnchors}
                    onToggleTransferAnchor={toggleTransferAnchor}
                    editableRowIds={editableRowIds}
                    formulaRowIds={formulaRowIds}
                    readOnly={activeScenario === null}
                    amountChars={activeState.colWidths.amountChars}
                    balanceChars={activeState.colWidths.balanceChars}
                    settings={settings}
                    onCommitAmount={handleCommitAmount}
                    onModulate={setModulateRowId}
                    onToggleExcluded={(rowId) =>
                      patchOverride(rowId, {
                        excluded: activeOverrides.get(rowId)?.excluded
                          ? undefined
                          : true,
                      })
                    }
                    onRevert={(rowId) => {
                      if (!view || !activeScenario) return;
                      dispatch({
                        type: "setScenarioOverride",
                        sheetId: sheet.id,
                        itemId: view.id,
                        scenarioId: activeScenario.id,
                        override: { rowId },
                      });
                    }}
                    onEditAddedRow={(addedId) => {
                      const added = activeScenario?.addedRows.find(
                        (r) => r.id === addedId,
                      );
                      if (added) setRowModal({ kind: "edit", row: added });
                    }}
                    onAddRow={() =>
                      setRowModal({
                        kind: "add",
                        seedDate: fiscalMonthSeedIso(
                          monthKey,
                          settings.startOfMonth,
                        ),
                      })
                    }
                  />
                ))}
            </div>
          </ActiveRowProvider>
        </div>
      )}

      <ScenarioEditModal
        open={editModal !== null}
        initialName={
          editModal?.kind === "rename" ? editModal.scenario.name : null
        }
        onClose={() => setEditModal(null)}
        onSave={(name) => {
          if (!view) return;
          if (editModal?.kind === "rename") {
            dispatch({
              type: "updateScenario",
              sheetId: sheet.id,
              itemId: view.id,
              scenarioId: editModal.scenario.id,
              patch: { name },
            });
          } else {
            const scenario: Scenario = {
              id: newId(),
              name,
              overrides: [],
              addedRows: [],
            };
            dispatch({
              type: "addScenario",
              sheetId: sheet.id,
              itemId: view.id,
              scenario,
            });
            setActiveScenarioId(scenario.id);
          }
        }}
      />

      <ScenarioRowModal
        open={rowModal !== null}
        row={rowModal?.kind === "edit" ? rowModal.row : null}
        seedDate={rowModal?.kind === "add" ? rowModal.seedDate : ""}
        settings={settings}
        onClose={() => setRowModal(null)}
        onSave={(row) => {
          if (!view || !activeScenario) return;
          if (rowModal?.kind === "edit") {
            dispatch({
              type: "updateScenarioRow",
              sheetId: sheet.id,
              itemId: view.id,
              scenarioId: activeScenario.id,
              rowId: row.id,
              patch: {
                date: row.date,
                description: row.description,
                amount: row.amount,
              },
            });
          } else {
            dispatch({
              type: "addScenarioRow",
              sheetId: sheet.id,
              itemId: view.id,
              scenarioId: activeScenario.id,
              row,
            });
          }
        }}
        onDelete={(rowId) => {
          if (!view || !activeScenario) return;
          dispatch({
            type: "deleteScenarioRow",
            sheetId: sheet.id,
            itemId: view.id,
            scenarioId: activeScenario.id,
            rowId,
          });
        }}
      />

      <ScenarioModulateModal
        open={modulateRowId !== null}
        rowId={modulateRowId}
        rowName={
          modulateRowId === null
            ? ""
            : (baseDescriptions.get(modulateRowId) ?? "")
        }
        baseAmount={
          modulateRowId === null ? 0 : (baseAmounts.get(modulateRowId) ?? 0)
        }
        modulation={
          modulateRowId === null
            ? null
            : (activeOverrides.get(modulateRowId)?.modulation ?? null)
        }
        settings={settings}
        onClose={() => setModulateRowId(null)}
        onSave={(modulation) => {
          if (modulateRowId !== null)
            handleSaveModulation(modulateRowId, modulation);
        }}
        onRemove={() => {
          if (modulateRowId !== null)
            patchOverride(modulateRowId, { modulation: undefined });
        }}
      />

      <ScenariosAddMonitorModal
        open={addMonitorOpen}
        monitors={monitors}
        onClose={() => setAddMonitorOpen(false)}
        onAdd={(isoDate) => {
          if (!view) return;
          dispatch({
            type: "setScenariosMonitors",
            sheetId: sheet.id,
            itemId: view.id,
            monitors: [...monitors, isoDate],
          });
        }}
      />

      <ScenariosChartModal
        open={chartOpen}
        variants={chartVariants}
        endBalancesByVariant={endBalancesByVariant}
        openingBalance={openingBalance}
        settings={settings}
        onClose={() => setChartOpen(false)}
      />

      {activeScenario && baseItem && (
        <ScenariosDiffModal
          open={diffOpen}
          scenarioName={activeScenario.name}
          entries={diffScenario(baseItem, activeScenario)}
          settings={settings}
          onClose={() => setDiffOpen(false)}
        />
      )}

      <ApplySeriesDialog
        open={pendingSeriesApply !== null}
        fieldLabel={pendingSeriesApply?.fieldLabel ?? ""}
        anchorDate={pendingSeriesApply?.anchorDate ?? ""}
        lastSeriesDate={pendingSeriesApply?.lastSeriesDate ?? null}
        onCancel={() => setPendingSeriesApply(null)}
        onApplyToFuture={(untilIso) => {
          if (!view || !activeScenario || !pendingSeriesApply) return;
          dispatch({
            type: "propagateScenarioOverrideToFuture",
            sheetId: sheet.id,
            itemId: view.id,
            scenarioId: activeScenario.id,
            rowId: pendingSeriesApply.rowId,
            change: pendingSeriesApply.change,
            untilIso,
          });
          setPendingSeriesApply(null);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("scenarios.deleteScenario")}
        description={
          deleteTarget
            ? t("scenarios.deleteConfirm", { name: deleteTarget.name })
            : undefined
        }
        actions={[
          {
            label: t("common.delete"),
            tone: "danger",
            onSelect: () => {
              if (!view || !deleteTarget) return;
              if (activeScenarioId === deleteTarget.id)
                setActiveScenarioId(null);
              dispatch({
                type: "deleteScenario",
                sheetId: sheet.id,
                itemId: view.id,
                scenarioId: deleteTarget.id,
              });
              setDeleteTarget(null);
            },
          },
        ]}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={pendingBaseSheetId !== null}
        title={t("scenarios.changeBaseAction")}
        description={t("scenarios.changeBaseConfirm")}
        actions={[
          {
            label: t("scenarios.changeBaseAction"),
            tone: "danger",
            onSelect: () => {
              if (!view || pendingBaseSheetId === null) return;
              dispatch({
                type: "setScenariosBaseSheet",
                sheetId: sheet.id,
                itemId: view.id,
                baseSheetId: pendingBaseSheetId,
              });
              setPendingBaseSheetId(null);
            },
          },
        ]}
        onCancel={() => setPendingBaseSheetId(null)}
      />
    </section>
  );
}
