import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

import type { CellValue, Settings } from "../../../data/types";
import {
  formatAmountForInput,
  formatNumber,
  normalizeAmountInput,
  parseAmount,
  withCurrency,
} from "../../../utils/format";
import { useSelectAllOnFocus } from "../../../hooks";
import { DismissBackdrop } from "../../DismissBackdrop";
import { useClaimActiveRow } from "../../useClaimActiveRow";
import { CELL_BASE, INPUT_BASE } from "./constants";

export function AmountCell({
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
  // In-row amount editor: too narrow for an inline X clear button, so
  // keep the "tap to select all" behaviour the rest of the app drops.
  const onFocusSelectAll = useSelectAllOnFocus<HTMLInputElement>();

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    setFocused(true);
    focusValueRef.current = externalNumber;
    onFocusSelectAll(e);
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
          className="invisible px-[var(--table-cell-px)] py-[var(--table-cell-py)] pl-6 font-mono tabular-nums whitespace-pre"
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
