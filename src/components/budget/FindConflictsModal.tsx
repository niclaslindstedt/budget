import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Combine } from "lucide-react";

import {
  CONFLICT_DEFAULT_MIN_AMOUNT,
  findConflicts,
  type Conflict,
} from "../../data/conflicts";
import {
  firstNonBlank,
  readNumberCell,
  readStringCell,
} from "../../data/budget/cells";
import { findColumnByType } from "../../data/sheet";
import { useLang, useT } from "../../i18n";
import { displayCategoryName } from "../../i18n/preset-names";
import type {
  Category,
  Column,
  EntryType,
  Row,
  Settings,
} from "../../data/types";
import { formatBalance, formatShortDate } from "../../utils/format";
import { Button } from "../form";
import { EntityChip } from "../EntityChip";
import { Modal } from "../Modal";
import { TypeChip } from "../TypePicker";

// Entry-override stamp emitted when the winner is a history-backed
// row. Mirrors `ReconciliationApply.entryOverrides[]` so AppShell can
// route the merge through `applyReconciliation` directly.
export type ConflictHistoryStamp = {
  historyEntryId: string;
  userDescription?: string;
  userTypeId?: string;
};

// Patch emitted when the winner is a user-authored row. The caller
// dispatches one `bulkUpdate` for `typeId`, one `updateCell` for
// `description` (when set), then `deleteRows` for the losers.
export type ConflictUserRowPatch = {
  typeId?: string;
  description?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  // Rows to scan — should be the formula-resolved visible rows
  // (history + transfers + user rows) so duplicates spanning the
  // import boundary surface. BudgetPage builds this from
  // `buildVisibleRows(decoratedItem, …)`.
  rows: readonly Row[];
  columns: readonly Column[];
  types: readonly EntryType[];
  categories: readonly Category[];
  settings: Settings;
  // Account id of the active `AccountBudget`. Required when the
  // winner is a history row — the reducer needs the account to find
  // the entry. `null` is allowed (unlinked budget) and disables the
  // history-merge path; user-row merges still work.
  accountId: string | null;
  // Description column id on the active item, threaded so the user-
  // row patch can target the right cell via `updateCell`. May be
  // `null` if the budget has no description column (unusual).
  descriptionColumnId: string | null;
  // Fires when the winner is a history row. AppShell routes to
  // `applyReconciliation` with empty `orphans` / `seriesRules`.
  onMergeIntoHistory: (
    accountId: string,
    mergedRowIds: string[],
    overrides: ConflictHistoryStamp[],
  ) => void;
  // Fires when the winner is a user-authored row. AppShell patches
  // the winner's blank fields then deletes the losers.
  onMergeUserRows: (
    winnerId: string,
    loserIds: string[],
    patch: ConflictUserRowPatch,
  ) => void;
};

// Step the min-amount through these presets — keeps the control
// tap-friendly on mobile and avoids opening a soft keyboard (which
// would break the `centered` Modal layout). Picked to span the range
// users typically care about: noise-floor at 100, the
// reconciliation tolerance floor near 200, and three larger buckets
// for ledgers full of mid-size bills.
const THRESHOLD_PRESETS: ReadonlyArray<number> = [50, 100, 200, 500, 1000];

export function FindConflictsModal({
  open,
  onClose,
  rows,
  columns,
  types,
  categories,
  settings,
  accountId,
  descriptionColumnId,
  onMergeIntoHistory,
  onMergeUserRows,
}: Props) {
  const t = useT();
  const lang = useLang();
  const [minAmount, setMinAmount] = useState<number>(
    CONFLICT_DEFAULT_MIN_AMOUNT,
  );

  const conflicts = useMemo(
    () => findConflicts(rows, { types, columns, minAmount }),
    [rows, types, columns, minAmount],
  );

  const amountColId = useMemo(
    () => findColumnByType(columns, "amount")?.id ?? null,
    [columns],
  );

  const typesById = useMemo(() => {
    const m = new Map<string, EntryType>();
    for (const ty of types) m.set(ty.id, ty);
    return m;
  }, [types]);

  const categoriesById = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const handleMerge = useCallback(
    (conflict: Conflict) => {
      const winner = conflict.rows.find((r) => r.id === conflict.winnerId);
      if (!winner) return;
      const losers = conflict.rows.filter((r) => r.id !== conflict.winnerId);
      if (losers.length === 0) return;
      if (typeof winner.historyEntryId === "string") {
        if (!accountId) return;
        const stamp: ConflictHistoryStamp = {
          historyEntryId: winner.historyEntryId,
        };
        const desc = firstNonBlank(
          losers.map((l) => readStringCell(l, descriptionColumnId)),
        );
        if (desc) stamp.userDescription = desc;
        const typeId = firstNonBlank(losers.map((l) => l.typeId));
        if (typeId) stamp.userTypeId = typeId;
        onMergeIntoHistory(
          accountId,
          losers.map((l) => l.id),
          [stamp],
        );
        return;
      }
      // User-row winner — patch its blank fields from the losers.
      const patch: ConflictUserRowPatch = {};
      if (!winner.typeId) {
        const typeId = firstNonBlank(losers.map((l) => l.typeId));
        if (typeId) patch.typeId = typeId;
      }
      if (descriptionColumnId) {
        const winnerDesc = readStringCell(winner, descriptionColumnId);
        if (winnerDesc === "") {
          const desc = firstNonBlank(
            losers.map((l) => readStringCell(l, descriptionColumnId)),
          );
          if (desc) patch.description = desc;
        }
      }
      onMergeUserRows(
        winner.id,
        losers.map((l) => l.id),
        patch,
      );
    },
    [accountId, descriptionColumnId, onMergeIntoHistory, onMergeUserRows],
  );

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="find-conflicts-title"
      size="max-w-2xl"
      centered
    >
      <Modal.Header
        icon={<AlertTriangle size={14} aria-hidden focusable={false} />}
        title={t("conflicts.title")}
        onClose={onClose}
      />
      <Modal.Body>
        <p className="mb-3 text-sm text-muted">{t("conflicts.intro")}</p>

        <fieldset className="mb-4 flex flex-wrap items-center gap-2 rounded border border-line bg-surface-3 p-3">
          <legend className="px-1 text-xs text-muted">
            {t("conflicts.minAmountLabel")}
          </legend>
          {THRESHOLD_PRESETS.map((preset) => {
            const active = preset === minAmount;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => setMinAmount(preset)}
                aria-pressed={active}
                className={
                  active
                    ? "cursor-pointer rounded border border-accent bg-accent/15 px-3 py-1 text-sm font-bold text-fg-bright"
                    : "cursor-pointer rounded border border-line bg-surface-2 px-3 py-1 text-sm text-fg hover:border-fg"
                }
              >
                {formatBalance(preset, settings)}
              </button>
            );
          })}
        </fieldset>

        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-xs font-bold tracking-wider uppercase text-muted">
            {conflicts.length === 1
              ? t("conflicts.countOne", { n: conflicts.length })
              : t("conflicts.countOther", { n: conflicts.length })}
          </h3>
        </div>

        {conflicts.length === 0 ? (
          <div className="rounded border border-line bg-surface-2 px-3 py-6 text-center">
            <p className="text-sm text-fg">{t("conflicts.empty")}</p>
            <p className="mt-1 text-xs text-muted">
              {t("conflicts.emptyHint")}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {conflicts.map((conflict) => (
              <ConflictCard
                key={conflict.id}
                conflict={conflict}
                amountColId={amountColId}
                descriptionColumnId={descriptionColumnId}
                typesById={typesById}
                categoriesById={categoriesById}
                settings={settings}
                lang={lang}
                onMerge={handleMerge}
                t={t}
              />
            ))}
          </ul>
        )}

        <p className="mt-4 text-xs text-muted">
          {t("conflicts.foodExcludedHint")}
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onClose}>
          {t("common.close")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

type CardProps = {
  conflict: Conflict;
  amountColId: string | null;
  descriptionColumnId: string | null;
  typesById: Map<string, EntryType>;
  categoriesById: Map<string, Category>;
  settings: Settings;
  lang: ReturnType<typeof useLang>;
  onMerge: (conflict: Conflict) => void;
  t: ReturnType<typeof useT>;
};

function ConflictCard({
  conflict,
  amountColId,
  descriptionColumnId,
  typesById,
  categoriesById,
  settings,
  lang,
  onMerge,
  t,
}: CardProps) {
  const category = conflict.categoryId
    ? (categoriesById.get(conflict.categoryId) ?? null)
    : null;
  return (
    <li className="rounded border border-line bg-surface-2">
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-3 px-3 py-2">
        <span className="font-mono text-xs text-muted">
          {formatShortDate(conflict.date, settings.shortDateFormat, lang)}
        </span>
        {category ? (
          <EntityChip
            name={displayCategoryName(category, t)}
            color={category.color}
            icon={category.icon}
            compact
          />
        ) : (
          <span className="text-xs text-muted">
            {t("conflicts.uncategorizedLabel")}
          </span>
        )}
        <span className="ml-auto text-xs text-muted">
          {conflict.rows.length === 1
            ? t("conflicts.countOne", { n: conflict.rows.length })
            : t("conflicts.countOther", { n: conflict.rows.length })}
        </span>
      </header>

      <ul className="divide-y divide-line">
        {conflict.rows.map((row) => {
          const isWinner = row.id === conflict.winnerId;
          const fromHistory = typeof row.historyEntryId === "string";
          const ty =
            typeof row.typeId === "string"
              ? (typesById.get(row.typeId) ?? null)
              : null;
          const amount = readNumberCell(row, amountColId);
          const description = descriptionColumnId
            ? (row.cells[descriptionColumnId] ?? "")
            : "";
          const descText = typeof description === "string" ? description : "";
          return (
            <li
              key={row.id}
              className={`flex flex-wrap items-baseline gap-2 px-3 py-2 ${
                isWinner ? "bg-surface-3" : ""
              }`}
            >
              <span className="flex shrink-0 items-center gap-1">
                {isWinner && (
                  <span className="rounded bg-accent/20 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider text-accent">
                    {t("conflicts.winnerBadge")}
                  </span>
                )}
                {fromHistory && (
                  <span className="rounded bg-flag/20 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider text-flag">
                    {t("conflicts.historyBadge")}
                  </span>
                )}
              </span>
              {ty ? (
                <TypeChip type={ty} compact />
              ) : (
                <span className="text-xs text-muted">
                  {t("conflicts.untypedLabel")}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-fg">
                {descText || "—"}
              </span>
              {amount !== null && (
                <span
                  className={`shrink-0 font-mono tabular-nums text-sm ${
                    amount < 0 ? "text-negative" : "text-positive"
                  }`}
                >
                  {formatBalance(amount, settings)}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <footer className="flex items-center justify-end border-t border-line bg-surface-3 px-3 py-2">
        <Button
          variant="primary"
          onClick={() => onMerge(conflict)}
          aria-label={t("conflicts.mergeAria", { n: conflict.rows.length })}
        >
          <span className="inline-flex items-center gap-1">
            <Combine size={14} aria-hidden focusable={false} />
            {t("conflicts.merge")}
          </span>
        </Button>
      </footer>
    </li>
  );
}
