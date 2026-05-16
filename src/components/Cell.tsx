import { useEffect, useRef, useState } from "react";
import { Check, Minus } from "lucide-react";

import type { Category, CellValue, Column } from "../data/types";
import { CategoryPicker } from "./CategoryPicker";

type Props = {
  column: Column;
  value: CellValue;
  computedBalance?: number;
  categories?: Category[];
  onChange: (value: CellValue) => void;
  onCreateCategory?: (draft: Omit<Category, "id">) => Category;
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
  "field-input w-full border-0 bg-transparent px-2.5 py-2 font-mono text-inherit outline-none";

export function Cell({
  column,
  value,
  computedBalance,
  categories,
  onChange,
  onCreateCategory,
}: Props) {
  switch (column.type) {
    case "date": {
      return <DateCell value={value} onChange={onChange} />;
    }

    case "description":
      return (
        <td className={`${CELL_BASE} max-w-[60ch] text-fg`}>
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
      return <AmountCell value={value} onChange={onChange} />;
    }

    case "balance": {
      const n = computedBalance ?? 0;
      return (
        <td
          className={`${CELL_BASE} bg-surface-3 px-2.5 py-2 text-right tabular-nums whitespace-nowrap ${
            n < 0 ? "text-danger" : "text-meta"
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

function parseAmount(text: string): number | null {
  if (text === "" || text === "-") return null;
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function AmountCell({
  value,
  onChange,
}: {
  value: CellValue;
  onChange: (value: CellValue) => void;
}) {
  const externalText = typeof value === "number" ? String(value) : "";
  const [text, setText] = useState(externalText);

  // Skip resync while local text represents the same number, so in-progress
  // input like "-" or "12," is not clobbered by a parent rerender.
  useEffect(() => {
    if (parseAmount(text) === value) return;
    setText(externalText);
  }, [value, externalText, text]);

  const commit = (next: string) => {
    setText(next);
    onChange(parseAmount(next));
  };

  const toggleSign = () => {
    commit(text.startsWith("-") ? text.slice(1) : "-" + text);
  };

  const parsed = parseAmount(text);
  const isNegative = parsed !== null && parsed < 0;
  const isPositive = parsed !== null && parsed > 0;

  return (
    <td className={CELL_BASE}>
      <div className="relative flex items-stretch">
        <button
          type="button"
          onClick={toggleSign}
          aria-label="Toggle sign"
          tabIndex={-1}
          className="absolute inset-y-0 left-0 z-10 flex w-6 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-muted hover:text-fg-bright"
        >
          <Minus size={14} aria-hidden focusable={false} />
        </button>
        <input
          type="text"
          inputMode="decimal"
          pattern="-?[0-9]*[.,]?[0-9]*"
          className={`${INPUT_BASE} pl-6 text-right tabular-nums ${
            isNegative ? "text-danger" : isPositive ? "text-meta" : "text-fg"
          }`}
          value={text}
          onChange={(e) => commit(e.target.value)}
        />
      </div>
    </td>
  );
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
        className={`block w-full cursor-pointer border-0 bg-transparent px-2 py-2 text-center font-mono tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:px-2.5 md:text-right ${
          day ? "text-path" : "text-muted"
        }`}
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
