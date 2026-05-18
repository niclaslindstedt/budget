import { useCallback, useEffect, useMemo, useState } from "react";
import { Minus, Plus, X } from "lucide-react";

import type { RecurrenceRule } from "../data/recurrence";
import type { Category, EntryType, Settings } from "../data/types";
import { normalizeAmountInput, parseAmount } from "../utils/format";
import { useBodyScrollLock } from "../utils/scroll-lock";
import { CategoryPicker } from "./CategoryPicker";
import { RecurrenceForm } from "./RecurrenceForm";
import { TypePicker } from "./TypePicker";

type Props = {
  open: boolean;
  initialDate: string;
  categories: Category[];
  types: readonly EntryType[];
  typeUsageById?: ReadonlyMap<string, number>;
  settings: Settings;
  onClose: () => void;
  onCreate: (entries: ComplexEntryDraft) => void;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
};

export type ComplexEntryDraft = {
  description: string;
  amount: number;
  categoryId: string | null;
  // `null` = no type assigned (row falls back to its description as
  // the primary label); a string stamps every generated row with that
  // typeId so the cell renders the type's chip in the description
  // column.
  typeId: string | null;
  dates: string[];
};

export function ComplexEntryModal({
  open,
  initialDate,
  categories,
  types,
  typeUsageById,
  settings,
  onClose,
  onCreate,
  onCreateCategory,
  onCreateType,
}: Props) {
  const [description, setDescription] = useState("");
  const [amountText, setAmountText] = useState("");
  const [negative, setNegative] = useState(true);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  // resetKey bumps when the modal re-opens so RecurrenceForm re-seeds.
  const [resetKey, setResetKey] = useState(0);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setDescription("");
    setAmountText("");
    setNegative(true);
    setCategoryId(null);
    setTypeId(null);
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

  const parsedAbs = useMemo(() => parseAmount(amountText), [amountText]);
  const parsedAmount = useMemo(
    () =>
      parsedAbs === null
        ? null
        : negative
          ? -Math.abs(parsedAbs)
          : Math.abs(parsedAbs),
    [parsedAbs, negative],
  );

  const handleAmountChange = (next: string) => {
    // Sign lives on the toggle button — strip any minus the keyboard or
    // a paste produces so the input only ever shows the absolute value.
    const stripped = next.replace(/-/g, "");
    setAmountText(normalizeAmountInput(stripped, settings));
  };

  const toggleSign = () => setNegative((s) => !s);

  if (!open) return null;

  function handleSubmit() {
    if (dates.length === 0) return;
    if (parsedAmount === null) return;
    onCreate({
      description: description.trim(),
      amount: parsedAmount,
      categoryId,
      typeId,
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
            <div className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-muted">Type</span>
              <TypePicker
                variant="field"
                types={types}
                selectedId={typeId}
                onSelect={setTypeId}
                onCreate={onCreateType}
                usageById={typeUsageById}
              />
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Amount</span>
              <div className="relative flex">
                <button
                  type="button"
                  onClick={toggleSign}
                  aria-label={negative ? "Make positive" : "Make negative"}
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
                  value={amountText}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className={`field-input flex-1 rounded border border-line bg-surface-2 py-1.5 pr-2 pl-7 text-right font-mono text-sm tabular-nums ${
                    parsedAbs !== null && parsedAbs !== 0
                      ? negative
                        ? "text-negative"
                        : "text-positive"
                      : "text-fg"
                  }`}
                  placeholder="1200"
                />
              </div>
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
