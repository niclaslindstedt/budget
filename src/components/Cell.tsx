import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Minus, Plus, Repeat } from "lucide-react";

import type { Category, CellValue, Column, Settings } from "../data/types";
import {
  formatAmountForInput,
  formatBalance,
  formatDate,
  formatShortDate,
  normalizeAmountInput,
  parseAmount,
  withCurrency,
} from "../utils/format";
import { CategoryPicker } from "./CategoryPicker";
import { DatePickerModal } from "./DatePickerModal";

type Props = {
  column: Column;
  value: CellValue;
  computedBalance?: number;
  categories?: Category[];
  settings: Settings;
  isRecurring?: boolean;
  onChange: (value: CellValue) => void;
  onCreateCategory?: (draft: Omit<Category, "id">) => Category;
};

const CELL_BASE = "border-r border-b border-line bg-surface last:border-r-0";
const INPUT_BASE =
  "field-input w-full border-0 bg-transparent px-2.5 py-2 font-mono text-inherit outline-none";

export function Cell({
  column,
  value,
  computedBalance,
  categories,
  settings,
  isRecurring,
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
          value={typeof value === "string" ? value : ""}
          isRecurring={!!isRecurring}
          onChange={onChange}
        />
      );

    case "amount": {
      return (
        <AmountCell value={value} settings={settings} onChange={onChange} />
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
  value,
  settings,
  onChange,
}: {
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
  const formatted = iso ? formatDate(iso, settings.dateFormat) : "";

  return (
    <td className={`${CELL_BASE} relative p-0`}>
      <button
        type="button"
        className={`block w-full cursor-pointer border-0 bg-transparent px-1 py-2 text-center font-mono tabular-nums whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:px-2.5 md:text-right ${
          short ? "text-path" : "text-muted"
        }`}
        aria-label={iso ? `Change date (${formatted})` : "Pick a date"}
        onClick={() => setOpen(true)}
      >
        {short || "—"}
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
  value,
  isRecurring,
  onChange,
}: {
  value: string;
  isRecurring: boolean;
  onChange: (value: CellValue) => void;
}) {
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
            aria-label="Recurring entry"
            title="Recurring entry"
            className="flex shrink-0 items-center pt-2 pl-2 text-flag"
          >
            <Repeat size={12} aria-hidden focusable={false} />
          </span>
        )}
        <textarea
          className={`${INPUT_BASE} resize-none leading-snug whitespace-pre-wrap break-words [field-sizing:content] min-h-[1.6em] ${
            isRecurring ? "pl-1.5" : ""
          }`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={1}
          placeholder="…"
        />
      </div>
      {/* Mobile: the column is narrow, so a long description wraps to many
         lines and balloons the row. Render an ellipsis trigger that opens
         a popover with the full editable description instead. */}
      <DescriptionPopover
        value={value}
        isRecurring={isRecurring}
        onChange={onChange}
      />
    </td>
  );
}

const POPOVER_MAX_WIDTH = 360;
const POPOVER_VIEWPORT_MARGIN = 8;

function computeDescriptionPopoverPosition(rect: DOMRect): {
  top: number;
  left: number;
  width: number;
} {
  const width = Math.min(
    window.innerWidth - 2 * POPOVER_VIEWPORT_MARGIN,
    POPOVER_MAX_WIDTH,
  );
  let left = rect.left;
  const maxLeft = window.innerWidth - POPOVER_VIEWPORT_MARGIN - width;
  if (left > maxLeft) left = maxLeft;
  if (left < POPOVER_VIEWPORT_MARGIN) left = POPOVER_VIEWPORT_MARGIN;
  return { top: rect.bottom + 4, left, width };
}

function DescriptionPopover({
  value,
  isRecurring,
  onChange,
}: {
  value: string;
  isRecurring: boolean;
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

  useEffect(() => {
    if (!open) return;
    function handlePointer(e: PointerEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
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
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", updatePosition);
    // Capture phase catches scrolls on any ancestor (e.g. the page body).
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className={`flex h-full min-h-9 w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent px-2.5 py-2 text-left font-mono outline-none focus-visible:bg-surface-2 md:hidden ${
          isRecurring ? "text-flag" : hasValue ? "text-fg" : "text-muted"
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={hasValue ? `Description: ${value}` : "Add description"}
      >
        {isRecurring && (
          <Repeat
            size={12}
            aria-hidden
            focusable={false}
            className="shrink-0 text-flag"
          />
        )}
        <span>…</span>
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Description"
            className="fixed z-50 rounded border border-line bg-surface-2 shadow-lg"
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
              rows={3}
              className="field-input block w-full resize-none rounded border-0 bg-transparent p-2.5 font-mono leading-snug whitespace-pre-wrap break-words text-fg outline-none [field-sizing:content] min-h-[4.5em]"
            />
          </div>,
          document.body,
        )}
    </>
  );
}
