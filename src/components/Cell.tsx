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

export function Cell({ column, value, computedBalance, onChange }: Props) {
  switch (column.type) {
    case "date":
      return (
        <td className="cell cell-date">
          <input
            type="date"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value || null)}
          />
        </td>
      );

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

    case "completed":
      return (
        <td className="cell cell-completed">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
        </td>
      );
  }
}
