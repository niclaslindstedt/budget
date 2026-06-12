import { memo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Building2,
  CircleMinus,
  Pencil,
  Plus,
  Repeat,
  RotateCcw,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";

import {
  isScenarioAddedRowId,
  scenarioAddedIdFromRowId,
} from "../../data/scenarios/apply";
import type {
  Company,
  EntryType,
  Row,
  ScenarioRowOverride,
  Settings,
} from "../../data/types";
import { useAmountColumns } from "../../hooks";
import { plural, useLang, useT } from "../../i18n";
import { displayTypeName } from "../../i18n/preset-names";
import {
  formatDate,
  formatDayOnly,
  formatNumber,
  formatRunningBalance,
  parseAmount,
} from "../../utils/format";
import { monthColorVar, monthNumberFromKey } from "../../utils/monthColor";
import { CompanyPill, TypeBadge } from "../Pills";
import { useRowSwipeAndClaim } from "../useRowSwipeAndClaim";
import { formatModulation } from "./modulation";

type Props = {
  // Display row (already scenario-applied) plus the column ids to read
  // its cells through.
  row: Row;
  dateColId: string | undefined;
  descColId: string | undefined;
  amountColId: string | undefined;
  balance: number | undefined;
  // The active scenario's override for this row, if any.
  override: ScenarioRowOverride | undefined;
  // The base budget's amount — the applied clone has already rewritten
  // (or zeroed) the cell, so excluded rows read the original from here.
  baseAmount: number | undefined;
  // Resolved taxonomy refs (`row.typeId` / `row.companyId`), pre-looked
  // up by the month table. Drive the read-only type badge and the
  // budget-style description fallbacks (company pill, type-coloured
  // name).
  entryType: EntryType | null;
  company: Company | null;
  // True when this is a persisted user row a scenario may override.
  editable: boolean;
  // True when the row's amount can carry a live adjustment — editable
  // and not a formula row (a modulation of the static cell under a
  // formula would lie).
  canModulate: boolean;
  // True on the Baseline tab — no editing affordances at all.
  readOnly: boolean;
  // Hidden transfers folded behind this row's balance step (same
  // `Settings.hideTransfers` collapse as the budget table). When > 0
  // the balance number becomes the expand toggle.
  hiddenTransferCount: number;
  transferExpanded: boolean;
  onToggleTransferAnchor: () => void;
  // True when this row is itself a hidden transfer revealed inline
  // above its anchor — renders muted so it reads as "from behind the
  // collapse", mirroring the budget table.
  revealedTransfer: boolean;
  settings: Settings;
  onCommitAmount: (rowId: string, amount: number) => void;
  onModulate: (rowId: string) => void;
  onToggleExcluded: (rowId: string) => void;
  onRevert: (rowId: string) => void;
  onEditAddedRow: (addedId: string) => void;
};

// One row of a scenario month table: date / description / amount /
// running balance plus the per-row affordances when a scenario is
// active. Descriptions are read-only by design — a scenario changes
// what a row costs, not what it is called. Desktop keeps the inline
// action icons; mobile follows the budget table's pattern — the row is
// a CSS grid (see `.scenario-table` in components.css), the date
// column narrows to the day-of-month, and the actions live in a
// swipe-to-reveal strip (`useRowSwipeAndClaim` + `swipe-action-cell`,
// same as every other sheet row).
function ScenarioRowImpl({
  row,
  dateColId,
  descColId,
  amountColId,
  balance,
  override,
  baseAmount,
  entryType,
  company,
  editable,
  canModulate,
  readOnly,
  hiddenTransferCount,
  transferExpanded,
  onToggleTransferAnchor,
  revealedTransfer,
  settings,
  onCommitAmount,
  onModulate,
  onToggleExcluded,
  onRevert,
  onEditAddedRow,
}: Props) {
  const t = useT();
  const lang = useLang();
  const { cellClass: amountCellClass } = useAmountColumns();
  const [editingAmount, setEditingAmount] = useState(false);
  const [draft, setDraft] = useState("");

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

  const excluded = override?.excluded === true;
  const isAdded = isScenarioAddedRowId(row.id);
  const hasActions = !readOnly && (isAdded || editable);
  const { swiped, setSwiped, touchHandlers } = useRowSwipeAndClaim(row.id, {
    disabled: !hasActions,
  });
  const displayAmount = excluded ? (baseAmount ?? 0) : amountValue;

  // Budget-style description annotations: the recurring Repeat glyph,
  // the company pill / type-coloured name fallback when the row has no
  // user-authored description, the Building2 prefix when it has both a
  // description and a company, and the transfer arrow + peer name on
  // synthesized transfer rows. Mirrors `DescriptionCell` so the
  // scenario table reads like the budget table it models.
  const isRecurring = !!row.seriesId;
  const isTransfer = row.kind === "transfer";
  const isFallback =
    row.kind === "historic" && row.descriptionPlaceholder !== undefined;
  const hasDesc = descValue.length > 0 && !isFallback;
  const showCompanyPill = !isTransfer && !hasDesc && !!company;
  const showTypeName = !isTransfer && !hasDesc && !company && !!entryType;
  const showCompanyGlyph = !isTransfer && hasDesc && !!company;

  const descriptionContent = excluded ? (
    // Struck-through rows keep their display name: the description,
    // else the same company / type-name fallback the live rows render
    // — otherwise an excluded company- or type-labelled row goes
    // blank.
    <span className="min-w-0 truncate text-muted line-through">
      {hasDesc
        ? descValue
        : (company?.name ??
          (entryType ? displayTypeName(entryType, t) : descValue))}
    </span>
  ) : showCompanyPill ? (
    <CompanyPill name={company!.name} recurring={isRecurring} />
  ) : showTypeName ? (
    <span
      className="min-w-0 truncate"
      style={{ color: entryType!.color }}
      title={displayTypeName(entryType!, t)}
    >
      {displayTypeName(entryType!, t)}
    </span>
  ) : (
    <>
      {showCompanyGlyph && (
        <Building2
          size={12}
          aria-hidden
          focusable={false}
          className="shrink-0"
        />
      )}
      <span className="min-w-0 truncate">{descValue}</span>
    </>
  );

  const monthNum = dateValue !== "" ? monthNumberFromKey(dateValue) : null;
  const monthColor = monthNum !== null ? monthColorVar(monthNum) : undefined;

  function beginEditAmount(value: string) {
    setEditingAmount(true);
    setDraft(value);
  }

  function commitEdit() {
    if (!editingAmount) return;
    const parsed = parseAmount(draft);
    if (parsed !== null) onCommitAmount(row.id, parsed);
    setEditingAmount(false);
  }

  const actionButton = (
    label: string,
    toneClass: string,
    hoverClass: string,
    onClick: () => void,
    icon: React.ReactNode,
  ) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        setSwiped(false);
        onClick();
      }}
      className={`action-btn ${toneClass} inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:h-auto md:flex-none md:rounded md:p-1 md:text-muted md:hover:bg-surface-2 ${hoverClass}`}
    >
      {icon}
    </button>
  );

  // One tint per delta state so a scenario's changes read at a glance:
  // green for rows the scenario added, red for excluded rows, accent
  // for overridden amounts / descriptions. Revealed hidden transfers
  // reuse the budget table's muted treatment. Classes live next to the
  // `.scenario-table` rules in components.css.
  const stateClass = revealedTransfer
    ? "is-revealed-transfer"
    : isAdded
      ? "scenario-row-added"
      : excluded
        ? "scenario-row-excluded"
        : override !== undefined
          ? "scenario-row-overridden"
          : "";

  return (
    <tr
      className={`border-b border-line last:border-b-0 ${
        swiped ? "is-swiped" : ""
      } ${stateClass}`}
      data-row-id={row.id}
      data-swipe-handled
      onClick={() => {
        if (swiped) setSwiped(false);
      }}
      {...touchHandlers}
    >
      <td className="w-px px-1 py-1.5 text-center align-middle whitespace-nowrap md:pr-2 md:pl-3 md:text-left">
        <span
          className="font-mono text-xs text-muted tabular-nums"
          style={monthColor ? { color: monthColor } : undefined}
        >
          <span className="md:hidden">
            {dateValue === "" ? "" : formatDayOnly(dateValue)}
          </span>
          <span className="hidden md:inline">
            {dateValue === ""
              ? ""
              : formatDate(dateValue, settings.dateFormat, lang)}
          </span>
        </span>
      </td>
      <td className="min-w-0 px-2 py-1.5 align-middle">
        <span className="flex min-w-0 items-center gap-1.5">
          {isAdded && (
            <Plus
              size={12}
              className="shrink-0 text-positive"
              aria-hidden
              focusable={false}
            />
          )}
          {isRecurring && !excluded && !showCompanyPill && (
            <Repeat
              size={14}
              className="shrink-0 text-flag"
              aria-hidden
              focusable={false}
            />
          )}
          {isTransfer && !excluded && (
            <>
              {typeof amountValue === "number" && amountValue < 0 ? (
                <ArrowRight
                  size={12}
                  aria-hidden
                  focusable={false}
                  className="shrink-0 text-flag"
                />
              ) : (
                <ArrowLeftRight
                  size={12}
                  aria-hidden
                  focusable={false}
                  className="shrink-0 text-flag"
                />
              )}
              <span className="shrink-0 truncate text-muted">
                {row.peerAccountName || "—"}
              </span>
              {descValue && <span className="text-muted">·</span>}
            </>
          )}
          <span
            className={`flex min-w-0 items-center gap-1 ${
              excluded ? "text-muted" : isRecurring ? "text-flag" : "text-fg"
            }`}
          >
            {descriptionContent}
          </span>
        </span>
      </td>
      <td
        className="w-px px-1 py-1.5 text-center align-middle whitespace-nowrap md:px-2"
        aria-readonly="true"
      >
        <span
          className={`flex items-center justify-center font-mono text-xs md:justify-start ${
            excluded ? "opacity-50" : ""
          }`}
        >
          <TypeBadge entryType={entryType} />
        </span>
      </td>
      <td
        className={`w-px px-2 py-1.5 ${amountCellClass} align-middle whitespace-nowrap`}
      >
        {editingAmount ? (
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
              if (e.key === "Escape") setEditingAmount(false);
            }}
            className="field-input w-full min-w-0 rounded border border-accent bg-surface-2 px-1 py-0.5 text-right font-mono text-sm text-fg md:w-24"
            aria-label={t("scenarios.editAmountAria", { name: descValue })}
          />
        ) : editable && !excluded ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (swiped) {
                setSwiped(false);
                return;
              }
              beginEditAmount(
                displayAmount === null ? "" : String(displayAmount),
              );
            }}
            aria-label={t("scenarios.editAmountAria", { name: descValue })}
            className={`cursor-text border-0 bg-transparent p-0 text-right font-mono text-sm tabular-nums ${
              override?.amount !== undefined ||
              override?.modulation !== undefined
                ? "text-accent"
                : displayAmount !== null && displayAmount < 0
                  ? "text-negative"
                  : "text-positive"
            }`}
          >
            {override?.modulation !== undefined && (
              <span className="mr-1.5 text-xs text-meta">
                {formatModulation(override.modulation, settings)}
              </span>
            )}
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
      <td
        className={`w-px px-2 py-1.5 ${amountCellClass} align-middle whitespace-nowrap`}
      >
        {balance !== undefined && hiddenTransferCount > 0 ? (
          // Hidden transfers contributed to this balance step — the
          // number itself becomes the expand toggle, italic with a
          // dotted underline, mirroring the budget table's BalanceCell.
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleTransferAnchor();
            }}
            aria-label={plural(
              t,
              "budget.hiddenTransferOne",
              "budget.hiddenTransferOther",
              hiddenTransferCount,
            )}
            title={
              transferExpanded
                ? t("budget.collapseHiddenTransfers")
                : t("budget.expandHiddenTransfers")
            }
            aria-expanded={transferExpanded}
            className={`cursor-pointer border-0 bg-transparent p-0 text-right font-mono text-xs tabular-nums italic underline decoration-dotted underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
              balance < 0 ? "text-negative" : "text-muted"
            }`}
          >
            {formatRunningBalance(balance, settings)}
          </button>
        ) : (
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
        )}
      </td>
      {!readOnly && (
        <td
          // `w-32` mirrors the default `--swipe-strip-width: 128px` —
          // the width utility must match the strip width or it wins
          // the cascade and shrinks the revealed overlay (same scheme
          // as ItemRow).
          className="swipe-action-cell w-32 p-0 align-middle whitespace-nowrap md:py-1.5 md:pr-2 md:pl-1"
        >
          <span className="flex h-full w-full items-stretch justify-end gap-0.5 md:items-center">
            {isAdded
              ? actionButton(
                  t("scenarios.editAddedRow"),
                  "action-btn-pen",
                  "md:hover:text-accent",
                  () => {
                    const addedId = scenarioAddedIdFromRowId(row.id);
                    if (addedId !== undefined) onEditAddedRow(addedId);
                  },
                  <Pencil size={14} aria-hidden focusable={false} />,
                )
              : editable && (
                  <>
                    {override !== undefined &&
                      !excluded &&
                      actionButton(
                        t("scenarios.revertOverride", { name: descValue }),
                        "action-btn-more",
                        "md:hover:text-accent",
                        () => onRevert(row.id),
                        <RotateCcw size={14} aria-hidden focusable={false} />,
                      )}
                    {canModulate &&
                      !excluded &&
                      actionButton(
                        t("scenarios.modulateRow", { name: descValue }),
                        "action-btn-pen",
                        "md:hover:text-accent",
                        () => onModulate(row.id),
                        <SlidersHorizontal
                          size={14}
                          aria-hidden
                          focusable={false}
                        />,
                      )}
                    {excluded
                      ? actionButton(
                          t("scenarios.includeRow", { name: descValue }),
                          "action-btn-restore",
                          "md:hover:text-positive",
                          () => onToggleExcluded(row.id),
                          <Undo2 size={14} aria-hidden focusable={false} />,
                        )
                      : actionButton(
                          t("scenarios.excludeRow", { name: descValue }),
                          "action-btn-delete",
                          "md:hover:text-danger",
                          () => onToggleExcluded(row.id),
                          <CircleMinus
                            size={14}
                            aria-hidden
                            focusable={false}
                          />,
                        )}
                  </>
                )}
          </span>
        </td>
      )}
    </tr>
  );
}

// Memoised so a swipe / inline edit on one row doesn't re-render every
// sibling — matches the other sheet rows.
export const ScenarioRow = memo(ScenarioRowImpl);
