import { useEffect, useRef, useState } from "react";
import { Calculator, Minus, Plus, X } from "lucide-react";

import { unlock } from "../../data/achievements";
import type { Settings } from "../../data/types";
import { type FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import { evaluateExpression } from "../../utils/calc";
import {
  formatAmountForInput,
  formatNumber,
  normalizeAmountInput,
  parseAmount,
  withCurrency,
} from "../../utils/format";
import { FloatingPanel } from "../FloatingPanel";
import { Button } from "./Button";

type Props = {
  value: string;
  negative: boolean;
  onValueChange: (next: string) => void;
  onToggleSign: () => void;
  settings: Settings;
  ariaLabel: string;
  placeholder?: string;
  surface?: "surface" | "surface-2";
  density?: "regular" | "compact";
  width?: "flex" | "w-32";
  disabled?: boolean;
  // When true, render a calculator button to the right of the field.
  // Clicking it opens a popover where the user types an arithmetic
  // expression ("100 + 30 + 50") and the evaluated magnitude replaces
  // the field's value. The sign stays on the +/- toggle, so a field
  // set to negative turns "100+30+50" into a magnitude of 180 that
  // still reads as −180.
  calculator?: boolean;
};

// Popover anchors to the input wrapper, right edges aligned, and opens
// below (flipping up when there's no room) — the same vocabulary the
// custom pickers use.
const CALC_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 220 },
  anchor: "right",
  coordinateSpace: "viewport",
};

// Shared signed-amount editor: a +/- toggle button absolutely positioned
// over the left edge of a magnitude-only text input. The sign lives on
// the button — any minus the keyboard or a paste introduces is stripped
// before the value reaches the parent, so the input only ever shows the
// absolute amount. Tone (negative / positive / neutral) is computed
// from the typed magnitude and the current sign.
//
// Variant props are closed sets so the Tailwind JIT scanner sees every
// literal class token. Add a case here before adding another caller.
export function SignedAmountInput({
  value,
  negative,
  onValueChange,
  onToggleSign,
  settings,
  ariaLabel,
  placeholder,
  surface = "surface-2",
  density = "regular",
  width = "flex",
  disabled = false,
  calculator = false,
}: Props) {
  const t = useT();

  const bgClass = surface === "surface" ? "bg-surface" : "bg-surface-2";
  const paddingClass = density === "compact" ? "py-1" : "py-1.5";
  const wrapperClass =
    width === "w-32" ? "relative flex w-32" : "relative flex min-w-0 flex-1";
  const inputWidthClass = width === "w-32" ? "w-full" : "min-w-0 flex-1";

  const parsed = parseAmount(value);
  const tone =
    parsed !== null && parsed !== 0
      ? negative
        ? "text-negative"
        : "text-positive"
      : "text-fg";

  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canClear = value.length > 0 && !disabled;

  const showCalc = calculator && !disabled;
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcExpr, setCalcExpr] = useState("");
  const calcInputRef = useRef<HTMLInputElement | null>(null);
  // Focus the expression field when the popover opens so the user can
  // type straight away (the a11y lint rule forbids the `autoFocus`
  // attribute, so we drive focus imperatively instead).
  useEffect(() => {
    if (calcOpen) calcInputRef.current?.focus();
  }, [calcOpen]);

  // Padding-right grows with the number of trailing buttons so the typed
  // value never slides under them. Right offsets keep the calculator at
  // the far edge and the clear button just inside it.
  const trailingButtons = (showCalc ? 1 : 0) + (canClear ? 1 : 0);
  const prClass =
    trailingButtons >= 2 ? "pr-14" : trailingButtons === 1 ? "pr-7" : "pr-2";
  const clearRightClass = showCalc ? "right-8" : "right-1.5";

  function handleChange(next: string) {
    const stripped = next.replace(/-/g, "");
    onValueChange(normalizeAmountInput(stripped, settings));
  }

  const calcResult = evaluateExpression(calcExpr);
  const calcTrimmed = calcExpr.trim();

  function applyCalc() {
    if (calcResult === null) return;
    const magnitude = Math.abs(calcResult);
    onValueChange(
      magnitude === 0 ? "" : formatAmountForInput(magnitude, settings),
    );
    unlock("quickMaths");
    setCalcOpen(false);
    setCalcExpr("");
    inputRef.current?.focus();
  }

  return (
    <div
      ref={wrapperRef}
      className={`${wrapperClass}${disabled ? " opacity-60" : ""}`}
    >
      <button
        type="button"
        onClick={onToggleSign}
        disabled={disabled}
        aria-label={
          negative ? t("editEntry.makePositive") : t("editEntry.makeNegative")
        }
        tabIndex={-1}
        className={`absolute inset-y-0 left-0 z-10 flex w-7 items-center justify-center border-0 bg-transparent p-0 ${
          disabled
            ? "cursor-not-allowed"
            : "cursor-pointer hover:text-fg-bright"
        } ${negative ? "text-negative" : "text-positive"}`}
      >
        {negative ? (
          <Minus size={14} aria-hidden focusable={false} />
        ) : (
          <Plus size={14} aria-hidden focusable={false} />
        )}
      </button>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        className={`field-input ${inputWidthClass} rounded border border-line ${bgClass} ${paddingClass} ${prClass} pl-7 text-right font-mono text-sm tabular-nums ${tone}${disabled ? " cursor-not-allowed" : ""}`}
      />
      {canClear && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("common.clear")}
          // Keep focus on the input so the soft keyboard stays up.
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          onClick={() => {
            onValueChange("");
            inputRef.current?.focus();
          }}
          className={`absolute top-1/2 ${clearRightClass} z-10 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-3 hover:text-fg`}
        >
          <X size={14} aria-hidden focusable={false} />
        </button>
      )}
      {showCalc && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("calc.open")}
          title={t("calc.open")}
          onClick={() => {
            setCalcExpr("");
            setCalcOpen((prev) => !prev);
          }}
          className={`absolute top-1/2 right-1.5 z-10 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded ${
            calcOpen ? "text-accent" : "text-muted"
          } hover:bg-surface-3 hover:text-fg`}
        >
          <Calculator size={14} aria-hidden focusable={false} />
        </button>
      )}
      {showCalc && (
        <FloatingPanel
          open={calcOpen}
          onClose={() => setCalcOpen(false)}
          triggerRef={wrapperRef}
          placement={CALC_PLACEMENT}
          className="gap-2 p-3"
        >
          <div className="text-xs text-muted">{t("calc.title")}</div>
          <input
            ref={calcInputRef}
            type="text"
            value={calcExpr}
            onChange={(e) => setCalcExpr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyCalc();
              }
            }}
            placeholder={t("calc.placeholder")}
            aria-label={t("calc.title")}
            className="field-input w-full rounded border border-line bg-surface px-2 py-1.5 text-left font-mono text-sm text-fg"
          />
          <div className="flex items-center justify-between gap-2">
            {calcTrimmed === "" ? (
              <span className="text-xs text-muted">{t("calc.hint")}</span>
            ) : calcResult === null ? (
              <span className="text-xs text-danger">{t("calc.invalid")}</span>
            ) : (
              <span className="font-mono text-sm tabular-nums text-fg-bright">
                {negative && calcResult !== 0 ? "−" : ""}
                {withCurrency(
                  formatNumber(Math.abs(calcResult), settings),
                  settings,
                )}
              </span>
            )}
            <Button
              variant="primary"
              onClick={applyCalc}
              disabled={calcResult === null}
            >
              {t("common.apply")}
            </Button>
          </div>
        </FloatingPanel>
      )}
    </div>
  );
}
