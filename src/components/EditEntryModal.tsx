import { useCallback, useEffect, useMemo, useState } from "react";
import { Minus, Plus, X } from "lucide-react";

import { findColumnByType } from "../data/sheet";
import type { RecurrenceRule } from "../data/recurrence";
import type { Category, Column, EntryType, Row, Settings } from "../data/types";
import {
  formatAmountForInput,
  normalizeAmountInput,
  parseAmount,
} from "../utils/format";
import { useBodyScrollLock } from "../utils/scroll-lock";
import { CategoryPicker } from "./CategoryPicker";
import { RecurrenceForm } from "./RecurrenceForm";
import { TypePicker } from "./TypePicker";

type Props = {
  open: boolean;
  row: Row | null;
  columns: Column[];
  categories: Category[];
  types: readonly EntryType[];
  // Per-type usage counts so the picker can float popular labels to the
  // top of its dropdown. Optional — the picker falls back to insertion
  // order without it.
  typeUsageById?: ReadonlyMap<string, number>;
  settings: Settings;
  // Last known date in the same series — defaults the "until" date when
  // editing a series row. `null` if this row isn't part of a series.
  lastSeriesDate: string | null;
  onClose: () => void;
  onConvertToRecurring: (
    rowId: string,
    dates: string[],
    typeId: string | null,
  ) => void;
  onEditSeries: (rowId: string, patch: EditPatch, scope: EditScope) => void;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
};

export type EditPatch = {
  description: string;
  amount: number | null;
  categoryId: string | null;
  // `undefined` = don't touch the row's type; `null` = clear it (the
  // row falls back to its description as the primary label); a string
  // sets the typeId.
  typeId?: string | null;
};

export type EditScope =
  | { kind: "just-this" }
  | { kind: "future"; untilIso: string | null };

export function EditEntryModal({
  open,
  row,
  columns,
  categories,
  types,
  typeUsageById,
  settings,
  lastSeriesDate,
  onClose,
  onConvertToRecurring,
  onEditSeries,
  onCreateCategory,
  onCreateType,
}: Props) {
  const descCol = useMemo(
    () => findColumnByType(columns, "description"),
    [columns],
  );
  const amountCol = useMemo(
    () => findColumnByType(columns, "amount"),
    [columns],
  );
  const categoryCol = useMemo(
    () => findColumnByType(columns, "category"),
    [columns],
  );
  const dateCol = useMemo(() => findColumnByType(columns, "date"), [columns]);

  const initialDescription =
    descCol && row && typeof row.cells[descCol.id] === "string"
      ? (row.cells[descCol.id] as string)
      : "";
  const initialAmountText =
    amountCol && row && typeof row.cells[amountCol.id] === "number"
      ? formatAmountForInput(
          Math.abs(row.cells[amountCol.id] as number),
          settings,
        )
      : "";
  // Sign lives on a +/- toggle button; default to negative when no amount
  // is set, otherwise mirror the stored sign (treating 0 as negative too).
  const initialNegative =
    amountCol && row && typeof row.cells[amountCol.id] === "number"
      ? (row.cells[amountCol.id] as number) <= 0
      : true;
  const initialCategoryId =
    categoryCol && row && typeof row.cells[categoryCol.id] === "string"
      ? (row.cells[categoryCol.id] as string)
      : null;
  const initialDate =
    dateCol && row && typeof row.cells[dateCol.id] === "string"
      ? (row.cells[dateCol.id] as string)
      : "";
  const initialTypeId: string | null = row?.typeId ?? null;

  const isSeries = !!row?.seriesId;

  const [description, setDescription] = useState(initialDescription);
  const [amount, setAmount] = useState(initialAmountText);
  const [negative, setNegative] = useState(initialNegative);
  const [categoryId, setCategoryId] = useState<string | null>(
    initialCategoryId,
  );
  const [typeId, setTypeId] = useState<string | null>(initialTypeId);

  // "Just this" vs "this and all future"; the latter optionally clamped
  // to a date so temporary price changes can revert later.
  const [scopeKind, setScopeKind] = useState<"just-this" | "future">(
    "just-this",
  );
  const [untilEnabled, setUntilEnabled] = useState(false);
  const [untilDate, setUntilDate] = useState(
    lastSeriesDate ?? initialDate ?? "",
  );

  const [recurringDates, setRecurringDates] = useState<string[]>([]);
  const [recurrenceResetKey, setRecurrenceResetKey] = useState(0);

  useBodyScrollLock(open && !!row);

  useEffect(() => {
    if (!open) return;
    setDescription(initialDescription);
    setAmount(initialAmountText);
    setNegative(initialNegative);
    setCategoryId(initialCategoryId);
    setTypeId(initialTypeId);
    setScopeKind("just-this");
    setUntilEnabled(false);
    setUntilDate(lastSeriesDate ?? initialDate ?? "");
    setRecurringDates([]);
    setRecurrenceResetKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const handleRuleChange = useCallback(
    (_rule: RecurrenceRule | null, dates: string[]) => {
      setRecurringDates(dates);
    },
    [],
  );

  if (!open || !row) return null;

  const parsedAbs = parseAmount(amount);
  const parsedAmount =
    parsedAbs === null
      ? null
      : negative
        ? -Math.abs(parsedAbs)
        : Math.abs(parsedAbs);
  const amountTouched =
    amount !== initialAmountText || negative !== initialNegative;

  function handleAmountChange(next: string) {
    // Sign lives on the toggle button — strip any minus the keyboard or
    // a paste produces so the input only ever shows the absolute value.
    const stripped = next.replace(/-/g, "");
    setAmount(normalizeAmountInput(stripped, settings));
  }

  function toggleSign() {
    setNegative((s) => !s);
  }

  const typeTouched = typeId !== initialTypeId;

  function handleSaveEdit() {
    if (!row) return;
    onEditSeries(
      row.id,
      {
        description: description.trim(),
        amount: amountTouched ? parsedAmount : null,
        categoryId,
        typeId: typeTouched ? typeId : undefined,
      },
      scopeKind === "just-this"
        ? { kind: "just-this" }
        : { kind: "future", untilIso: untilEnabled ? untilDate : null },
    );
  }

  function handleConvert() {
    if (!row) return;
    // Drop the seed date itself if the recurrence includes it — that row
    // already exists, the reducer dedupes anyway, but doing it here keeps
    // the action payload minimal.
    const extras = recurringDates.filter((d) => d !== initialDate);
    if (extras.length === 0) return;
    onConvertToRecurring(row.id, extras, typeId);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-entry-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-lg bg-surface shadow-2xl sm:rounded-lg">
        <header className="flex items-center justify-between border-b border-line bg-surface-3 px-4 py-3">
          <h2
            id="edit-entry-title"
            className="text-sm font-bold tracking-wide text-fg-bright"
          >
            {isSeries ? "Edit recurring entry" : "Promote to recurring"}
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
          {isSeries ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-xs text-muted">Description</span>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="field-input rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
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
                      value={amount}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      className={`field-input flex-1 rounded border border-line bg-surface-2 py-1.5 pr-2 pl-7 text-right font-mono text-sm tabular-nums ${
                        parsedAbs !== null && parsedAbs !== 0
                          ? negative
                            ? "text-negative"
                            : "text-positive"
                          : "text-fg"
                      }`}
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

              <fieldset className="mt-5 rounded border border-line bg-surface-3 p-3">
                <legend className="px-1 text-xs text-muted">Scope</legend>
                <div className="flex flex-col gap-2 text-sm text-fg">
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="edit-scope"
                      value="just-this"
                      checked={scopeKind === "just-this"}
                      onChange={() => setScopeKind("just-this")}
                    />
                    Only this entry ({initialDate || "no date"})
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="edit-scope"
                      value="future"
                      checked={scopeKind === "future"}
                      onChange={() => setScopeKind("future")}
                    />
                    This entry and all future
                  </label>
                  {scopeKind === "future" && (
                    <div className="ml-6 mt-1 flex flex-col gap-1.5 rounded border border-line bg-surface px-2.5 py-2 text-xs text-muted">
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={untilEnabled}
                          onChange={(e) => setUntilEnabled(e.target.checked)}
                        />
                        Stop after a date (temporary change)
                      </label>
                      {untilEnabled && (
                        <input
                          type="date"
                          value={untilDate}
                          onChange={(e) => setUntilDate(e.target.value)}
                          className="field-input rounded border border-line bg-surface-2 px-2 py-1 text-sm text-path"
                        />
                      )}
                    </div>
                  )}
                </div>
              </fieldset>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">
                Generate future entries from this row using a recurrence rule.
                The current row stays as-is and joins the new series.
              </p>
              <div className="mb-4 flex flex-col gap-1">
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
              <RecurrenceForm
                seedDate={initialDate}
                resetKey={recurrenceResetKey}
                includeOnce={false}
                onChange={handleRuleChange}
              />
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
          >
            Cancel
          </button>
          {isSeries ? (
            <button
              type="button"
              onClick={handleSaveEdit}
              className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20"
            >
              Save
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConvert}
              disabled={
                recurringDates.filter((d) => d !== initialDate).length === 0
              }
              className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {(() => {
                const n = recurringDates.filter(
                  (d) => d !== initialDate,
                ).length;
                return `Add ${n} ${n === 1 ? "future entry" : "future entries"}`;
              })()}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
