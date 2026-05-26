import { Minus, Plus } from "lucide-react";

import type { Settings } from "../../../data/types";
import { formatNumber } from "../../../utils/format";
import { CELL_BASE } from "./constants";

type Props = {
  value: number | null;
  settings: Settings;
  // When true, render a small `fx` chip in the cell so the user can
  // tell at a glance the value came from a formula rather than a
  // literal entry. Used for `Row.amountFormula` rows.
  formula?: boolean;
};

// Read-only amount cell for synthesized transfer and history rows.
// Mirrors the editable cell's coloured sign + currency suffix but
// renders as plain text so the row reads identically without becoming
// editable. The display pipeline matches what the editable cell shows
// when it isn't focused (`showDecimals`, `formatNumbers`,
// `abbreviateNumbers`).
export function AmountCellDisplay({ value, settings, formula }: Props) {
  const negative = value !== null && value < 0;
  const abs = value !== null ? Math.abs(value) : null;
  const body = abs !== null ? formatNumber(abs, settings) : "";
  return (
    <td className={`${CELL_BASE} cursor-not-allowed`} aria-readonly="true">
      <div className="relative flex items-stretch">
        {/* The +/- glyph stays muted on read-only cells — a colour-matched
           sign reads as a tappable button next to the editable AmountCell,
           which it isn't here. The number itself keeps its sign colour so
           direction is still legible at a glance. */}
        <span
          className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-6 items-center justify-center text-muted opacity-60"
          aria-hidden
        >
          {negative ? (
            <Minus size={14} aria-hidden focusable={false} />
          ) : (
            <Plus size={14} aria-hidden focusable={false} />
          )}
        </span>
        {formula && (
          <span
            aria-hidden
            title="Computed from a formula"
            className="pointer-events-none absolute top-1 left-6 z-10 rounded border border-accent/60 bg-accent/10 px-1 font-mono text-[9px] leading-none text-accent"
          >
            fx
          </span>
        )}
        <span
          className={`block w-full px-2.5 py-2 pl-6 font-mono tabular-nums whitespace-pre text-right ${
            settings.showCurrency && settings.currencyPosition === "after"
              ? "pr-8"
              : ""
          } ${
            abs !== null
              ? negative
                ? "text-negative"
                : "text-positive"
              : "text-muted"
          }`}
        >
          {body || "—"}
        </span>
        {settings.showCurrency && abs !== null && (
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
