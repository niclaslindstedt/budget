import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { isIsoDate } from "../data/recurrence";
import { useBodyScrollLock } from "../utils/scroll-lock";

type Props = {
  open: boolean;
  // Current ISO value (YYYY-MM-DD) or empty string when unset.
  value: string;
  onClose: () => void;
  onSelect: (iso: string | null) => void;
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Monday-first week. The vision in AGENTS.md lists "week-starts-on" as a
// future per-sheet option, but until that lands the app targets a Swedish
// user, so Monday is the default.
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function todayIso(): string {
  const d = new Date();
  return toIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

// Mon=0, Sun=6 — match WEEKDAY_LABELS so a Date's column maps directly.
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function DatePickerModal({ open, value, onClose, onSelect }: Props) {
  const initialIso = isIsoDate(value) ? value : todayIso();
  const [iy, im] = initialIso.split("-").map(Number);

  const [viewYear, setViewYear] = useState(iy);
  const [viewMonth, setViewMonth] = useState(im);

  useBodyScrollLock(open);

  // Re-sync view to the incoming value each time the modal opens, so
  // re-opening on the same row jumps back to that row's month rather than
  // wherever the user last navigated.
  useEffect(() => {
    if (!open) return;
    const iso = isIsoDate(value) ? value : todayIso();
    const [y, m] = iso.split("-").map(Number);
    setViewYear(y);
    setViewMonth(m);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // Move focus into the dialog so Escape works and assistive tech
    // announces the modal correctly.
    dialogRef.current?.focus();
  }, [open]);

  const cells = useMemo(() => {
    const dim = daysInMonth(viewYear, viewMonth);
    const first = new Date(viewYear, viewMonth - 1, 1);
    const leading = mondayIndex(first);
    const total = Math.ceil((leading + dim) / 7) * 7;
    const out: { iso: string; day: number; inMonth: boolean }[] = [];

    const prevDim = daysInMonth(
      viewMonth === 1 ? viewYear - 1 : viewYear,
      viewMonth === 1 ? 12 : viewMonth - 1,
    );

    for (let i = 0; i < total; i++) {
      const offset = i - leading + 1;
      if (offset < 1) {
        const py = viewMonth === 1 ? viewYear - 1 : viewYear;
        const pm = viewMonth === 1 ? 12 : viewMonth - 1;
        const day = prevDim + offset;
        out.push({ iso: toIso(py, pm, day), day, inMonth: false });
      } else if (offset > dim) {
        const ny = viewMonth === 12 ? viewYear + 1 : viewYear;
        const nm = viewMonth === 12 ? 1 : viewMonth + 1;
        const day = offset - dim;
        out.push({ iso: toIso(ny, nm, day), day, inMonth: false });
      } else {
        out.push({
          iso: toIso(viewYear, viewMonth, offset),
          day: offset,
          inMonth: true,
        });
      }
    }
    return out;
  }, [viewYear, viewMonth]);

  const yearOptions = useMemo(() => {
    const here = new Date().getFullYear();
    const min = Math.min(here - 20, viewYear - 5);
    const max = Math.max(here + 20, viewYear + 5);
    const out: number[] = [];
    for (let y = min; y <= max; y++) out.push(y);
    return out;
  }, [viewYear]);

  if (!open) return null;

  const today = todayIso();
  const selected = isIsoDate(value) ? value : "";

  function shiftMonth(delta: number) {
    const total = viewYear * 12 + (viewMonth - 1) + delta;
    setViewYear(Math.floor(total / 12));
    setViewMonth((total % 12) + 1);
  }

  function commit(iso: string) {
    onSelect(iso);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="date-picker-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-t-lg bg-surface shadow-2xl outline-none sm:rounded-lg"
      >
        <header className="flex items-center justify-between border-b border-line bg-surface-3 px-4 py-3">
          <h2
            id="date-picker-title"
            className="text-sm font-bold tracking-wide text-fg-bright"
          >
            Pick a date
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

        <div className="px-4 py-3">
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded border border-line text-muted hover:border-accent hover:text-accent"
            >
              <ChevronLeft size={16} aria-hidden focusable={false} />
            </button>

            <label className="sr-only" htmlFor="date-picker-month">
              Month
            </label>
            <select
              id="date-picker-month"
              value={viewMonth}
              onChange={(e) => setViewMonth(Number(e.target.value))}
              className="field-input flex-1 cursor-pointer rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg-bright"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="date-picker-year">
              Year
            </label>
            <select
              id="date-picker-year"
              value={viewYear}
              onChange={(e) => setViewYear(Number(e.target.value))}
              className="field-input cursor-pointer rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm tabular-nums text-fg-bright"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded border border-line text-muted hover:border-accent hover:text-accent"
            >
              <ChevronRight size={16} aria-hidden focusable={false} />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] tracking-wide text-muted uppercase">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              const isSelected = cell.iso === selected;
              const isToday = cell.iso === today;
              const base =
                "inline-flex h-9 w-full cursor-pointer items-center justify-center rounded border font-mono text-sm tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";
              const cls = isSelected
                ? "border-accent bg-accent/20 text-accent"
                : isToday
                  ? "border-path text-path hover:bg-surface-2"
                  : cell.inMonth
                    ? "border-transparent text-fg hover:border-line hover:bg-surface-2"
                    : "border-transparent text-muted/60 hover:border-line hover:bg-surface-2";
              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => commit(cell.iso)}
                  className={`${base} ${cls}`}
                  aria-pressed={isSelected}
                  aria-label={cell.iso}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-line bg-surface-3 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              onClose();
            }}
            disabled={!selected}
            className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => commit(today)}
              className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-fg hover:border-accent hover:text-accent"
            >
              Today
            </button>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
            >
              Cancel
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
