import { useRef } from "react";

import type { CellValue, Column } from "../data/types";
import { IconCheck } from "./icons";

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

export function Cell({ column, value, computedBalance, onChange }: Props) {
  switch (column.type) {
    case "date": {
      return <DateCell value={value} onChange={onChange} />;
    }

    case "description":
      return (
        <td className="cell cell-description">
          <textarea
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
        <td className="cell cell-amount">
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
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
          className={`cell cell-balance${n < 0 ? " is-negative" : ""}`}
          aria-readonly="true"
        >
          {formatMoney(n)}
        </td>
      );
    }

    case "completed": {
      const checked = value === true;
      return (
        <td className="cell cell-completed">
          <button
            type="button"
            className={`done-toggle${checked ? " is-done" : ""}`}
            aria-pressed={checked}
            aria-label={checked ? "Mark as not done" : "Mark as done"}
            onClick={() => onChange(!checked)}
          >
            {checked && <IconCheck size={18} className="done-glyph" />}
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
    <td className="cell cell-date">
      <button
        type="button"
        className="date-button"
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
        className="date-input-hidden"
        value={iso}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="Date"
        tabIndex={-1}
      />
    </td>
  );
}
