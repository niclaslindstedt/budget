import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { isIsoDate } from "../data/recurrence";
import { useT } from "../i18n";
import { type MessageKey } from "../i18n";
import { Button, SelectPicker } from "./form";
import { Modal } from "./Modal";

type Props = {
  open: boolean;
  // Current ISO value (YYYY-MM-DD) or empty string when unset.
  value: string;
  onClose: () => void;
  onSelect: (iso: string | null) => void;
};

const MONTH_KEYS: readonly MessageKey[] = [
  "months.long.jan",
  "months.long.feb",
  "months.long.mar",
  "months.long.apr",
  "months.long.may",
  "months.long.jun",
  "months.long.jul",
  "months.long.aug",
  "months.long.sep",
  "months.long.oct",
  "months.long.nov",
  "months.long.dec",
];

const WEEKDAY_KEYS: readonly MessageKey[] = [
  "weekday.short.mon",
  "weekday.short.tue",
  "weekday.short.wed",
  "weekday.short.thu",
  "weekday.short.fri",
  "weekday.short.sat",
  "weekday.short.sun",
];

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
  const t = useT();
  const initialIso = isIsoDate(value) ? value : todayIso();
  const [iy, im] = initialIso.split("-").map(Number);

  const [viewYear, setViewYear] = useState(iy);
  const [viewMonth, setViewMonth] = useState(im);

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
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="date-picker-title"
      size="max-w-sm"
      scrollableBody={false}
      centered
    >
      <Modal.Header title={t("datePicker.title")} onClose={onClose} />
      <div className="px-4 py-3">
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label={t("datePicker.prevMonth")}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded border border-line text-muted hover:border-accent hover:text-accent"
          >
            <ChevronLeft size={16} aria-hidden focusable={false} />
          </button>

          <div className="flex-1">
            <SelectPicker
              value={viewMonth}
              options={MONTH_KEYS.map((key, i) => ({
                value: i + 1,
                label: t(key),
              }))}
              onChange={setViewMonth}
              ariaLabel={t("datePicker.month")}
            />
          </div>

          <SelectPicker
            value={viewYear}
            options={yearOptions.map((y) => ({ value: y, label: y }))}
            onChange={setViewYear}
            ariaLabel={t("datePicker.year")}
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
            panelClassName="font-mono tabular-nums"
          />

          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label={t("datePicker.nextMonth")}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded border border-line text-muted hover:border-accent hover:text-accent"
          >
            <ChevronRight size={16} aria-hidden focusable={false} />
          </button>
        </div>

        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] tracking-wide text-muted uppercase">
          {WEEKDAY_KEYS.map((key) => (
            <div key={key} className="py-1">
              {t(key)}
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
      <Modal.Footer className="justify-between">
        <Button
          variant="secondary"
          onClick={() => {
            onSelect(null);
            onClose();
          }}
          disabled={!selected}
        >
          {t("datePicker.clear")}
        </Button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => commit(today)}
            className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-fg hover:border-accent hover:text-accent"
          >
            {t("datePicker.today")}
          </button>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
