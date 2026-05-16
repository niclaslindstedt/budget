import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { DEFAULT_RECURRENCE_MONTHS } from "../data/constants";
import {
  expandRecurrence,
  isIsoDate,
  type RecurrenceRule,
} from "../data/recurrence";
import type { Category } from "../data/types";
import { CategoryPicker } from "./CategoryPicker";

type Props = {
  open: boolean;
  initialDate: string;
  categories: Category[];
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

type Mode = "once" | "dates" | "everyNDays" | "monthly";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addMonthsIso(iso: string, months: number): string {
  if (!isIsoDate(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, d));
  const ty = target.getUTCFullYear();
  const tm = String(target.getUTCMonth() + 1).padStart(2, "0");
  const td = String(target.getUTCDate()).padStart(2, "0");
  return `${ty}-${tm}-${td}`;
}

export function ComplexEntryModal({
  open,
  initialDate,
  categories,
  onClose,
  onCreate,
  onCreateCategory,
}: Props) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const seedDate = isIsoDate(initialDate) ? initialDate : todayIso();
  const [mode, setMode] = useState<Mode>("once");

  // Once
  const [onceDate, setOnceDate] = useState(seedDate);

  // Specific dates
  const [datesList, setDatesList] = useState<string[]>([seedDate]);

  // Every N days
  const [everyNStart, setEveryNStart] = useState(seedDate);
  const [everyNEnd, setEveryNEnd] = useState(
    addMonthsIso(seedDate, DEFAULT_RECURRENCE_MONTHS),
  );
  const [everyNDays, setEveryNDays] = useState("14");

  // Monthly / quarterly / yearly
  const [monthlyStride, setMonthlyStride] = useState<"1" | "3" | "12" | string>(
    "1",
  );
  const [monthlyDay, setMonthlyDay] = useState(
    String(Number(seedDate.slice(8, 10)) || 1),
  );
  const [monthlyOffset, setMonthlyOffset] = useState("0");
  const [monthlyStart, setMonthlyStart] = useState(seedDate);
  const [monthlyEnd, setMonthlyEnd] = useState(
    addMonthsIso(seedDate, DEFAULT_RECURRENCE_MONTHS),
  );

  useEffect(() => {
    if (!open) return;
    setDescription("");
    setAmount("");
    setCategoryId(null);
    setMode("once");
    setOnceDate(seedDate);
    setDatesList([seedDate]);
    setEveryNStart(seedDate);
    setEveryNEnd(addMonthsIso(seedDate, DEFAULT_RECURRENCE_MONTHS));
    setEveryNDays("14");
    setMonthlyStride("1");
    setMonthlyDay(String(Number(seedDate.slice(8, 10)) || 1));
    setMonthlyOffset("0");
    setMonthlyStart(seedDate);
    setMonthlyEnd(addMonthsIso(seedDate, DEFAULT_RECURRENCE_MONTHS));
    // seedDate intentionally captured once per open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const rule = useMemo<RecurrenceRule | null>(() => {
    switch (mode) {
      case "once":
        return isIsoDate(onceDate) ? { kind: "once", date: onceDate } : null;
      case "dates": {
        const valid = datesList.filter(isIsoDate);
        return valid.length > 0 ? { kind: "dates", dates: valid } : null;
      }
      case "everyNDays": {
        const n = Number(everyNDays);
        if (
          !isIsoDate(everyNStart) ||
          !isIsoDate(everyNEnd) ||
          !Number.isFinite(n) ||
          n < 1
        ) {
          return null;
        }
        return {
          kind: "everyNDays",
          start: everyNStart,
          end: everyNEnd,
          intervalDays: Math.floor(n),
        };
      }
      case "monthly": {
        const stride = Number(monthlyStride);
        const day = Number(monthlyDay);
        const off = Number(monthlyOffset);
        if (
          !isIsoDate(monthlyStart) ||
          !isIsoDate(monthlyEnd) ||
          !Number.isFinite(stride) ||
          stride < 1 ||
          !Number.isFinite(day) ||
          day < 1 ||
          day > 31 ||
          !Number.isFinite(off)
        ) {
          return null;
        }
        return {
          kind: "everyNMonths",
          intervalMonths: Math.floor(stride),
          dayOfMonth: Math.floor(day),
          offsetDays: Math.floor(off),
          start: monthlyStart,
          end: monthlyEnd,
        };
      }
    }
  }, [
    mode,
    onceDate,
    datesList,
    everyNDays,
    everyNStart,
    everyNEnd,
    monthlyStride,
    monthlyDay,
    monthlyOffset,
    monthlyStart,
    monthlyEnd,
  ]);

  const previewDates = useMemo(() => {
    if (!rule) return [] as string[];
    return expandRecurrence(rule);
  }, [rule]);

  const parsedAmount = useMemo(() => {
    if (amount.trim() === "" || amount.trim() === "-") return null;
    const n = Number(amount.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }, [amount]);

  if (!open) return null;

  function handleSubmit() {
    if (previewDates.length === 0) return;
    if (parsedAmount === null) return;
    onCreate({
      description: description.trim(),
      amount: parsedAmount,
      categoryId,
      dates: previewDates,
    });
  }

  const canSubmit = previewDates.length > 0 && parsedAmount !== null;

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
            <span aria-hidden="true" className="text-accent">
              ${" "}
            </span>
            <span className="text-path">new</span>{" "}
            <span className="text-flag">--complex-entry</span>
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
              <span className="text-xs text-flag">--description</span>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="field-input rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
                placeholder="Rent, Spotify, Salary…"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-flag">--amount</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`field-input rounded border border-line bg-surface-2 px-2 py-1.5 text-right font-mono text-sm tabular-nums ${
                  parsedAmount !== null && parsedAmount < 0
                    ? "text-danger"
                    : parsedAmount !== null && parsedAmount > 0
                      ? "text-meta"
                      : "text-fg"
                }`}
                placeholder="-1200"
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-flag">--category</span>
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
            <div className="mb-2 text-xs text-flag">--recurrence</div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["once", "Once"],
                  ["dates", "Specific dates"],
                  ["everyNDays", "Every N days"],
                  ["monthly", "Monthly / Quarterly / Yearly"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  aria-pressed={mode === key}
                  className={`cursor-pointer rounded border px-2.5 py-1 text-xs ${
                    mode === key
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-line text-muted hover:border-fg hover:text-fg"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-3 rounded border border-line bg-surface-3 p-3">
              {mode === "once" && (
                <label className="flex flex-col gap-1 text-xs text-muted">
                  <span className="text-flag">--date</span>
                  <input
                    type="date"
                    value={onceDate}
                    onChange={(e) => setOnceDate(e.target.value)}
                    className="field-input rounded border border-line bg-surface px-2 py-1.5 text-sm text-path"
                  />
                </label>
              )}

              {mode === "dates" && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs text-flag">--dates</span>
                  {datesList.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="date"
                        value={d}
                        onChange={(e) => {
                          const next = [...datesList];
                          next[i] = e.target.value;
                          setDatesList(next);
                        }}
                        className="field-input flex-1 rounded border border-line bg-surface px-2 py-1.5 text-sm text-path"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDatesList(datesList.filter((_, j) => j !== i))
                        }
                        disabled={datesList.length === 1}
                        aria-label="Remove date"
                        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <X size={14} aria-hidden focusable={false} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setDatesList([
                        ...datesList,
                        datesList[datesList.length - 1] ?? seedDate,
                      ])
                    }
                    className="inline-flex w-fit cursor-pointer items-center gap-1 rounded border border-line px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
                  >
                    <Plus size={12} aria-hidden focusable={false} />
                    Add date
                  </button>
                </div>
              )}

              {mode === "everyNDays" && (
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    <span className="text-flag">--start</span>
                    <input
                      type="date"
                      value={everyNStart}
                      onChange={(e) => setEveryNStart(e.target.value)}
                      className="field-input rounded border border-line bg-surface px-2 py-1.5 text-sm text-path"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    <span className="text-flag">--every-days</span>
                    <input
                      type="number"
                      min={1}
                      value={everyNDays}
                      onChange={(e) => setEveryNDays(e.target.value)}
                      className="field-input rounded border border-line bg-surface px-2 py-1.5 text-right font-mono text-sm text-meta tabular-nums"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    <span className="text-flag">--end</span>
                    <input
                      type="date"
                      value={everyNEnd}
                      onChange={(e) => setEveryNEnd(e.target.value)}
                      className="field-input rounded border border-line bg-surface px-2 py-1.5 text-sm text-path"
                    />
                  </label>
                </div>
              )}

              {mode === "monthly" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
                    <span className="text-flag">--cadence</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ["1", "Monthly"],
                          ["3", "Quarterly"],
                          ["12", "Yearly"],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setMonthlyStride(val)}
                          aria-pressed={monthlyStride === val}
                          className={`cursor-pointer rounded border px-2.5 py-1 text-xs ${
                            monthlyStride === val
                              ? "border-accent bg-accent/10 text-accent"
                              : "border-line text-muted hover:border-fg hover:text-fg"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                      <label className="inline-flex items-center gap-1 text-xs text-muted">
                        <span className="text-flag">--every-months</span>
                        <input
                          type="number"
                          min={1}
                          value={monthlyStride}
                          onChange={(e) => setMonthlyStride(e.target.value)}
                          className="field-input w-14 rounded border border-line bg-surface px-2 py-1 text-right font-mono text-sm text-meta tabular-nums"
                        />
                      </label>
                    </div>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    <span className="text-flag">--day-of-month</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={monthlyDay}
                      onChange={(e) => setMonthlyDay(e.target.value)}
                      className="field-input rounded border border-line bg-surface px-2 py-1.5 text-right font-mono text-sm text-meta tabular-nums"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    <span className="text-flag">--offset-days</span>
                    <input
                      type="number"
                      value={monthlyOffset}
                      onChange={(e) => setMonthlyOffset(e.target.value)}
                      className="field-input rounded border border-line bg-surface px-2 py-1.5 text-right font-mono text-sm text-meta tabular-nums"
                      placeholder="-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    <span className="text-flag">--start</span>
                    <input
                      type="date"
                      value={monthlyStart}
                      onChange={(e) => setMonthlyStart(e.target.value)}
                      className="field-input rounded border border-line bg-surface px-2 py-1.5 text-sm text-path"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    <span className="text-flag">--end</span>
                    <input
                      type="date"
                      value={monthlyEnd}
                      onChange={(e) => setMonthlyEnd(e.target.value)}
                      className="field-input rounded border border-line bg-surface px-2 py-1.5 text-sm text-path"
                    />
                  </label>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 rounded border border-line bg-surface-3 p-3 text-xs">
            <div className="mb-1 text-muted">
              <span className="text-pipe">|</span>{" "}
              <span className="text-flag">preview</span>{" "}
              <span className="text-fg-bright">
                {previewDates.length}{" "}
                {previewDates.length === 1 ? "entry" : "entries"}
              </span>
            </div>
            {previewDates.length === 0 ? (
              <div className="text-muted">No dates yet.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5 font-mono text-path">
                {previewDates.slice(0, 24).map((d) => (
                  <span
                    key={d}
                    className="rounded border border-line bg-surface px-1.5 py-0.5"
                  >
                    {d}
                  </span>
                ))}
                {previewDates.length > 24 && (
                  <span className="text-muted">
                    +{previewDates.length - 24} more
                  </span>
                )}
              </div>
            )}
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
            {previewDates.length > 0
              ? `${previewDates.length} ${previewDates.length === 1 ? "row" : "rows"}`
              : "rows"}
          </button>
        </footer>
      </div>
    </div>
  );
}
