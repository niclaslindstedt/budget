import { useEffect, useMemo, useState } from "react";
import { GitCompareArrows, Pencil } from "lucide-react";

import type { Action } from "../../data/reducer";
import { allTypes } from "../../data/presets/merge";
import { buildSynthesizedRows } from "../../data/budget/rows";
import {
  currentFiscalMonthKey,
  fiscalMonthSeedIso,
  sortMonthKeys,
} from "../../data/fiscal-month";
import {
  diffScenario,
  findBaseBudget,
  overridesByRowId,
} from "../../data/scenarios/apply";
import {
  balanceAtDate,
  buildScenarioChartPoints,
  computeScenarioState,
  epochMsToMonthKey,
  monthlyEndBalances,
} from "../../data/scenarios/series";
import { newId } from "../../data/sheet";
import type {
  Scenario,
  ScenarioAddedRow,
  ScenarioRowOverride,
  ScenariosView,
  Settings,
  Sheet,
  UserData,
} from "../../data/types";
import { useIsMobile } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { indexById } from "../../utils/indexById";
import {
  formatMonthYearShort,
  formatNumber,
  withCurrency,
} from "../../utils/format";
import { LineChart, type ChartSeries } from "../charts/LineChart";
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
import { ScenarioMonthTable } from "./ScenarioMonthTable";
import { ScenarioRowModal } from "./ScenarioRowModal";
import { ScenariosDiffModal } from "./ScenariosDiffModal";
import { ScenariosMonitorRow } from "./ScenariosMonitorRow";
import { ScenarioTabs } from "./ScenarioTabs";

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

export function ScenariosPage({ sheet, data, settings, dispatch }: Props) {
  const t = useT();
  const lang = useLang();
  const isMobile = useIsMobile();
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
  const [hiddenSeries, setHiddenSeries] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [showEarlierMonths, setShowEarlierMonths] = useState(false);
  const [rowModal, setRowModal] = useState<RowModalState | null>(null);
  const [editModal, setEditModal] = useState<
    { kind: "create" } | { kind: "rename"; scenario: Scenario } | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<Scenario | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [pendingBaseSheetId, setPendingBaseSheetId] = useState<string | null>(
    null,
  );

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

  const chartPointsByVariant = useMemo(() => {
    const byVariant = new Map<string, Map<string, number>>();
    for (const [key, state] of variantStates)
      byVariant.set(key, monthlyEndBalances(state));
    return buildScenarioChartPoints(byVariant, openingBalance);
  }, [variantStates, openingBalance]);

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
  const { editableRowIds, baseAmounts } = useMemo(() => {
    const ids = new Set<string>();
    const amounts = new Map<string, number>();
    if (baseItem) {
      const amountCol = baseItem.columns.find((c) => c.type === "amount");
      for (const row of baseItem.rows) {
        if (row.kind !== "user") continue;
        ids.add(row.id);
        const v = amountCol ? row.cells[amountCol.id] : undefined;
        if (typeof v === "number") amounts.set(row.id, v);
      }
    }
    return { editableRowIds: ids, baseAmounts: amounts };
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

  const chartVariants: { key: string; label: string; colorVar: string }[] = [
    {
      key: BASELINE_KEY,
      label: t("scenarios.baselineTab"),
      colorVar: BASELINE_COLOR_VAR,
    },
    ...scenarios.map((s, i) => ({
      key: s.id,
      label: s.name,
      colorVar: scenarioColorVar(i),
    })),
  ];
  const chartSeries: ChartSeries[] = chartVariants
    .filter((v) => !hiddenSeries.has(v.key))
    .map((v) => ({
      id: v.key,
      label: v.label,
      colorVar: v.colorVar,
      dashed: v.key === BASELINE_KEY,
      points: chartPointsByVariant.get(v.key) ?? [],
    }));
  const hasChart = chartSeries.some((s) => s.points.length >= 2);

  const formatX = (x: number) =>
    formatMonthYearShort(epochMsToMonthKey(x), lang);
  const formatY = (y: number) =>
    withCurrency(
      formatNumber(
        y,
        isMobile ? { ...settings, showDecimals: true } : settings,
        isMobile ? { forceAbbreviate: true } : {},
      ),
      settings,
    );

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
          <div className="flex flex-col gap-2">
            <ScenarioTabs
              scenarios={scenarios}
              activeScenarioId={activeScenario?.id ?? null}
              onSelect={setActiveScenarioId}
              onAdd={() => setEditModal({ kind: "create" })}
              onRename={(scenario) =>
                setEditModal({ kind: "rename", scenario })
              }
              onDelete={setDeleteTarget}
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span>{t("scenarios.baseLine", { name: base.sheet.name })}</span>
              <SelectPicker
                value={base.sheet.id}
                options={baseOptions}
                onChange={requestBaseChange}
                ariaLabel={t("scenarios.changeBaseAction")}
              />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-bold tracking-wider uppercase text-fg-bright">
              {t("scenarios.chartTitle")}
            </h3>
            {hasChart ? (
              <div className="flex flex-col gap-2">
                <div
                  role="group"
                  aria-label={t("scenarios.legendLabel")}
                  className="flex flex-wrap items-center gap-1.5"
                >
                  {chartVariants.map((variant) => {
                    const hidden = hiddenSeries.has(variant.key);
                    return (
                      <button
                        key={variant.key}
                        type="button"
                        aria-pressed={!hidden}
                        aria-label={t("scenarios.legendToggleAria", {
                          name: variant.label,
                        })}
                        onClick={() =>
                          setHiddenSeries((prev) => {
                            const next = new Set(prev);
                            if (next.has(variant.key)) next.delete(variant.key);
                            else next.add(variant.key);
                            return next;
                          })
                        }
                        className={`flex cursor-pointer items-center gap-1.5 rounded border border-line px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                          hidden
                            ? "bg-transparent text-muted opacity-60"
                            : "bg-surface text-fg"
                        }`}
                      >
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: `var(${variant.colorVar})` }}
                        />
                        <span className={hidden ? "line-through" : undefined}>
                          {variant.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="rounded border border-line bg-surface p-2">
                  <LineChart
                    series={chartSeries}
                    formatX={formatX}
                    formatY={formatY}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded border border-line bg-surface-2 px-4 py-8 text-center text-sm text-muted">
                {t("scenarios.chartEmpty")}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-bold tracking-wider uppercase text-fg-bright">
              {t("scenarios.monitorsTitle")}
            </h3>
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
                    baseItem?.columns.find((c) => c.type === "description")?.id
                  }
                  amountColId={
                    baseItem?.columns.find((c) => c.type === "amount")?.id
                  }
                  overrides={activeOverrides}
                  baseAmounts={baseAmounts}
                  editableRowIds={editableRowIds}
                  readOnly={activeScenario === null}
                  settings={settings}
                  onCommitAmount={(rowId, amount) =>
                    patchOverride(rowId, { amount })
                  }
                  onCommitDescription={(rowId, description) =>
                    patchOverride(rowId, { description })
                  }
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

      {activeScenario && baseItem && (
        <ScenariosDiffModal
          open={diffOpen}
          scenarioName={activeScenario.name}
          entries={diffScenario(baseItem, activeScenario)}
          settings={settings}
          onClose={() => setDiffOpen(false)}
        />
      )}

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
