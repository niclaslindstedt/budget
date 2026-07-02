import { Fragment, useMemo } from "react";
import { Plus } from "lucide-react";

import {
  collectHiddenTransfersByAnchor,
  isTransferRow,
} from "../../data/synthesis";
import type {
  Company,
  EntryType,
  Row,
  ScenarioRowOverride,
  Settings,
} from "../../data/types";
import { useLang, useT } from "../../i18n";
import { formatMonthKey } from "../../utils/format";
import { monthColorVar, monthNumberFromKey } from "../../utils/monthColor";
import { ScenarioRow } from "./ScenarioRow";

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
  // Taxonomy lookups so each row can render its type badge and the
  // budget-style description fallbacks (company pill, type-coloured
  // name).
  typesById: ReadonlyMap<string, EntryType>;
  companiesById: ReadonlyMap<string, Company>;
  // Anchor rows whose hidden-transfer run is expanded inline — same
  // `Settings.hideTransfers` collapse the budget table does. Owned by
  // the page so the reveal survives a month re-render.
  expandedTransferAnchors: ReadonlySet<string>;
  onToggleTransferAnchor: (rowId: string) => void;
  // Ids of base budget rows a scenario may override (persisted user
  // rows). Synthesized history / transfer rows and correction rows get
  // no affordances.
  editableRowIds: ReadonlySet<string>;
  // Base rows whose amount is formula-driven — live adjustments are
  // hidden for these (the static cell under a formula is not the
  // row's real amount).
  formulaRowIds: ReadonlySet<string>;
  // True on the Baseline tab — no editing affordances at all.
  readOnly: boolean;
  // Widest formatted amount / balance across the whole sheet, driving
  // the mobile grid's column widths (same ch-var scheme as the budget
  // table) so every month aligns on the same tracks.
  amountChars: number;
  balanceChars: number;
  settings: Settings;
  onCommitAmount: (rowId: string, amount: number) => void;
  onModulate: (rowId: string) => void;
  onToggleExcluded: (rowId: string) => void;
  onRevert: (rowId: string) => void;
  onEditAddedRow: (addedId: string) => void;
  onAddRow: () => void;
};

// One fiscal month of the scenario's budget-like table: date /
// description / amount / running balance, with per-row affordances when
// a scenario is active — tap an amount to override it inline, attach a
// live adjustment (+5000 / ×2) from the action strip, exclude /
// re-include a row, revert an override, edit a scenario-added row.
// Descriptions are read-only. The mobile layout mirrors the budget
// table:
// block + per-row grid (`.scenario-table` in components.css), day-only
// dates, ch-var-sized amount / balance columns, and a swipe-to-reveal
// action strip.
export function ScenarioMonthTable({
  monthKey,
  rows,
  balances,
  dateColId,
  descColId,
  amountColId,
  overrides,
  baseAmounts,
  typesById,
  companiesById,
  expandedTransferAnchors,
  onToggleTransferAnchor,
  editableRowIds,
  formulaRowIds,
  readOnly,
  amountChars,
  balanceChars,
  settings,
  onCommitAmount,
  onModulate,
  onToggleExcluded,
  onRevert,
  onEditAddedRow,
  onAddRow,
}: Props) {
  const t = useT();
  const lang = useLang();

  const monthNum = monthNumberFromKey(monthKey);
  const monthColor = monthNum !== null ? monthColorVar(monthNum) : undefined;

  // Same transfer collapse as the budget table: with
  // `Settings.hideTransfers` on, runs of hidden transfer rows group
  // under the next visible anchor row, whose balance cell becomes the
  // expand toggle.
  const hideTransfers = settings.hideTransfers;
  const hiddenBefore = useMemo(
    () => collectHiddenTransfersByAnchor(rows, hideTransfers),
    [rows, hideTransfers],
  );

  const renderRow = (
    row: Row,
    extra?: { hiddenRun?: readonly Row[]; revealedTransfer?: boolean },
  ) => (
    <ScenarioRow
      key={row.id}
      row={row}
      dateColId={dateColId}
      descColId={descColId}
      amountColId={amountColId}
      balance={balances.get(row.id)}
      override={overrides.get(row.id)}
      baseAmount={baseAmounts.get(row.id)}
      entryType={row.typeId ? (typesById.get(row.typeId) ?? null) : null}
      company={
        row.companyId ? (companiesById.get(row.companyId) ?? null) : null
      }
      editable={!readOnly && editableRowIds.has(row.id)}
      canModulate={
        !readOnly && editableRowIds.has(row.id) && !formulaRowIds.has(row.id)
      }
      readOnly={readOnly}
      hiddenTransferCount={extra?.hiddenRun?.length ?? 0}
      transferExpanded={expandedTransferAnchors.has(row.id)}
      onToggleTransferAnchor={() => onToggleTransferAnchor(row.id)}
      revealedTransfer={extra?.revealedTransfer ?? false}
      settings={settings}
      onCommitAmount={onCommitAmount}
      onModulate={onModulate}
      onToggleExcluded={onToggleExcluded}
      onRevert={onRevert}
      onEditAddedRow={onEditAddedRow}
    />
  );

  return (
    <section
      className="overflow-clip rounded border border-line bg-surface"
      style={
        {
          "--amount-col-ch": amountChars,
          "--balance-col-ch": balanceChars,
        } as React.CSSProperties
      }
    >
      <header
        className="border-b border-line bg-surface-2 px-3 py-1.5 text-xs font-bold tracking-wider uppercase"
        style={monthColor ? { color: monthColor } : undefined}
      >
        {formatMonthKey(monthKey, lang, t("budget.undated"))}
      </header>
      <table className="swipe-table scenario-table w-full border-collapse text-sm">
        <tbody>
          {rows.map((row) => {
            // Skip hidden transfers — they render inline above their
            // anchor when the anchor's expand toggle is on.
            if (
              hideTransfers &&
              row.kind !== "correction" &&
              isTransferRow(row)
            )
              return null;
            const hiddenRun = hiddenBefore.get(row.id);
            const expanded =
              hiddenRun !== undefined && expandedTransferAnchors.has(row.id);
            return (
              <Fragment key={row.id}>
                {expanded &&
                  hiddenRun.map((hidden) =>
                    renderRow(hidden, { revealedTransfer: true }),
                  )}
                {renderRow(row, { hiddenRun })}
              </Fragment>
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
