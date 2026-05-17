import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Minus, Plus, Repeat } from "lucide-react";

import type {
  Category,
  CategoryIcon,
  CellValue,
  Column,
  Settings,
} from "../data/types";
import {
  formatAmountForInput,
  formatBalance,
  formatDate,
  formatDayOnly,
  formatShortDate,
  normalizeAmountInput,
  parseAmount,
  withCurrency,
} from "../utils/format";
import { monthColorVar, monthNumberFromKey } from "../utils/monthColor";
import { useActiveRow } from "./useActiveRow";
import { CategoryPicker } from "./CategoryPicker";
import { DatePickerModal } from "./DatePickerModal";
import { CategoryIconGlyph } from "./icons";

type Props = {
  rowId: string;
  column: Column;
  value: CellValue;
  computedBalance?: number;
  categories?: Category[];
  settings: Settings;
  isRecurring?: boolean;
  // Custom glyph carried on the row. When set, the description cell
  // renders this in place of the default recurring icon (and uses it as
  // the mobile popover trigger so the row reads at a glance).
  glyph?: CategoryIcon | null;
  onChange: (value: CellValue) => void;
  onCreateCategory?: (draft: Omit<Category, "id">) => Category;
};

const CELL_BASE = "border-r border-b border-line bg-surface last:border-r-0";
const INPUT_BASE =
  "field-input w-full border-0 bg-transparent px-2.5 py-2 font-mono text-inherit outline-none";

export function Cell({
  rowId,
  column,
  value,
  computedBalance,
  categories,
  settings,
  isRecurring,
  glyph,
  onChange,
  onCreateCategory,
}: Props) {
  switch (column.type) {
    case "date": {
      return <DateCell value={value} settings={settings} onChange={onChange} />;
    }

    case "description":
      return (
        <DescriptionCell
          rowId={rowId}
          value={typeof value === "string" ? value : ""}
          isRecurring={!!isRecurring}
          glyph={glyph ?? null}
          onChange={onChange}
        />
      );

    case "amount": {
      return (
        <AmountCell
          rowId={rowId}
          value={value}
          settings={settings}
          onChange={onChange}
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
          <span className="block">{formatBalance(n, settings)}</span>
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

    case "category": {
      const selectedId = typeof value === "string" ? value : null;
      return (
        <td className={`${CELL_BASE} p-0`}>
          <CategoryPicker
            rowId={rowId}
            categories={categories ?? []}
            selectedId={selectedId}
            onSelect={(id) => onChange(id)}
            onCreate={
              onCreateCategory ??
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

function AmountCell({
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
  const externalNumber = typeof value === "number" ? value : null;
  const externalAbsText =
    externalNumber !== null
      ? formatAmountForInput(Math.abs(externalNumber), settings)
      : "";
  const [text, setText] = useState(externalAbsText);
  const [negative, setNegative] = useState(
    externalNumber !== null ? externalNumber < 0 : true,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRow = useActiveRow();
  const tokenRef = useRef<number | null>(null);

  function handleFocus() {
    if (!activeRow || tokenRef.current !== null) return;
    tokenRef.current = activeRow.activate(rowId, () =>
      inputRef.current?.blur(),
    );
  }

  function handleBlur() {
    if (activeRow && tokenRef.current !== null) {
      activeRow.deactivate(tokenRef.current);
      tokenRef.current = null;
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

  const toggleSign = () => commit(text, !negative);

  const parsed = parseAmount(text);
  const hasValue = parsed !== null && parsed > 0;

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
        {/* Hidden mirror of the input value so the cell's intrinsic width
           tracks its content — the input itself reports a fixed intrinsic
           size driven by the `size` attribute, so it can't drive grid
           auto-sizing on its own. */}
        <span
          aria-hidden
          className="invisible px-2.5 py-2 pl-6 font-mono tabular-nums whitespace-pre"
        >
          {withCurrency(text || "0", settings)}
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
          value={text}
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
  value,
  settings,
  onChange,
}: {
  value: CellValue;
  settings: Settings;
  onChange: (value: CellValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const iso = typeof value === "string" ? value : "";
  const short = iso ? formatShortDate(iso, settings.shortDateFormat) : "";
  const dayOnly = iso ? formatDayOnly(iso) : "";
  const formatted = iso ? formatDate(iso, settings.dateFormat) : "";
  // Colour follows the date's *calendar* month, so a row whose date is
  // in April but whose fiscal-month bucket is May still reads as April.
  const monthNum = iso ? monthNumberFromKey(iso) : null;
  const monthColor = monthNum !== null ? monthColorVar(monthNum) : undefined;

  return (
    <td className={`${CELL_BASE} relative p-0`}>
      <button
        type="button"
        className={`block w-full cursor-pointer border-0 bg-transparent px-1 py-2 text-center font-mono font-bold tabular-nums whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:px-2.5 md:font-normal md:text-right ${
          iso ? "" : "text-muted"
        }`}
        style={iso && monthColor ? { color: monthColor } : undefined}
        aria-label={iso ? `Change date (${formatted})` : "Pick a date"}
        onClick={() => setOpen(true)}
      >
        <span className="md:hidden">{dayOnly || "—"}</span>
        <span className="hidden md:inline">{short || "—"}</span>
      </button>
      <DatePickerModal
        open={open}
        value={iso}
        onClose={() => setOpen(false)}
        onSelect={(next) => onChange(next)}
      />
    </td>
  );
}

function DescriptionCell({
  rowId,
  value,
  isRecurring,
  glyph,
  onChange,
}: {
  rowId: string;
  value: string;
  isRecurring: boolean;
  glyph: CategoryIcon | null;
  onChange: (value: CellValue) => void;
}) {
  // Pick the row's leading icon. A custom glyph wins over the default
  // Repeat icon; for one-off rows we show nothing (the mobile trigger
  // falls back to "…").
  const hasIcon = glyph !== null || isRecurring;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeRow = useActiveRow();
  const tokenRef = useRef<number | null>(null);

  function handleFocus() {
    if (!activeRow || tokenRef.current !== null) return;
    tokenRef.current = activeRow.activate(rowId, () =>
      textareaRef.current?.blur(),
    );
  }

  function handleBlur() {
    if (activeRow && tokenRef.current !== null) {
      activeRow.deactivate(tokenRef.current);
      tokenRef.current = null;
    }
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
        {hasIcon && (
          <span
            aria-label={isRecurring ? "Recurring entry" : "Entry glyph"}
            title={isRecurring ? "Recurring entry" : undefined}
            className="flex shrink-0 items-center pt-2 pl-2 text-flag"
          >
            {glyph !== null ? (
              <CategoryIconGlyph name={glyph} size={12} />
            ) : (
              <Repeat size={12} aria-hidden focusable={false} />
            )}
          </span>
        )}
        <textarea
          ref={textareaRef}
          className={`${INPUT_BASE} resize-none leading-snug whitespace-pre-wrap break-words [field-sizing:content] min-h-[1.6em] ${
            hasIcon ? "pl-1.5" : ""
          }`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          rows={1}
          placeholder="…"
        />
      </div>
      {/* Mobile: the column is narrow, so a long description wraps to many
         lines and balloons the row. Render the row's glyph (or default
         recurring icon, or "…") as the trigger so the row is identifiable
         at a glance, and open the full editable description in a popover. */}
      <DescriptionPopover
        rowId={rowId}
        value={value}
        isRecurring={isRecurring}
        glyph={glyph}
        onChange={onChange}
      />
    </td>
  );
}

const POPOVER_MAX_WIDTH = 280;
const POPOVER_VIEWPORT_MARGIN = 8;

// Document-coord position so the popover scrolls with the trigger row when
// iOS shifts the page up to fit the on-screen keyboard. `position: fixed`
// stays anchored to the layout viewport — which iOS moves out from under
// the popover when the keyboard appears, leaving the field off-screen.
function computeDescriptionPopoverPosition(rect: DOMRect): {
  top: number;
  left: number;
  width: number;
} {
  const width = Math.min(
    window.innerWidth - 2 * POPOVER_VIEWPORT_MARGIN,
    POPOVER_MAX_WIDTH,
  );
  let left = rect.left + window.scrollX;
  const maxLeft =
    window.innerWidth + window.scrollX - POPOVER_VIEWPORT_MARGIN - width;
  if (left > maxLeft) left = maxLeft;
  if (left < window.scrollX + POPOVER_VIEWPORT_MARGIN)
    left = window.scrollX + POPOVER_VIEWPORT_MARGIN;
  return { top: rect.bottom + window.scrollY + 4, left, width };
}

function DescriptionPopover({
  rowId,
  value,
  isRecurring,
  glyph,
  onChange,
}: {
  rowId: string;
  value: string;
  isRecurring: boolean;
  glyph: CategoryIcon | null;
  onChange: (value: CellValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeRow = useActiveRow();

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function updatePosition() {
      if (!triggerRef.current) return;
      setPosition(
        computeDescriptionPopoverPosition(
          triggerRef.current.getBoundingClientRect(),
        ),
      );
    }
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", updatePosition);
    // Capture phase catches scrolls on any ancestor (e.g. the page body).
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  // While open, register with the active-row coordinator so clicks
  // outside dismiss the popover without also firing whatever was clicked.
  useEffect(() => {
    if (!open || !activeRow) return;
    const token = activeRow.activate(rowId, () => setOpen(false));
    return () => activeRow.deactivate(token);
  }, [open, activeRow, rowId]);

  useLayoutEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  const handleToggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    if (!triggerRef.current) return;
    setPosition(
      computeDescriptionPopoverPosition(
        triggerRef.current.getBoundingClientRect(),
      ),
    );
    setOpen(true);
  };

  const hasValue = value.length > 0;
  // Show the row's glyph (custom, or the default Repeat for series rows)
  // as the trigger. One-off rows fall back to the existing "…" so the
  // popover stays reachable.
  const hasGlyph = glyph !== null || isRecurring;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className={`flex h-full min-h-9 w-full cursor-pointer items-center justify-center gap-1.5 border-0 bg-transparent px-2.5 py-2 text-center font-mono outline-none focus-visible:bg-surface-2 md:hidden ${
          isRecurring ? "text-flag" : hasValue ? "text-fg" : "text-muted"
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={hasValue ? `Description: ${value}` : "Add description"}
      >
        {hasGlyph ? (
          glyph !== null ? (
            <CategoryIconGlyph
              name={glyph}
              size={16}
              className="shrink-0 text-flag"
            />
          ) : (
            <Repeat
              size={16}
              aria-hidden
              focusable={false}
              className="shrink-0 text-flag"
            />
          )
        ) : (
          <span>…</span>
        )}
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Description"
            data-active-portal
            className="absolute z-50 rounded border border-line bg-surface-2 shadow-lg"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
            }}
          >
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Description"
              rows={1}
              className="field-input block w-full resize-none rounded border-0 bg-transparent px-2 py-1.5 font-mono leading-snug whitespace-pre-wrap break-words text-fg outline-none [field-sizing:content]"
            />
          </div>,
          document.body,
        )}
    </>
  );
}
