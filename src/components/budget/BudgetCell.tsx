import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  Minus,
  Plus,
  Repeat,
} from "lucide-react";

import type {
  Category,
  CellValue,
  Column,
  EntryType,
  Settings,
} from "../../data/types";
import {
  formatAmountForInput,
  formatNumber,
  normalizeAmountInput,
  parseAmount,
  withCurrency,
} from "../../utils/format";
import type { FloatingPlacement } from "../../hooks";
import { plural, useT } from "../../i18n";
import { displayTypeName } from "../../i18n/preset-names";
import { useClaimActiveRow } from "../useClaimActiveRow";
import { DatePickerModal } from "../DatePickerModal";
import { DismissBackdrop } from "../DismissBackdrop";
import { FloatingPanel } from "../FloatingPanel";
import { TypePicker } from "../TypePicker";
import { AmountCellDisplay } from "./cells/AmountCellDisplay";
import { CELL_BASE, INPUT_BASE } from "./cells/constants";
import { DateCellDisplay } from "./cells/DateCellDisplay";
import { CategoryIconGlyph } from "../icons";

type Props = {
  rowId: string;
  column: Column;
  value: CellValue;
  computedBalance?: number;
  settings: Settings;
  isRecurring?: boolean;
  // Resolved EntryType for `row.typeId`. Drives the dedicated `type`
  // column's picker / readonly chip, and — on recurring rows — the
  // description cell, which collapses down to a chip in the type's
  // color (a clearer at-a-glance identifier than the recurring-arrow
  // glyph) with the description tucked into a popover behind it.
  entryType?: EntryType | null;
  // Selectable entry types + categories, threaded through for the `type`
  // column's picker. Optional because synthesized / readonly variants
  // never reach the editable branch where they'd be consulted.
  types?: readonly EntryType[];
  categories?: readonly Category[];
  onCreateType?: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory?: (draft: Omit<Category, "id">) => Category;
  // True when this row is a synthesized side of a Transfer. Disables
  // every editor (the row is sourced from `data.transfers`, not the
  // budget's `item.rows`) and swaps the description leading glyph to a
  // transfer indicator. The `peerName` / `outgoing` props feed the
  // direction arrow and "→ Savings" prefix in the description cell.
  isTransfer?: boolean;
  peerName?: string;
  outgoing?: boolean;
  // True when this row is a synthesized projection of an imported
  // bank-statement entry. Disables every editor (the source data
  // lives in `data.history`, not the budget's rows) and renders the
  // description cell as plain readonly text — no transfer arrow,
  // no peer name. The action column hides edit/delete buttons too,
  // gated upstream in BudgetRow.
  isHistory?: boolean;
  // True when the row carries an `amountFormula`. The amount cell
  // becomes read-only (the value comes from the formula resolver) and
  // surfaces a small `fx` glyph so the user can tell at a glance that
  // the number isn't a literal entry. Editing the formula goes
  // through the ComplexEntryModal, not inline.
  hasFormula?: boolean;
  // Number of hidden transfer rows that immediately precede this row
  // in chronological order. Only meaningful on the `balance` column —
  // when > 0, the cell renders a small ↔ icon button that toggles
  // inline-expansion of those hidden rows via `onToggleTransferAnchor`.
  // 0 (the default) renders the balance text alone.
  hiddenTransferCount?: number;
  transferExpanded?: boolean;
  onToggleTransferAnchor?: () => void;
  // Sign of the row's amount, derived once by BudgetRow from the
  // amount cell. Only consulted by the `type` column's TypePicker
  // to filter income-only / expense-only types out of the list.
  amountSign?: "positive" | "negative" | "any";
  // Row context surfaced inside the `type` column's TypePicker
  // dropdown header — the dropdown physically overlaps the date and
  // description columns on mobile, so the picker re-displays them at
  // the top of the panel. Pre-formatted upstream by BudgetRow (date
  // through the user's short-date format, month-tint colour through
  // `monthColorVar`). Only the `type` column reads them; other
  // columns receive undefined and pass shallow-compare cleanly.
  rowDate?: string;
  rowDateColor?: string;
  rowDescription?: string;
  // Parent-level update / commit handlers. Carry rowId + columnId so
  // BudgetRow can pass the same reference-stable function to every cell
  // in the row — React.memo's shallow compare then skips re-rendering a
  // cell whose value didn't change. Cell wraps these into the
  // (value)-only closures its sub-components expect.
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  // Fires when the user finishes editing a cell (blur for the typed
  // inputs, the selection event for picker-style cells). Distinct from
  // `onUpdateCell`, which can fire on every keystroke. Lets the parent
  // know the edit has settled so it can prompt for series propagation.
  onCommitCell?: (rowId: string, columnId: string, value: CellValue) => void;
};

function CellImpl({
  rowId,
  column,
  value,
  computedBalance,
  settings,
  isRecurring,
  entryType,
  types,
  categories,
  onCreateType,
  onCreateCategory,
  isTransfer,
  peerName,
  outgoing,
  isHistory,
  hasFormula,
  hiddenTransferCount = 0,
  transferExpanded = false,
  onToggleTransferAnchor,
  amountSign,
  rowDate,
  rowDateColor,
  rowDescription,
  onUpdateCell,
  onCommitCell,
}: Props) {
  // Wrappers that adapt the parent's (rowId, colId, value) handlers into
  // the (value)-only signature the inline editors expect. Allocated per
  // Cell render — but Cell is memoized, so they're only rebuilt when the
  // cell's actual data changes, not on every parent re-render.
  const onChange = (next: CellValue) => onUpdateCell(rowId, column.id, next);
  const onCommit = onCommitCell
    ? (next: CellValue) => onCommitCell(rowId, column.id, next)
    : undefined;
  // Synthesized transfer rows are not editable inline — the
  // underlying data lives in `data.transfers`, not on the budget's
  // rows[]. Render each cell as a display-only span / icon and offer
  // editing through the action button (which opens the transfer
  // modal). The dedicated transfer layouts only differ from the
  // regular layouts in two ways: no input element, and the description
  // cell shows a transfer arrow + peer-account name.
  //
  // History rows are partially editable: description and type can be
  // edited inline (the writes land on `HistoryEntry.userDescription` /
  // `userTypeId` via the parent's interception of `onUpdateCell`),
  // while date / amount / balance / completed stay read-only — those
  // are bank-authoritative and the user shouldn't be able to rewrite
  // them without re-importing.
  // The two synthesized-row modes (transfer, history) share the same
  // readonly leaves for date / amount / balance / completed — the only
  // per-mode variation is in the description and type cells. Route the
  // shared half through a single helper so the leaves stay in lock-step
  // when their prop contracts change.
  if (isTransfer || isHistory) {
    const readonly = renderReadonlyColumn({
      column,
      value,
      settings,
      computedBalance,
      hiddenTransferCount,
      transferExpanded,
      onToggleTransferAnchor,
    });
    if (readonly) return readonly;
    if (isTransfer) {
      switch (column.type) {
        case "description":
          return (
            <TransferDescriptionCell
              value={typeof value === "string" ? value : ""}
              peerName={peerName ?? ""}
              outgoing={!!outgoing}
            />
          );
        case "type":
          return <ReadonlyTypeCell entryType={entryType ?? null} />;
      }
    } else {
      switch (column.type) {
        case "description":
          return (
            <DescriptionCell
              rowId={rowId}
              value={typeof value === "string" ? value : ""}
              isRecurring={false}
              entryType={entryType ?? null}
              onChange={onChange}
              onCommit={onCommit}
            />
          );
        case "type":
          return (
            <TypePickerCell
              rowId={rowId}
              types={types ?? []}
              categories={categories ?? []}
              entryType={entryType ?? null}
              rowDate={rowDate}
              rowDateColor={rowDateColor}
              rowDescription={rowDescription}
              onChange={onChange}
              onCommit={onCommit}
              onCreateType={onCreateType}
              onCreateCategory={onCreateCategory}
            />
          );
      }
    }
  }
  switch (column.type) {
    case "date": {
      return (
        <DateCell
          rowId={rowId}
          value={value}
          settings={settings}
          onChange={onChange}
        />
      );
    }

    case "description":
      return (
        <DescriptionCell
          rowId={rowId}
          value={typeof value === "string" ? value : ""}
          isRecurring={!!isRecurring}
          entryType={entryType ?? null}
          onChange={onChange}
          onCommit={onCommit}
        />
      );

    case "amount": {
      // Formula rows: the amount is computed at render time, so the
      // editable inline input would be misleading. Use the read-only
      // display variant with an `fx` chip to signal the source.
      // Editing the formula goes through the ComplexEntryModal.
      if (hasFormula) {
        return (
          <AmountCellDisplay
            value={typeof value === "number" ? value : null}
            settings={settings}
            formula
          />
        );
      }
      return (
        <AmountCell
          rowId={rowId}
          value={value}
          settings={settings}
          onChange={onChange}
          onCommit={onCommit}
        />
      );
    }

    case "balance":
      return (
        <BalanceCell
          value={computedBalance ?? 0}
          settings={settings}
          hiddenTransferCount={hiddenTransferCount}
          transferExpanded={transferExpanded}
          onToggleTransferAnchor={onToggleTransferAnchor}
        />
      );

    case "completed": {
      const checked = value === true;
      return (
        <td className={`${CELL_BASE} p-0 text-center`}>
          <button
            type="button"
            className={`flex h-full min-h-9 w-full cursor-pointer items-center justify-center border-0 bg-transparent p-1.5 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
              checked ? "text-accent" : "text-muted"
            }`}
            aria-pressed={checked}
            aria-label={checked ? "Mark as not done" : "Mark as done"}
            onClick={() => onChange(!checked)}
          >
            {checked && <Check size={18} aria-hidden focusable={false} />}
          </button>
        </td>
      );
    }

    case "type":
      // The cell reads the row's `typeId` directly (via `entryType`)
      // rather than its own `cells[col.id]` slot — typeId is the source
      // of truth on `Row`, and the `updateCell` reducer routes a value
      // for this column straight into `row.typeId` so the picker and
      // every other consumer (description chip, modals, hints) stay
      // aligned without duplicating the id into a parallel cell.
      return (
        <TypePickerCell
          rowId={rowId}
          types={types ?? []}
          categories={categories ?? []}
          entryType={entryType ?? null}
          amountSign={amountSign}
          rowDate={rowDate}
          rowDateColor={rowDateColor}
          rowDescription={rowDescription}
          onChange={onChange}
          onCommit={onCommit}
          onCreateType={onCreateType}
          onCreateCategory={onCreateCategory}
        />
      );
  }
}

// Memoized so that a focus / popover-open in one cell — which fires a
// state change at the row's parent — doesn't ripple through every cell
// in every row. Shallow compare is enough: BudgetRow passes the parent
// `onUpdateCell` / `onCommitCell` straight through (stable refs), and
// the other props are scalars or stable references derived from the row.
export const BudgetCell = memo(CellImpl);

// Shared readonly balance cell. Three render paths in `BudgetCell` (default,
// `isTransfer`, `isHistory`) all need the same display logic plus
// the optional ↔ button that reveals hidden transfers behind this
// balance step, so the JSX is factored out here. When
// `hiddenTransferCount` is 0 the button branch never renders, so a
// balance with no hidden run upstream looks exactly like it always
// did.
function BalanceCell({
  value,
  settings,
  hiddenTransferCount,
  transferExpanded,
  onToggleTransferAnchor,
}: {
  value: number;
  settings: Settings;
  hiddenTransferCount: number;
  transferExpanded: boolean;
  onToggleTransferAnchor?: () => void;
}) {
  const t = useT();
  const negative = value < 0;
  const abs = Math.abs(value);
  const body = formatNumber(abs, settings, {
    alwaysTwoFractionDigits: true,
    alwaysAbbreviate: settings.alwaysAbbreviateBalance,
  });
  const colourClass = negative ? "text-negative" : "text-positive";
  const showButton = hiddenTransferCount > 0 && !!onToggleTransferAnchor;
  return (
    <td className={`${CELL_BASE} bg-surface-3`} aria-readonly="true">
      <div className="relative flex items-stretch">
        {/* Non-clickable +/- glyph mirrors AmountCellDisplay so the
           balance reads in the same visual format as the amount column;
           sign is conveyed by the glyph rather than baked into the text.
           Muted on purpose — a colour-matched sign would read as a
           tappable sign-toggle button (which it is on the editable
           AmountCell). The number itself keeps its sign colour. Hidden
           on mobile to claw back column width — the number's sign colour
           still conveys direction, and balance has no tap-to-toggle
           affordance so the glyph carries no interactive meaning. */}
        <span
          className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-6 items-center justify-center text-muted opacity-60 md:flex"
          aria-hidden
        >
          {negative ? (
            <Minus size={14} aria-hidden focusable={false} />
          ) : (
            <Plus size={14} aria-hidden focusable={false} />
          )}
        </span>
        <span
          className={`flex w-full items-center justify-end px-2.5 py-2 font-mono tabular-nums whitespace-pre md:pl-6 ${
            settings.showCurrency && settings.currencyPosition === "after"
              ? "pr-8"
              : ""
          } ${colourClass}`}
        >
          {showButton ? (
            // Hidden transfers contributed to this balance step. Instead
            // of an explicit reveal-affordance, the number itself becomes
            // italic — a subtle hint that something is special about it —
            // and clickable, toggling the expansion that surfaces the
            // hidden transfer rows above.
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleTransferAnchor?.();
              }}
              aria-label={plural(
                t,
                "sheet.hiddenTransferOne",
                "sheet.hiddenTransferOther",
                hiddenTransferCount,
              )}
              title={
                transferExpanded
                  ? t("sheet.collapseHiddenTransfers")
                  : t("sheet.expandHiddenTransfers")
              }
              aria-expanded={transferExpanded}
              className="cursor-pointer border-0 bg-transparent p-0 font-mono tabular-nums whitespace-pre italic underline decoration-dotted underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              {body}
            </button>
          ) : (
            <span>{body}</span>
          )}
        </span>
        {settings.showCurrency && (
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 ${
              settings.currencyPosition === "before"
                ? "left-0 md:left-6"
                : "right-2"
            } flex items-center font-mono text-xs text-muted`}
          >
            {settings.currency}
          </span>
        )}
      </div>
    </td>
  );
}

// Readonly variant of the type cell — used for synthesized transfer
// and history rows where the row is sourced from outside the budget's
// `rows[]` and inline editing is suppressed.
function ReadonlyTypeCell({ entryType }: { entryType: EntryType | null }) {
  const t = useT();
  return (
    <td className={`${CELL_BASE} p-0`} aria-readonly="true">
      <span className="flex h-full min-h-9 w-full items-center justify-center px-2 py-1 font-mono text-xs md:justify-start">
        {entryType ? (
          <>
            <span
              className="inline-flex items-center justify-center md:hidden"
              style={{ color: entryType.color }}
              aria-hidden
            >
              <CategoryIconGlyph name={entryType.glyph} size={18} />
            </span>
            <span
              className="hidden min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-medium md:inline-flex"
              style={{
                backgroundColor: `color-mix(in srgb, ${entryType.color} 18%, transparent)`,
                borderColor: `color-mix(in srgb, ${entryType.color} 55%, transparent)`,
                color: entryType.color,
              }}
            >
              <CategoryIconGlyph name={entryType.glyph} size={12} />
              <span className="truncate">{displayTypeName(entryType, t)}</span>
            </span>
          </>
        ) : (
          <span className="text-muted">—</span>
        )}
      </span>
    </td>
  );
}

// Enter in an inline description textarea commits the value (by
// blurring — `handleBlur` snapshots and bubbles the commit). Shift +
// Enter still inserts a newline so multi-line descriptions remain
// possible. The IME-composing guard avoids stealing the Enter that
// confirms an Asian-input candidate.
function handleDescriptionCommitKey(
  event: React.KeyboardEvent<HTMLTextAreaElement>,
) {
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.nativeEvent.isComposing
  ) {
    event.preventDefault();
    event.currentTarget.blur();
  }
}

function AmountCell({
  rowId,
  value,
  settings,
  onChange,
  onCommit,
}: {
  rowId: string;
  value: CellValue;
  settings: Settings;
  onChange: (value: CellValue) => void;
  onCommit?: (value: CellValue) => void;
}) {
  const externalNumber = typeof value === "number" ? value : null;
  const externalAbsText =
    externalNumber !== null
      ? formatAmountForInput(Math.abs(externalNumber), settings)
      : "";
  const [text, setText] = useState(externalAbsText);
  const [negative, setNegative] = useState(
    externalNumber !== null ? externalNumber < 0 : true,
  );
  // The cell is itself the input. When the user isn't editing it we
  // swap the visible value to the display-formatted form (decimals
  // hidden, "12K"-style abbreviation, …) so the budget view honours
  // those settings; on focus we revert to the raw editable text so
  // the user types against the precise value.
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Snapshot the signed value at focus time so blur can decide whether
  // the edit actually changed anything before bubbling a commit signal.
  const focusValueRef = useRef<number | null>(externalNumber);
  useClaimActiveRow(rowId, focused, () => inputRef.current?.blur());

  function handleFocus() {
    setFocused(true);
    focusValueRef.current = externalNumber;
  }

  function handleBlur() {
    setFocused(false);
    if (!onCommit) return;
    const abs = parseAmount(text);
    const signed =
      abs === null ? null : negative ? -Math.abs(abs) : Math.abs(abs);
    if (signed !== focusValueRef.current) {
      onCommit(signed);
    }
  }

  // Skip resync while local state already represents the same number, so
  // in-progress input like "12," is not clobbered by a parent rerender.
  useEffect(() => {
    const localAbs = parseAmount(text);
    const localSigned =
      localAbs === null ? null : negative ? -localAbs : localAbs;
    if (localSigned === externalNumber) return;
    setText(externalAbsText);
    setNegative(externalNumber !== null ? externalNumber < 0 : true);
  }, [externalNumber, externalAbsText, text, negative, settings]);

  const commit = (nextText: string, nextNegative: boolean) => {
    // Sign lives on the toggle button — strip any minus the keyboard or a
    // paste produces so the input only ever shows the absolute value.
    // Then snap the alternate decimal char to the configured one so the
    // visible text agrees with settings as the user types.
    const stripped = nextText.replace(/-/g, "");
    const cleaned = normalizeAmountInput(stripped, settings);
    setText(cleaned);
    setNegative(nextNegative);
    const abs = parseAmount(cleaned);
    onChange(
      abs === null ? null : nextNegative ? -Math.abs(abs) : Math.abs(abs),
    );
  };

  const toggleSign = () => {
    // The sign toggle is a discrete action, so commit straight through —
    // there's no focus/blur cycle to wait on.
    const nextNegative = !negative;
    commit(text, nextNegative);
    if (!onCommit) return;
    const abs = parseAmount(text);
    const signed =
      abs === null ? null : nextNegative ? -Math.abs(abs) : Math.abs(abs);
    onCommit(signed);
  };

  const parsed = parseAmount(text);
  const hasValue = parsed !== null && parsed > 0;
  // Display value used when the cell isn't focused — abs value put
  // through the full display pipeline so `showDecimals`,
  // `formatNumbers` and `abbreviateNumbers` all take effect. The sign
  // is conveyed by the +/- glyph button next to the cell, so we omit
  // it from the displayed number.
  const displayText =
    externalNumber !== null
      ? formatNumber(Math.abs(externalNumber), settings)
      : "";
  const inputValue = focused ? text : displayText || text;

  return (
    <td className={`${CELL_BASE} hover:bg-surface-2`}>
      {focused && (
        <DismissBackdrop onDismiss={() => inputRef.current?.blur()} />
      )}
      <div className={`relative flex items-stretch ${focused ? "z-[60]" : ""}`}>
        <button
          type="button"
          onClick={toggleSign}
          aria-label={negative ? "Make positive" : "Make negative"}
          tabIndex={-1}
          className={`absolute inset-y-0 left-0 z-10 flex w-6 cursor-pointer items-center justify-center border-0 bg-transparent p-0 hover:text-fg-bright ${
            negative ? "text-negative" : "text-positive"
          }`}
        >
          {negative ? (
            <Minus size={14} aria-hidden focusable={false} />
          ) : (
            <Plus size={14} aria-hidden focusable={false} />
          )}
        </button>
        {/* Hidden mirror of the visible value so the cell's intrinsic
           width tracks its content — the input itself reports a fixed
           intrinsic size driven by the `size` attribute, so it can't
           drive grid auto-sizing on its own. Mirrors whatever the
           input is actually showing (raw text when focused, the
           display-formatted text otherwise) so the column doesn't
           jitter as focus moves. */}
        <span
          aria-hidden
          className="invisible px-2.5 py-2 pl-6 font-mono tabular-nums whitespace-pre"
        >
          {withCurrency(inputValue || "0", settings)}
        </span>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          pattern="[0-9]*[.,]?[0-9]*"
          className={`${INPUT_BASE} absolute inset-0 ${
            settings.showCurrency && settings.currencyPosition === "before"
              ? "pl-10"
              : "pl-6"
          } ${
            settings.showCurrency && settings.currencyPosition === "after"
              ? "pr-8"
              : ""
          } text-right tabular-nums ${
            hasValue
              ? negative
                ? "text-negative"
                : "text-positive"
              : "text-fg"
          }`}
          value={inputValue}
          onChange={(e) => commit(e.target.value, negative)}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        {settings.showCurrency && (
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 ${
              settings.currencyPosition === "before" ? "left-6" : "right-2"
            } flex items-center font-mono text-xs text-muted`}
          >
            {settings.currency}
          </span>
        )}
      </div>
    </td>
  );
}

function DateCell({
  rowId,
  value,
  settings,
  onChange,
}: {
  rowId: string;
  value: CellValue;
  settings: Settings;
  onChange: (value: CellValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const iso = typeof value === "string" ? value : "";
  // Wire the date modal into the active-row coordinator. While the
  // calendar is open the AddRowButton greys itself out and a tap on it
  // (or anywhere else outside the modal) only dismisses, mirroring how
  // amount focus and the description popover behave.
  useClaimActiveRow(rowId, open, () => setOpen(false));

  return (
    <>
      <DateCellDisplay
        iso={iso}
        settings={settings}
        mode="trigger"
        onClick={() => setOpen(true)}
      />
      <DatePickerModal
        open={open}
        value={iso}
        onClose={() => setOpen(false)}
        onSelect={(next) => onChange(next)}
      />
    </>
  );
}

// Typed rows reclaim the narrow mobile description column for the
// type's name (plain text in the type's colour) — a clearer
// identifier than the bank's memo at a glance. Desktop keeps the
// description inline since the dedicated type column already
// carries the chip + name there. Both branches render the same
// `DesktopDescriptionEditor` + `DescriptionPopover` tree so that a
// reducer-driven type flip mid-edit (pattern auto-categorisation
// assigning `typeId` after a matching description lands) reconciles
// without unmounting the textarea — otherwise the keystroke that
// completed the match (often a trailing space) is lost along with
// focus.
function DescriptionCell({
  rowId,
  value,
  isRecurring,
  entryType,
  onChange,
  onCommit,
}: {
  rowId: string;
  value: string;
  isRecurring: boolean;
  entryType: EntryType | null;
  onChange: (value: CellValue) => void;
  onCommit?: (value: CellValue) => void;
}) {
  const t = useT();
  const hasValue = value.length > 0;
  const typeLabel = entryType ? displayTypeName(entryType, t) : "";
  return (
    <td
      className={`${CELL_BASE} align-middle hover:bg-surface-2 md:w-full ${
        isRecurring ? "text-flag" : "text-fg"
      }`}
    >
      <DesktopDescriptionEditor
        rowId={rowId}
        value={value}
        isRecurring={isRecurring}
        onChange={onChange}
        onCommit={onCommit}
      />
      <DescriptionPopover
        rowId={rowId}
        value={value}
        onChange={onChange}
        onCommit={onCommit}
        renderTrigger={({ ref, onClick, open }) =>
          entryType ? (
            <button
              ref={ref}
              type="button"
              onClick={onClick}
              className={`flex h-full min-h-9 w-full cursor-pointer items-center border-0 bg-transparent px-2.5 py-2 font-mono outline-none focus-visible:bg-surface-2 md:hidden ${
                hasValue
                  ? "justify-start text-left"
                  : "justify-center text-xs font-medium"
              }`}
              style={hasValue ? undefined : { color: entryType.color }}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label={hasValue ? `${typeLabel}: ${value}` : typeLabel}
              title={hasValue ? value : typeLabel}
            >
              <span className="min-w-0 truncate">
                {hasValue ? value : typeLabel}
              </span>
            </button>
          ) : (
            <button
              ref={ref}
              type="button"
              onClick={onClick}
              className={`flex h-full min-h-9 w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent px-2.5 py-2 font-mono outline-none focus-visible:bg-surface-2 md:hidden ${
                hasValue
                  ? "justify-start text-left"
                  : "justify-center text-center"
              } ${isRecurring ? "text-flag" : hasValue ? "text-fg" : "text-muted"}`}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label={
                hasValue
                  ? t("cell.descriptionWith", { value })
                  : t("cell.addDescription")
              }
              title={hasValue ? value : undefined}
            >
              {isRecurring && (
                <Repeat
                  size={16}
                  aria-hidden
                  focusable={false}
                  className="shrink-0 text-flag"
                />
              )}
              {hasValue ? (
                <span className="min-w-0 truncate">{value}</span>
              ) : !isRecurring ? (
                <span>…</span>
              ) : null}
            </button>
          )
        }
      />
    </td>
  );
}

// Desktop branch of the description cell, shared by the Plain and
// Typed variants. Snapshots the value on focus so blur only emits a
// commit when the text actually changed — avoids prompting after a
// no-op click in.
function DesktopDescriptionEditor({
  rowId,
  value,
  isRecurring,
  onChange,
  onCommit,
}: {
  rowId: string;
  value: string;
  isRecurring: boolean;
  onChange: (value: CellValue) => void;
  onCommit?: (value: CellValue) => void;
}) {
  const t = useT();
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const focusValueRef = useRef<string>(value);
  useClaimActiveRow(rowId, focused, () => textareaRef.current?.blur());

  function handleFocus() {
    setFocused(true);
    focusValueRef.current = value;
  }

  function handleBlur() {
    setFocused(false);
    if (!onCommit) return;
    if (value !== focusValueRef.current) onCommit(value);
  }

  return (
    <div
      className={`relative hidden md:flex md:items-start ${
        focused ? "z-[60]" : ""
      }`}
    >
      {focused && (
        <DismissBackdrop onDismiss={() => textareaRef.current?.blur()} />
      )}
      {isRecurring && (
        <span
          aria-label={t("cell.recurring")}
          title={t("cell.recurring")}
          className="flex shrink-0 items-center pt-2 pl-2 text-flag"
        >
          <Repeat size={12} aria-hidden focusable={false} />
        </span>
      )}
      <textarea
        ref={textareaRef}
        className={`${INPUT_BASE} resize-none leading-snug whitespace-pre-wrap break-words [field-sizing:content] min-h-[1.6em] ${
          isRecurring ? "pl-1.5" : ""
        }`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleDescriptionCommitKey}
        rows={1}
        placeholder={t("cell.placeholderEllipsis")}
      />
    </div>
  );
}

// Document-coord position so the popover scrolls with the trigger row
// when iOS shifts the page up to fit the on-screen keyboard. `position:
// fixed` stays anchored to the layout viewport — which iOS moves out
// from under the popover when the keyboard appears, leaving the field
// off screen.
const DESCRIPTION_POPOVER_PLACEMENT: FloatingPlacement = {
  width: { kind: "max", maxPx: 280 },
  anchor: "left",
  coordinateSpace: "document",
};

// Mobile description popover shared by the Plain and Typed cells.
// The two cells differ only in the trigger button (recurring icon /
// "…" vs the type's name in the type's colour), so callers pass the
// trigger via `renderTrigger` and the popover owns the open state,
// the commit-on-close hook, and the textarea editor.
function DescriptionPopover({
  rowId,
  value,
  onChange,
  onCommit,
  renderTrigger,
}: {
  rowId: string;
  value: string;
  onChange: (value: CellValue) => void;
  onCommit?: (value: CellValue) => void;
  renderTrigger: (ctx: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    open: boolean;
  }) => React.ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // Snapshot the value at popover-open time so we only emit a commit
  // when the user actually changed the description before closing.
  const openValueRef = useRef<string>(value);
  const wasOpenRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      openValueRef.current = value;
    } else if (!open && wasOpenRef.current) {
      if (onCommit && value !== openValueRef.current) onCommit(value);
    }
    wasOpenRef.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  return (
    <>
      {renderTrigger({
        ref: triggerRef,
        onClick: () => setOpen((v) => !v),
        open,
      })}
      <FloatingPanel
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        placement={DESCRIPTION_POPOVER_PLACEMENT}
        rowId={rowId}
        arrow="up"
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              setOpen(false);
            }
          }}
          placeholder={t("cell.descriptionPlaceholder")}
          rows={1}
          className="field-input block w-full resize-none rounded border-0 bg-transparent px-2 py-1.5 font-mono leading-snug whitespace-pre-wrap break-words text-fg outline-none [field-sizing:content]"
        />
      </FloatingPanel>
    </>
  );
}

// Read-only date cell for synthesized transfer rows. Uses the same
// long / short / day-only formatters as the editable variant so widths
// line up across the table.
function ReadonlyDateCell({
  value,
  settings,
}: {
  value: string;
  settings: Settings;
}) {
  return <DateCellDisplay iso={value} settings={settings} mode="static" />;
}

// Description cell for synthesized transfer rows. Shows a transfer
// arrow leading into the peer account name, then the transfer
// description as plain text. Mirrors the editable description cell's
// desktop / mobile split so the row collapses cleanly on small screens.
function TransferDescriptionCell({
  value,
  peerName,
  outgoing,
}: {
  value: string;
  peerName: string;
  outgoing: boolean;
}) {
  const arrow = outgoing ? (
    // Outgoing transfer: arrow pointing AWAY from us toward the peer.
    <ArrowRight
      size={12}
      aria-hidden
      focusable={false}
      className="shrink-0 text-flag"
    />
  ) : (
    // Incoming transfer: the bidirectional glyph reads better than a
    // left-pointing arrow at a glance because the row's sign already
    // tells the user where the money came from.
    <ArrowLeftRight
      size={12}
      aria-hidden
      focusable={false}
      className="shrink-0 text-flag"
    />
  );
  return (
    <td className={`${CELL_BASE} text-flag align-middle md:w-full`}>
      <div className="hidden md:flex md:items-center md:gap-1.5 md:px-2.5 md:py-2">
        {arrow}
        <span className="text-muted">{peerName || "—"}</span>
        {value && <span className="text-muted">·</span>}
        <span className="truncate text-fg">{value}</span>
      </div>
      <div className="flex h-full min-h-9 w-full items-center justify-center gap-1.5 px-2.5 py-2 font-mono text-flag md:hidden">
        {arrow}
        <span className="truncate text-fg">{value || peerName || "—"}</span>
      </div>
    </td>
  );
}

// Readonly variant of the `completed` cell — used by synthesized
// transfer and history rows. The editable variant in `CellImpl`
// renders a `<button>` instead; this one is just a static glyph so the
// row reads identically without becoming clickable.
function ReadonlyCompletedCell({ checked }: { checked: boolean }) {
  return (
    <td
      className={`${CELL_BASE} p-0 text-center text-muted`}
      aria-readonly="true"
    >
      <span className="flex h-full min-h-9 w-full items-center justify-center p-1.5">
        {checked && <Check size={18} aria-hidden focusable={false} />}
      </span>
    </td>
  );
}

// Shared `type` cell wrapper. The `<td>` chrome, `onSelect` /
// `onCreate` plumbing, and `variant="chip"` are identical between the
// history and normal-mode call sites; the only difference is whether
// `amountSign` is forwarded (history mode omits it so the dropdown
// doesn't filter income / expense types out, since history rows aren't
// sign-restricted the way a sheet entry is).
function TypePickerCell({
  rowId,
  types,
  categories,
  entryType,
  amountSign,
  rowDate,
  rowDateColor,
  rowDescription,
  onChange,
  onCommit,
  onCreateType,
  onCreateCategory,
}: {
  rowId: string;
  types: readonly EntryType[];
  categories: readonly Category[];
  entryType: EntryType | null;
  amountSign?: "positive" | "negative" | "any";
  rowDate?: string;
  rowDateColor?: string;
  rowDescription?: string;
  onChange: (value: CellValue) => void;
  onCommit?: (value: CellValue) => void;
  onCreateType?: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory?: (draft: Omit<Category, "id">) => Category;
}) {
  return (
    <td className={`${CELL_BASE} p-0`}>
      <TypePicker
        rowId={rowId}
        types={types}
        categories={categories}
        selectedId={entryType?.id ?? null}
        amountSign={amountSign}
        rowDate={rowDate}
        rowDateColor={rowDateColor}
        rowDescription={rowDescription}
        onSelect={(id) => {
          onChange(id);
          onCommit?.(id);
        }}
        onCreate={
          onCreateType ??
          ((draft) => ({
            id: `tmp-${Math.random().toString(36).slice(2)}`,
            ...draft,
          }))
        }
        onCreateCategory={onCreateCategory}
        variant="chip"
      />
    </td>
  );
}

// Cells that are read-only in both the `isTransfer` and `isHistory`
// modes. The two modes used to repeat these four switch arms verbatim
// — keeping them in sync was a recurring source of drift (e.g. when
// `BalanceCell` grew its hidden-transfer toggle, every copy had to be
// updated). Adding a new readonly column type now means touching one
// arm in this helper instead of two switches in `CellImpl`.
function renderReadonlyColumn({
  column,
  value,
  settings,
  computedBalance,
  hiddenTransferCount,
  transferExpanded,
  onToggleTransferAnchor,
}: {
  column: Column;
  value: CellValue;
  settings: Settings;
  computedBalance: number | undefined;
  hiddenTransferCount: number;
  transferExpanded: boolean;
  onToggleTransferAnchor: (() => void) | undefined;
}) {
  switch (column.type) {
    case "date":
      return (
        <ReadonlyDateCell
          value={typeof value === "string" ? value : ""}
          settings={settings}
        />
      );
    case "amount":
      return (
        <AmountCellDisplay
          value={typeof value === "number" ? value : null}
          settings={settings}
        />
      );
    case "balance":
      return (
        <BalanceCell
          value={computedBalance ?? 0}
          settings={settings}
          hiddenTransferCount={hiddenTransferCount}
          transferExpanded={transferExpanded}
          onToggleTransferAnchor={onToggleTransferAnchor}
        />
      );
    case "completed":
      return <ReadonlyCompletedCell checked={value === true} />;
    default:
      return null;
  }
}
