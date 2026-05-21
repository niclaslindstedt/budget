import { Minus, Plus } from "lucide-react";

import type { Settings } from "../../data/types";
import { useT } from "../../i18n";
import { normalizeAmountInput, parseAmount } from "../../utils/format";

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

  function handleChange(next: string) {
    const stripped = next.replace(/-/g, "");
    onValueChange(normalizeAmountInput(stripped, settings));
  }

  return (
    <div className={wrapperClass}>
      <button
        type="button"
        onClick={onToggleSign}
        aria-label={
          negative ? t("editEntry.makePositive") : t("editEntry.makeNegative")
        }
        tabIndex={-1}
        className={`absolute inset-y-0 left-0 z-10 flex w-7 cursor-pointer items-center justify-center border-0 bg-transparent p-0 hover:text-fg-bright ${
          negative ? "text-negative" : "text-positive"
        }`}
      >
        {negative ? (
          <Minus size={14} aria-hidden focusable={false} />
        ) : (
          <Plus size={14} aria-hidden focusable={false} />
        )}
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={`field-input ${inputWidthClass} rounded border border-line ${bgClass} ${paddingClass} pr-2 pl-7 text-right font-mono text-sm tabular-nums ${tone}`}
      />
    </div>
  );
}
