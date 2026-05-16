import { useRef } from "react";
import { Check } from "lucide-react";

import type { CellValue, Column } from "../data/types";

type Props = {
  column: Column;
  value: CellValue;
  computedBalance?: number;
  onChange: (value: CellValue) => void;
};

const moneyFormat = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(n: number): string {
  return moneyFormat.format(n);
}

function dayFromIso(value: CellValue): string {
  if (typeof value !== "string" || value.length < 10) return "";
  const day = Number(value.slice(8, 10));
  return Number.isFinite(day) && day > 0 ? String(day) : "";
}

const CELL_BASE = "border-r border-b border-line bg-surface last:border-r-0";
const INPUT_BASE =
  "field-input w-full border-0 bg-transparent px-2.5 py-2 text-inherit outline-none";

export function Cell({ column, value, computedBalance, onChange }: Props) {
  switch (column.type) {
    case "date": {
      return <DateCell value={value} onChange={onChange} />;
    }

    case "description":
      return (
        <td className={`${CELL_BASE} max-w-[60ch]`}>
          <textarea
            className={`${INPUT_BASE} resize-none leading-snug whitespace-pre-wrap break-words [field-sizing:content] min-h-[1.6em]`}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            rows={1}
            placeholder="…"
          />
        </td>
      );

    case "amount": {
      const display =
        typeof value === "number"
          ? String(value)
          : value == null
            ? ""
            : String(value);
      return (
        <td className={CELL_BASE}>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            className={`${INPUT_BASE} text-right tabular-nums`}
            value={display}
            onChange={(e) => {
              const text = e.target.value;
              if (text === "") onChange(null);
              else {
                const n = Number(text);
                onChange(Number.isFinite(n) ? n : null);
              }
            }}
          />
        </td>
      );
    }

    case "balance": {
      const n = computedBalance ?? 0;
      return (
        <td
          className={`${CELL_BASE} bg-surface-2 px-2.5 py-2 text-right tabular-nums whitespace-nowrap ${
            n < 0 ? "text-danger" : "text-muted"
          }`}
          aria-readonly="true"
        >
          {formatMoney(n)}
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
              checked ? "text-success" : "text-muted"
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
  }
}

function DateCell({
  value,
  onChange,
}: {
  value: CellValue;
  onChange: (value: CellValue) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const day = dayFromIso(value);
  const iso = typeof value === "string" ? value : "";

  return (
    <td className={`${CELL_BASE} relative p-0`}>
      <button
        type="button"
        className="block w-full cursor-pointer border-0 bg-transparent px-2 py-2 text-center font-inherit tabular-nums text-inherit focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:px-2.5 md:text-right"
        onClick={() => {
          const input = inputRef.current;
          if (!input) return;
          if (typeof input.showPicker === "function") {
            try {
              input.showPicker();
              return;
            } catch {
              // fall through to focus
            }
          }
          input.focus();
          input.click();
        }}
      >
        {day || "—"}
      </button>
      <input
        ref={inputRef}
        type="date"
        className="date-picker-hidden pointer-events-none absolute m-0 h-px w-px border-0 p-0 opacity-0"
        value={iso}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="Date"
        tabIndex={-1}
      />
    </td>
  );
}
