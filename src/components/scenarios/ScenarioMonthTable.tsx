import { Plus } from "lucide-react";

import type { Row, ScenarioRowOverride, Settings } from "../../data/types";
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
  // Ids of base budget rows a scenario may override (persisted user
  // rows). Synthesized history / transfer rows and correction rows get
  // no affordances.
  editableRowIds: ReadonlySet<string>;
  // True on the Baseline tab — no editing affordances at all.
  readOnly: boolean;
  // Widest formatted amount / balance across the whole sheet, driving
  // the mobile grid's column widths (same ch-var scheme as the budget
  // table) so every month aligns on the same tracks.
  amountChars: number;
  balanceChars: number;
  settings: Settings;
  onCommitAmount: (rowId: string, amount: number) => void;
  onCommitDescription: (rowId: string, description: string) => void;
  onToggleExcluded: (rowId: string) => void;
  onRevert: (rowId: string) => void;
  onEditAddedRow: (addedId: string) => void;
  onAddRow: () => void;
};

// One fiscal month of the scenario's budget-like table: date /
// description / amount / running balance, with per-row affordances when
// a scenario is active — tap a description or amount to override it
// inline, exclude / re-include a row, revert an override, edit a
// scenario-added row. The mobile layout mirrors the budget table:
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
  editableRowIds,
  readOnly,
  amountChars,
  balanceChars,
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

  const monthNum = monthNumberFromKey(monthKey);
  const monthColor = monthNum !== null ? monthColorVar(monthNum) : undefined;

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
          {rows.map((row) => (
            <ScenarioRow
              key={row.id}
              row={row}
              dateColId={dateColId}
              descColId={descColId}
              amountColId={amountColId}
              balance={balances.get(row.id)}
              override={overrides.get(row.id)}
              baseAmount={baseAmounts.get(row.id)}
              editable={!readOnly && editableRowIds.has(row.id)}
              readOnly={readOnly}
              settings={settings}
              onCommitAmount={onCommitAmount}
              onCommitDescription={onCommitDescription}
              onToggleExcluded={onToggleExcluded}
              onRevert={onRevert}
              onEditAddedRow={onEditAddedRow}
            />
          ))}
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
