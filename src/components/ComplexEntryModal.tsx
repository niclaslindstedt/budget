import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import type { RecurrenceRule } from "../data/recurrence";
import type { Category, Settings } from "../data/types";
import { normalizeAmountInput, parseAmount } from "../utils/format";
import { CategoryPicker } from "./CategoryPicker";
import { RecurrenceForm } from "./RecurrenceForm";

type Props = {
  open: boolean;
  initialDate: string;
  categories: Category[];
  settings: Settings;
  onClose: () => void;
  onCreate: (entries: ComplexEntryDraft) => void;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
};

export type ComplexEntryDraft = {
  description: string;
  amount: number;
  categoryId: string | null;
  dates: string[];
};

export function ComplexEntryModal({
  open,
  initialDate,
  categories,
  settings,
  onClose,
  onCreate,
  onCreateCategory,
}: Props) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  // resetKey bumps when the modal re-opens so RecurrenceForm re-seeds.
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setDescription("");
    setAmount("");
    setCategoryId(null);
    setDates([]);
    setResetKey((k) => k + 1);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const handleRuleChange = useCallback(
    (_rule: RecurrenceRule | null, nextDates: string[]) => {
      setDates(nextDates);
    },
    [],
  );

  const parsedAmount = useMemo(() => parseAmount(amount), [amount]);

  if (!open) return null;

  function handleSubmit() {
    if (dates.length === 0) return;
    if (parsedAmount === null) return;
    onCreate({
      description: description.trim(),
      amount: parsedAmount,
      categoryId,
      dates,
    });
  }

  const canSubmit = dates.length > 0 && parsedAmount !== null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="complex-entry-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-lg bg-surface shadow-2xl sm:rounded-lg">
        <header className="flex items-center justify-between border-b border-line bg-surface-3 px-4 py-3">
          <h2
            id="complex-entry-title"
            className="text-sm font-bold tracking-wide text-fg-bright"
          >
            New entry
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X size={18} aria-hidden focusable={false} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-muted">Description</span>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="field-input rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
                placeholder="Rent, Spotify, Salary…"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Amount</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) =>
                  setAmount(normalizeAmountInput(e.target.value, settings))
                }
                className={`field-input rounded border border-line bg-surface-2 px-2 py-1.5 text-right font-mono text-sm tabular-nums ${
                  parsedAmount !== null && parsedAmount < 0
                    ? "text-negative"
                    : parsedAmount !== null && parsedAmount > 0
                      ? "text-positive"
                      : "text-fg"
                }`}
                placeholder="-1200"
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">Category</span>
              <CategoryPicker
                variant="field"
                categories={categories}
                selectedId={categoryId}
                onSelect={setCategoryId}
                onCreate={onCreateCategory}
              />
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 text-xs text-muted">Recurrence</div>
            <RecurrenceForm
              seedDate={initialDate}
              resetKey={resetKey}
              onChange={handleRuleChange}
            />
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add{" "}
            {dates.length > 0
              ? `${dates.length} ${dates.length === 1 ? "row" : "rows"}`
              : "rows"}
          </button>
        </footer>
      </div>
    </div>
  );
}
