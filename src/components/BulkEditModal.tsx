import { useCallback, useEffect, useMemo, useState } from "react";

import { useEscapeKey } from "../hooks";
import { X } from "lucide-react";

import { findColumnByType } from "../data/sheet";
import type { RecurrenceRule } from "../data/recurrence";
import type { Category, Column, Row, Settings } from "../data/types";
import {
  formatAmountForInput,
  normalizeAmountInput,
  parseAmount,
} from "../utils/format";
import { useBodyScrollLock } from "../utils/scroll-lock";
import { CategoryPicker } from "./CategoryPicker";
import { RecurrenceForm } from "./RecurrenceForm";

export type BulkPatch = {
  // `undefined` = don't touch; `null` (where applicable) = clear.
  categoryId?: string | null;
  amount?: number;
  date?: string;
};

type Props = {
  open: boolean;
  rows: Row[];
  columns: Column[];
  categories: Category[];
  settings: Settings;
  onClose: () => void;
  onApplyPatch: (rowIds: string[], patch: BulkPatch) => void;
  onApplyRecurring: (rowIds: string[], futureDates: string[]) => void;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
};

export function BulkEditModal({
  open,
  rows,
  columns,
  categories,
  settings,
  onClose,
  onApplyPatch,
  onApplyRecurring,
  onCreateCategory,
}: Props) {
  const dateCol = useMemo(() => findColumnByType(columns, "date"), [columns]);
  const amountCol = useMemo(
    () => findColumnByType(columns, "amount"),
    [columns],
  );
  const categoryCol = useMemo(
    () => findColumnByType(columns, "category"),
    [columns],
  );

  // Only expose the amount field when every selected row already shares the
  // same amount — guard against silently overwriting unrelated values.
  const sharedAmount = useMemo<number | null>(() => {
    if (!amountCol || rows.length === 0) return null;
    const values = rows.map((r) => r.cells[amountCol.id]);
    const first = values[0];
    if (typeof first !== "number") return null;
    return values.every((v) => v === first) ? first : null;
  }, [rows, amountCol]);

  // Seed RecurrenceForm with the earliest date in the selection so the
  // generated horizon starts somewhere relevant.
  const seedDate = useMemo<string>(() => {
    if (!dateCol) return "";
    const dates = rows
      .map((r) => r.cells[dateCol.id])
      .filter((d): d is string => typeof d === "string");
    return dates.sort()[0] ?? "";
  }, [rows, dateCol]);

  const [categoryEnabled, setCategoryEnabled] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const [dateEnabled, setDateEnabled] = useState(false);
  const [dateValue, setDateValue] = useState("");

  const [amountEnabled, setAmountEnabled] = useState(false);
  const [amountText, setAmountText] = useState("");

  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringDates, setRecurringDates] = useState<string[]>([]);
  const [recurrenceResetKey, setRecurrenceResetKey] = useState(0);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setCategoryEnabled(false);
    setCategoryId(null);
    setDateEnabled(false);
    setDateValue(seedDate);
    setAmountEnabled(false);
    setAmountText(
      sharedAmount !== null
        ? sharedAmount < 0
          ? `-${formatAmountForInput(Math.abs(sharedAmount), settings)}`
          : formatAmountForInput(sharedAmount, settings)
        : "",
    );
    setRecurringEnabled(false);
    setRecurringDates([]);
    setRecurrenceResetKey((k) => k + 1);
  }, [open, seedDate, sharedAmount, settings]);

  useEscapeKey(open, onClose);

  const handleRuleChange = useCallback(
    (_rule: RecurrenceRule | null, dates: string[]) => {
      setRecurringDates(dates);
    },
    [],
  );

  if (!open) return null;

  const parsedAmount = parseAmount(amountText);
  const rowIds = rows.map((r) => r.id);

  const patchHasChanges =
    categoryEnabled ||
    dateEnabled ||
    (amountEnabled && sharedAmount !== null && parsedAmount !== null);
  const recurringHasDates = recurringEnabled && recurringDates.length > 0;
  const canSubmit = patchHasChanges || recurringHasDates;

  function handleSubmit() {
    const patch: BulkPatch = {};
    if (categoryEnabled && categoryCol) patch.categoryId = categoryId;
    if (dateEnabled && dateCol && dateValue) patch.date = dateValue;
    if (
      amountEnabled &&
      amountCol &&
      sharedAmount !== null &&
      parsedAmount !== null
    ) {
      patch.amount = parsedAmount;
    }
    if (Object.keys(patch).length > 0) onApplyPatch(rowIds, patch);
    if (recurringEnabled && recurringDates.length > 0) {
      onApplyRecurring(rowIds, recurringDates);
    }
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-edit-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-lg bg-surface shadow-2xl sm:rounded-lg">
        <header className="flex items-center justify-between border-b border-line bg-surface-3 px-4 py-3">
          <h2
            id="bulk-edit-title"
            className="text-sm font-bold tracking-wide text-fg-bright"
          >
            Edit {rows.length} {rows.length === 1 ? "entry" : "entries"}
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
          <Toggle
            label="Change category"
            enabled={categoryEnabled}
            onToggle={setCategoryEnabled}
          >
            <CategoryPicker
              variant="field"
              categories={categories}
              selectedId={categoryId}
              onSelect={setCategoryId}
              onCreate={onCreateCategory}
            />
          </Toggle>

          <Toggle
            label="Change date"
            enabled={dateEnabled}
            onToggle={setDateEnabled}
          >
            <input
              type="date"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              className="field-input rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-path"
            />
          </Toggle>

          {sharedAmount !== null ? (
            <Toggle
              label="Change amount"
              enabled={amountEnabled}
              onToggle={setAmountEnabled}
              hint={`All ${rows.length} rows share ${sharedAmount}`}
            >
              <input
                type="text"
                inputMode="decimal"
                value={amountText}
                onChange={(e) =>
                  setAmountText(normalizeAmountInput(e.target.value, settings))
                }
                className={`field-input rounded border border-line bg-surface-2 px-2 py-1.5 text-right font-mono text-sm tabular-nums ${
                  parsedAmount !== null && parsedAmount < 0
                    ? "text-danger"
                    : parsedAmount !== null && parsedAmount > 0
                      ? "text-meta"
                      : "text-fg"
                }`}
              />
            </Toggle>
          ) : (
            <p className="mt-3 rounded border border-line bg-surface-3 px-3 py-2 text-xs text-muted">
              Selected rows have different amounts — edit each row individually
              to change them.
            </p>
          )}

          <Toggle
            label="Make each recurring"
            enabled={recurringEnabled}
            onToggle={setRecurringEnabled}
            hint="Replicate every selected row at the dates below; each becomes its own series."
          >
            <RecurrenceForm
              seedDate={seedDate}
              resetKey={recurrenceResetKey}
              includeOnce={false}
              onChange={handleRuleChange}
            />
          </Toggle>
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
            Apply
          </button>
        </footer>
      </div>
    </div>
  );
}

function Toggle({
  label,
  enabled,
  onToggle,
  hint,
  children,
}: {
  label: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="mt-3 rounded border border-line bg-surface-3 p-3">
      <legend className="px-1">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          {label}
        </label>
      </legend>
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
      <div
        className={enabled ? "" : "pointer-events-none opacity-50 select-none"}
        aria-hidden={!enabled}
      >
        {children}
      </div>
    </fieldset>
  );
}
