import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
} from "../data/types";
import {
  formatAmountForInput,
  formatNumber,
  formatRunningBalance,
  normalizeAmountInput,
  parseAmount,
  withCurrency,
} from "../utils/format";
import type { FloatingPlacement } from "../hooks";
import { useT } from "../i18n";
import { useBlocksSheet } from "./useBlocksSheet";
import { DatePickerModal } from "./DatePickerModal";
import { FloatingPanel } from "./FloatingPanel";
import { TypePicker } from "./TypePicker";
import { AmountCellDisplay } from "./cells/AmountCellDisplay";
import { CELL_BASE, INPUT_BASE } from "./cells/constants";
import { DateCellDisplay } from "./cells/DateCellDisplay";
import { CategoryIconGlyph } from "./icons";

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
  typeUsageById?: ReadonlyMap<string, number>;
  onCreateType?: (draft: Omit<EntryType, "id">) => EntryType;
  // True when this row is a synthesized side of a Transaction. Disables
  // every editor (the row is sourced from `data.transactions`, not the
  // budget's `item.rows`) and swaps the description leading glyph to a
  // transfer indicator. The `peerName` / `outgoing` props feed the
  // direction arrow and "→ Savings" prefix in the description cell.
  isTransaction?: boolean;
  peerName?: string;
  outgoing?: boolean;
  // True when this row is a synthesized projection of an imported
  // bank-statement entry. Disables every editor (the source data
  // lives in `data.history`, not the budget's rows) and renders the
  // description cell as plain readonly text — no transfer arrow,
  // no peer name. The action column hides edit/delete buttons too,
  // gated upstream in SheetRow.
  isHistory?: boolean;
  // True when the row carries an `amountFormula`. The amount cell
  // becomes read-only (the value comes from the formula resolver) and
  // surfaces a small `fx` glyph so the user can tell at a glance that
  // the number isn't a literal entry. Editing the formula goes
  // through the ComplexEntryModal, not inline.
  hasFormula?: boolean;
  onChange: (value: CellValue) => void;
  // Fires when the user finishes editing a cell (blur for the typed
  // inputs, the selection event for picker-style cells). Distinct from
  // `onChange`, which can fire on every keystroke. Lets the parent know
  // the edit has settled so it can prompt for series propagation.
  onCommit?: (value: CellValue) => void;
};

export function Cell({
  rowId,
  column,
  value,
  computedBalance,
  settings,
  isRecurring,
  entryType,
  types,
  categories,
  typeUsageById,
  onCreateType,
  isTransaction,
  peerName,
  outgoing,
  isHistory,
  hasFormula,
  onChange,
  onCommit,
}: Props) {
  // Synthesized transaction rows are not editable inline — the
  // underlying data lives in `data.transactions`, not on the budget's
  // rows[]. Render each cell as a display-only span / icon and offer
  // editing through the action button (which opens the transaction
  // modal). The dedicated transaction layouts only differ from the
  // regular layouts in two ways: no input element, and the description
  // cell shows a transfer arrow + peer-account name.
  if (isTransaction || isHistory) {
    switch (column.type) {
      case "date":
        return (
          <ReadonlyDateCell
            value={typeof value === "string" ? value : ""}
            settings={settings}
          />
        );
      case "description":
        return isTransaction ? (
          <TransactionDescriptionCell
            value={typeof value === "string" ? value : ""}
            peerName={peerName ?? ""}
            outgoing={!!outgoing}
          />
        ) : (
          <ReadonlyDescriptionCell
            rowId={rowId}
            value={typeof value === "string" ? value : ""}
          />
        );
      case "amount":
        return (
          <AmountCellDisplay
            value={typeof value === "number" ? value : null}
            settings={settings}
          />
        );
      case "balance": {
        const n = computedBalance ?? 0;
        return (
          <td
            className={`${CELL_BASE} items-center bg-surface-3 px-2.5 py-2 text-right align-middle tabular-nums whitespace-nowrap ${
              n < 0 ? "text-negative" : "text-positive"
            }`}
            aria-readonly="true"
          >
            <span className="block">{formatRunningBalance(n, settings)}</span>
          </td>
        );
      }
      case "completed": {
        const checked = value === true;
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
      case "type":
        return <ReadonlyTypeCell entryType={entryType ?? null} />;
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

    case "balance": {
      const n = computedBalance ?? 0;
      return (
        <td
          className={`${CELL_BASE} items-center bg-surface-3 px-2.5 py-2 text-right align-middle tabular-nums whitespace-nowrap ${
            n < 0 ? "text-negative" : "text-positive"
          }`}
          aria-readonly="true"
        >
          {/* Wrap the text so the mobile layout (where each td is
             display:flex) gets a full-width child for `text-right` to bite
             on — otherwise the bare text node becomes a narrow anonymous
             flex item that sits at the start of the cell. */}
          <span className="block">{formatRunningBalance(n, settings)}</span>
        </td>
      );
    }

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

    case "type": {
      // The cell reads the row's `typeId` directly (via `entryType`)
      // rather than its own `cells[col.id]` slot — typeId is the source
      // of truth on `Row`, and the `updateCell` reducer routes a value
      // for this column straight into `row.typeId` so the picker and
      // every other consumer (description chip, modals, hints) stay
      // aligned without duplicating the id into a parallel cell.
      return (
        <td className={`${CELL_BASE} p-0`}>
          <TypePicker
            rowId={rowId}
            types={types ?? []}
            categories={categories ?? []}
            selectedId={entryType?.id ?? null}
            usageById={typeUsageById}
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
            variant="chip"
          />
        </td>
      );
    }
  }
}

// Readonly variant of the type cell — used for synthesized transaction
// and history rows where the row is sourced from outside the budget's
// `rows[]` and inline editing is suppressed.
function ReadonlyTypeCell({ entryType }: { entryType: EntryType | null }) {
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
              <span className="truncate">{entryType.name}</span>
            </span>
          </>
        ) : (
          <span className="text-muted">—</span>
        )}
      </span>
    </td>
  );
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
  useBlocksSheet(rowId, focused, () => inputRef.current?.blur());

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
    <td className={CELL_BASE}>
      <div className="relative flex items-stretch">
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
  useBlocksSheet(rowId, open, () => setOpen(false));

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
  // Recurring rows with a typed series collapse the description down
  // to a chip in the type's colour; the description text — when there
  // is one — is one tap away in a popover. The type name identifies
  // the row more legibly than the recurring-arrow glyph and reclaims
  // a lot of width on narrow screens. Fall back to the plain editor
  // for one-off rows and recurring rows whose typeId is still unset.
  if (isRecurring && entryType) {
    return (
      <TypedRecurringDescriptionCell
        rowId={rowId}
        value={value}
        entryType={entryType}
        onChange={onChange}
        onCommit={onCommit}
      />
    );
  }
  return (
    <PlainDescriptionCell
      rowId={rowId}
      value={value}
      isRecurring={isRecurring}
      onChange={onChange}
      onCommit={onCommit}
    />
  );
}

function PlainDescriptionCell({
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
  // Snapshot the value at focus so blur only emits a commit when the
  // text actually changed — avoids prompting after a no-op click in.
  const focusValueRef = useRef<string>(value);
  useBlocksSheet(rowId, focused, () => textareaRef.current?.blur());

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
    <td
      className={`${CELL_BASE} align-middle md:w-full ${
        isRecurring ? "text-flag" : "text-fg"
      }`}
    >
      {/* Desktop: the description is inline as an auto-growing textarea —
         the column is wide enough that wrapping reads fine. */}
      <div className="hidden md:flex md:items-start">
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
          rows={1}
          placeholder={t("cell.placeholderEllipsis")}
        />
      </div>
      {/* Mobile: the column is narrow, so a long description wraps to many
         lines and balloons the row. Render the default recurring icon
         (or "…") as the trigger so the row is identifiable at a glance,
         and open the full editable description in a popover. */}
      <PlainDescriptionPopover
        rowId={rowId}
        value={value}
        isRecurring={isRecurring}
        onChange={onChange}
        onCommit={onCommit}
      />
    </td>
  );
}

// Description cell for recurring rows whose series has a type assigned.
// Renders a coloured chip (glyph + name) in place of the recurring-arrow
// glyph and inline description, and tucks the editable description text
// into a popover behind the chip.
function TypedRecurringDescriptionCell({
  rowId,
  value,
  entryType,
  onChange,
  onCommit,
}: {
  rowId: string;
  value: string;
  entryType: EntryType;
  onChange: (value: CellValue) => void;
  onCommit?: (value: CellValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Snapshot the value at popover-open time so we only emit a commit
  // when the user actually changed the description before closing —
  // matches the focus/blur snapshot on the inline plain editor.
  const openValueRef = useRef<string>(value);
  const wasOpenRef = useRef(false);

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
    <td className={`${CELL_BASE} align-middle md:w-full`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-full min-h-9 w-full cursor-pointer items-center justify-center border-0 bg-transparent px-2 py-1.5 outline-none focus-visible:bg-surface-2 md:justify-start"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={value ? `${entryType.name}: ${value}` : entryType.name}
        title={value || entryType.name}
      >
        <span
          className="inline-flex min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-xs font-medium"
          style={{
            backgroundColor: `color-mix(in srgb, ${entryType.color} 18%, transparent)`,
            borderColor: `color-mix(in srgb, ${entryType.color} 55%, transparent)`,
            color: entryType.color,
          }}
        >
          <CategoryIconGlyph name={entryType.glyph} size={12} />
          <span className="truncate">{entryType.name}</span>
        </span>
      </button>
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
          placeholder="Description"
          rows={1}
          className="field-input block w-full resize-none rounded border-0 bg-transparent px-2 py-1.5 font-mono leading-snug whitespace-pre-wrap break-words text-fg outline-none [field-sizing:content]"
        />
      </FloatingPanel>
    </td>
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

function PlainDescriptionPopover({
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

  const hasValue = value.length > 0;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-full min-h-9 w-full cursor-pointer items-center justify-center gap-1.5 border-0 bg-transparent px-2.5 py-2 text-center font-mono outline-none focus-visible:bg-surface-2 md:hidden ${
          isRecurring ? "text-flag" : hasValue ? "text-fg" : "text-muted"
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          hasValue
            ? t("cell.descriptionWith", { value })
            : t("cell.addDescription")
        }
      >
        {isRecurring ? (
          <Repeat
            size={16}
            aria-hidden
            focusable={false}
            className="shrink-0 text-flag"
          />
        ) : (
          <span>…</span>
        )}
      </button>
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
          placeholder={t("cell.descriptionPlaceholder")}
          rows={1}
          className="field-input block w-full resize-none rounded border-0 bg-transparent px-2 py-1.5 font-mono leading-snug whitespace-pre-wrap break-words text-fg outline-none [field-sizing:content]"
        />
      </FloatingPanel>
    </>
  );
}

// Read-only date cell for synthesized transaction rows. Uses the same
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

// Description cell for synthesized transaction rows. Shows a transfer
// arrow leading into the peer account name, then the transaction
// description as plain text. Mirrors the editable description cell's
// desktop / mobile split so the row collapses cleanly on small screens.
// Read-only description cell for synthesized history rows. No
// transfer arrow, no peer name — just the bank's description text in
// the same muted style the transaction variant uses, so the row
// reads as "imported, not edited" at a glance. Bank memos are often
// long enough to truncate (the column is narrow on phones), so tapping
// the cell opens a popover with the full text.
function ReadonlyDescriptionCell({
  rowId,
  value,
}: {
  rowId: string;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hasValue = value.length > 0;

  return (
    <td className={`${CELL_BASE} align-middle md:w-full`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => hasValue && setOpen((v) => !v)}
        className="flex h-full min-h-9 w-full cursor-pointer items-center justify-center border-0 bg-transparent px-2.5 py-2 text-left font-mono text-fg outline-none focus-visible:bg-surface-2 md:justify-start"
        aria-haspopup={hasValue ? "dialog" : undefined}
        aria-expanded={hasValue ? open : undefined}
        aria-label={hasValue ? `Description: ${value}` : undefined}
        title={value || undefined}
      >
        <span className="block w-full truncate">{value || "—"}</span>
      </button>
      <FloatingPanel
        open={open && hasValue}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        placement={DESCRIPTION_POPOVER_PLACEMENT}
        rowId={rowId}
        arrow="up"
      >
        <p className="block px-2 py-1.5 font-mono text-sm leading-snug break-words whitespace-pre-wrap text-fg">
          {value}
        </p>
      </FloatingPanel>
    </td>
  );
}

function TransactionDescriptionCell({
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
