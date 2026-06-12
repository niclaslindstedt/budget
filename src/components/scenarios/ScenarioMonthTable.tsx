import { useState } from "react";
import { CircleMinus, Pencil, Plus, RotateCcw, Undo2 } from "lucide-react";

import {
  isScenarioAddedRowId,
  scenarioAddedIdFromRowId,
} from "../../data/scenarios/apply";
import type { Row, ScenarioRowOverride, Settings } from "../../data/types";
import { useLang, useT } from "../../i18n";
import {
  formatDate,
  formatMonthKey,
  formatNumber,
  formatRunningBalance,
  parseAmount,
} from "../../utils/format";
import { monthColorVar, monthNumberFromKey } from "../../utils/monthColor";

type Props = {
  monthKey: string;
  // Display-ordered rows for this month (already scenario-applied).
  rows: readonly Row[];
  balances: ReadonlyMap<string, number>;
  dateColId: string | undefined;
  descColId: string | undefined;
  amountColId: string | undefined;
  // The active scenario's overrides keyed by base row id; empty on the
  // Baseline tab.
  overrides: ReadonlyMap<string, ScenarioRowOverride>;
  // Base amounts for overridden / excluded rows — the applied clone has
  // already rewritten (or zeroed) the cell, so the strikethrough /
  // tooltip rendering reads the original from here.
  baseAmounts: ReadonlyMap<string, number>;
  // Ids of base budget rows a scenario may override (persisted user
  // rows). Synthesized history / transfer rows and correction rows get
  // no affordances.
  editableRowIds: ReadonlySet<string>;
  // True on the Baseline tab — no editing affordances at all.
  readOnly: boolean;
  settings: Settings;
  onCommitAmount: (rowId: string, amount: number) => void;
  onCommitDescription: (rowId: string, description: string) => void;
  onToggleExcluded: (rowId: string) => void;
  onRevert: (rowId: string) => void;
  onEditAddedRow: (addedId: string) => void;
  onAddRow: () => void;
};

type EditingCell = { rowId: string; field: "amount" | "description" };

// One fiscal month of the scenario's budget-like table: date /
// description / amount / running balance, with per-row affordances when
// a scenario is active — tap a description or amount to override it
// inline, exclude / re-include a row, revert an override, edit a
// scenario-added row. Modeled on the read-only BudgetViewerModal table
// rather than BudgetMonthTable, which drags in selection / column-drag
// / recurrence wiring scenarios don't want.
export function ScenarioMonthTable({
  monthKey,
  rows,
  balances,
  dateColId,
  descColId,
  amountColId,
  overrides,
  baseAmounts,
  editableRowIds,
  readOnly,
  settings,
  onCommitAmount,
  onCommitDescription,
  onToggleExcluded,
  onRevert,
  onEditAddedRow,
  onAddRow,
}: Props) {
  const t = useT();
  const lang = useLang();
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [draft, setDraft] = useState("");

  const monthNum = monthNumberFromKey(monthKey);
  const monthColor = monthNum !== null ? monthColorVar(monthNum) : undefined;

  function beginEdit(
    rowId: string,
    field: EditingCell["field"],
    value: string,
  ) {
    setEditing({ rowId, field });
    setDraft(value);
  }

  function commitEdit() {
    if (editing === null) return;
    if (editing.field === "amount") {
      const parsed = parseAmount(draft);
      if (parsed !== null) onCommitAmount(editing.rowId, parsed);
    } else {
      const trimmed = draft.trim();
      if (trimmed !== "") onCommitDescription(editing.rowId, trimmed);
    }
    setEditing(null);
  }

  return (
    <section className="overflow-clip rounded border border-line bg-surface">
      <header
        className="border-b border-line bg-surface-2 px-3 py-1.5 text-xs font-bold tracking-wider uppercase"
        style={monthColor ? { color: monthColor } : undefined}
      >
        {formatMonthKey(monthKey, lang, t("budget.undated"))}
      </header>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map((row) => {
            const dateValue =
              dateColId && typeof row.cells[dateColId] === "string"
                ? (row.cells[dateColId] as string)
                : "";
            const descValue =
              descColId && typeof row.cells[descColId] === "string"
                ? (row.cells[descColId] as string)
                : "";
            const amountValue =
              amountColId && typeof row.cells[amountColId] === "number"
                ? (row.cells[amountColId] as number)
                : null;
            const balance = balances.get(row.id);
            const override = overrides.get(row.id);
            const excluded = override?.excluded === true;
            const isAdded = isScenarioAddedRowId(row.id);
            const editable =
              !readOnly && !isAdded && editableRowIds.has(row.id);
            const amountEditing =
              editing?.rowId === row.id && editing.field === "amount";
            const descEditing =
              editing?.rowId === row.id && editing.field === "description";
            const displayAmount = excluded
              ? (baseAmounts.get(row.id) ?? 0)
              : amountValue;

            return (
              <tr
                key={row.id}
                className={`border-b border-line last:border-b-0 ${
                  isAdded ? "bg-surface-2/50" : ""
                }`}
              >
                <td className="w-px py-1.5 pr-2 pl-3 align-middle whitespace-nowrap">
                  <span className="font-mono text-xs text-muted">
                    {dateValue === ""
                      ? ""
                      : formatDate(dateValue, settings.dateFormat, lang)}
                  </span>
                </td>
                <td className="min-w-0 px-2 py-1.5 align-middle">
                  {descEditing ? (
                    <input
                      // Inline override editor opened by an explicit tap on the cell —
                      // focusing it IS the expected outcome (same pattern as the admin
                      // rename editors).
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      type="text"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className="field-input w-full min-w-0 rounded border border-accent bg-surface-2 px-1 py-0.5 text-sm text-fg"
                      aria-label={t("scenarios.editDescriptionAria", {
                        name: descValue,
                      })}
                    />
                  ) : (
                    <span className="flex min-w-0 items-center gap-1.5">
                      {isAdded && (
                        <Plus
                          size={12}
                          className="shrink-0 text-positive"
                          aria-hidden
                          focusable={false}
                        />
                      )}
                      {editable && !excluded ? (
                        <button
                          type="button"
                          onClick={() =>
                            beginEdit(row.id, "description", descValue)
                          }
                          aria-label={t("scenarios.editDescriptionAria", {
                            name: descValue,
                          })}
                          className={`min-w-0 cursor-text truncate border-0 bg-transparent p-0 text-left text-sm ${
                            override?.description !== undefined
                              ? "text-accent"
                              : "text-fg"
                          }`}
                        >
                          {descValue}
                        </button>
                      ) : (
                        <span
                          className={`min-w-0 truncate ${
                            excluded ? "text-muted line-through" : "text-fg"
                          }`}
                        >
                          {descValue}
                        </span>
                      )}
                    </span>
                  )}
                </td>
                <td className="w-px px-2 py-1.5 text-right align-middle whitespace-nowrap">
                  {amountEditing ? (
                    <input
                      // Inline override editor opened by an explicit tap on the cell —
                      // focusing it IS the expected outcome (same pattern as the admin
                      // rename editors).
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      type="text"
                      inputMode="decimal"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className="field-input w-24 rounded border border-accent bg-surface-2 px-1 py-0.5 text-right font-mono text-sm text-fg"
                      aria-label={t("scenarios.editAmountAria", {
                        name: descValue,
                      })}
                    />
                  ) : editable && !excluded ? (
                    <button
                      type="button"
                      onClick={() =>
                        beginEdit(
                          row.id,
                          "amount",
                          displayAmount === null ? "" : String(displayAmount),
                        )
                      }
                      aria-label={t("scenarios.editAmountAria", {
                        name: descValue,
                      })}
                      className={`cursor-text border-0 bg-transparent p-0 text-right font-mono text-sm tabular-nums ${
                        override?.amount !== undefined
                          ? "text-accent"
                          : displayAmount !== null && displayAmount < 0
                            ? "text-negative"
                            : "text-positive"
                      }`}
                    >
                      {displayAmount === null
                        ? ""
                        : formatNumber(displayAmount, settings)}
                    </button>
                  ) : (
                    <span
                      className={`font-mono tabular-nums ${
                        excluded
                          ? "text-muted line-through"
                          : displayAmount !== null && displayAmount < 0
                            ? "text-negative"
                            : "text-positive"
                      }`}
                    >
                      {displayAmount === null
                        ? ""
                        : formatNumber(displayAmount, settings)}
                    </span>
                  )}
                </td>
                <td className="w-px px-2 py-1.5 text-right align-middle whitespace-nowrap">
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      balance !== undefined && balance < 0
                        ? "text-negative"
                        : "text-muted"
                    }`}
                  >
                    {balance !== undefined
                      ? formatRunningBalance(balance, settings)
                      : ""}
                  </span>
                </td>
                {!readOnly && (
                  <td className="w-px py-1.5 pr-2 pl-1 align-middle whitespace-nowrap">
                    <span className="flex items-center justify-end gap-0.5">
                      {isAdded ? (
                        <IconButton
                          label={t("scenarios.editAddedRow")}
                          onClick={() => {
                            const addedId = scenarioAddedIdFromRowId(row.id);
                            if (addedId !== undefined) onEditAddedRow(addedId);
                          }}
                        >
                          <Pencil size={14} aria-hidden focusable={false} />
                        </IconButton>
                      ) : editable ? (
                        <>
                          {override !== undefined && !excluded && (
                            <IconButton
                              label={t("scenarios.revertOverride", {
                                name: descValue,
                              })}
                              onClick={() => onRevert(row.id)}
                            >
                              <RotateCcw
                                size={14}
                                aria-hidden
                                focusable={false}
                              />
                            </IconButton>
                          )}
                          {excluded ? (
                            <IconButton
                              label={t("scenarios.includeRow", {
                                name: descValue,
                              })}
                              tone="positive"
                              onClick={() => onToggleExcluded(row.id)}
                            >
                              <Undo2 size={14} aria-hidden focusable={false} />
                            </IconButton>
                          ) : (
                            <IconButton
                              label={t("scenarios.excludeRow", {
                                name: descValue,
                              })}
                              tone="danger"
                              onClick={() => onToggleExcluded(row.id)}
                            >
                              <CircleMinus
                                size={14}
                                aria-hidden
                                focusable={false}
                              />
                            </IconButton>
                          )}
                        </>
                      ) : null}
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!readOnly && (
        <button
          type="button"
          onClick={onAddRow}
          className="group flex w-full cursor-pointer items-center gap-2 border-0 border-t border-line bg-transparent px-3 py-1.5 text-xs text-muted hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          <Plus size={12} aria-hidden focusable={false} />
          {t("scenarios.addRow")}
        </button>
      )}
    </section>
  );
}

function IconButton({
  label,
  tone,
  onClick,
  children,
}: {
  label: string;
  tone?: "danger" | "positive";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const hover =
    tone === "danger"
      ? "hover:text-danger"
      : tone === "positive"
        ? "hover:text-positive"
        : "hover:text-accent";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex cursor-pointer items-center rounded border-0 bg-transparent p-1 text-muted ${hover} focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`}
    >
      {children}
    </button>
  );
}
