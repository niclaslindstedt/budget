import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { DEFAULT_RECURRENCE_MONTHS } from "../data/constants";
import {
  expandRecurrence,
  isIsoDate,
  type RecurrenceRule,
} from "../data/recurrence";

type Mode = "once" | "dates" | "everyNDays" | "monthly";

type Props = {
  seedDate: string;
  // Resets internal state whenever this token changes — used by parent
  // modals so re-opening doesn't keep stale values.
  resetKey: string | number;
  includeOnce?: boolean;
  onChange: (rule: RecurrenceRule | null, dates: string[]) => void;
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayDayOfMonth(): string {
  return String(new Date().getDate());
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

const MONTH_RE = /^\d{4}-\d{2}$/;

function isIsoMonth(value: string): boolean {
  if (!MONTH_RE.test(value)) return false;
  const m = Number(value.slice(5, 7));
  return m >= 1 && m <= 12;
}

function startOfMonth(yyyyMm: string): string {
  return `${yyyyMm}-01`;
}

function endOfMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${yyyyMm}-${String(last).padStart(2, "0")}`;
}

export function RecurrenceForm({
  seedDate: rawSeed,
  resetKey,
  includeOnce = true,
  onChange,
}: Props) {
  const seedDate = isIsoDate(rawSeed) ? rawSeed : todayIso();
  const horizonEnd = addMonthsIso(seedDate, DEFAULT_RECURRENCE_MONTHS);

  const [mode, setMode] = useState<Mode>(includeOnce ? "once" : "monthly");

  const [onceDate, setOnceDate] = useState(seedDate);

  const [datesList, setDatesList] = useState<string[]>([seedDate]);

  const [everyNStart, setEveryNStart] = useState(seedDate);
  const [everyNEnd, setEveryNEnd] = useState(horizonEnd);
  const [everyNDays, setEveryNDays] = useState("14");

  const [monthlyStride, setMonthlyStride] = useState<string>("1");
  const [monthlyDay, setMonthlyDay] = useState(todayDayOfMonth());
  const [monthlyOffset, setMonthlyOffset] = useState("0");
  const [monthlyStartMonth, setMonthlyStartMonth] = useState(
    seedDate.slice(0, 7),
  );
  const [monthlyEndMonth, setMonthlyEndMonth] = useState(
    horizonEnd.slice(0, 7),
  );

  useEffect(() => {
    setMode(includeOnce ? "once" : "monthly");
    setOnceDate(seedDate);
    setDatesList([seedDate]);
    setEveryNStart(seedDate);
    setEveryNEnd(horizonEnd);
    setEveryNDays("14");
    setMonthlyStride("1");
    setMonthlyDay(todayDayOfMonth());
    setMonthlyOffset("0");
    setMonthlyStartMonth(seedDate.slice(0, 7));
    setMonthlyEndMonth(horizonEnd.slice(0, 7));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

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
          !isIsoMonth(monthlyStartMonth) ||
          !isIsoMonth(monthlyEndMonth) ||
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
          start: startOfMonth(monthlyStartMonth),
          end: endOfMonth(monthlyEndMonth),
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
    monthlyStartMonth,
    monthlyEndMonth,
  ]);

  const dates = useMemo(() => (rule ? expandRecurrence(rule) : []), [rule]);

  useEffect(() => {
    onChange(rule, dates);
  }, [rule, dates, onChange]);

  const modeOptions = [
    includeOnce ? (["once", "Once"] as const) : null,
    ["dates", "Specific dates"] as const,
    ["everyNDays", "Every N days"] as const,
    ["monthly", "Monthly / Quarterly / Yearly"] as const,
  ].filter(Boolean) as Array<readonly [Mode, string]>;

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {modeOptions.map(([key, label]) => (
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
            <span>Date</span>
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
            <span className="text-xs text-muted">Dates</span>
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
              <span>Start</span>
              <input
                type="date"
                value={everyNStart}
                onChange={(e) => setEveryNStart(e.target.value)}
                className="field-input rounded border border-line bg-surface px-2 py-1.5 text-sm text-path"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              <span>Every N days</span>
              <input
                type="number"
                min={1}
                value={everyNDays}
                onChange={(e) => setEveryNDays(e.target.value)}
                className="field-input rounded border border-line bg-surface px-2 py-1.5 text-right font-mono text-sm text-meta tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              <span>End</span>
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
              <span>Cadence</span>
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
                  <span>Every N months</span>
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
              <span>Day of month</span>
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
              <span>Offset days</span>
              <input
                type="number"
                value={monthlyOffset}
                onChange={(e) => setMonthlyOffset(e.target.value)}
                className="field-input rounded border border-line bg-surface px-2 py-1.5 text-right font-mono text-sm text-meta tabular-nums"
                placeholder="-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
              <span>Range</span>
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  value={monthlyStartMonth}
                  onChange={(e) => setMonthlyStartMonth(e.target.value)}
                  aria-label="Start month"
                  className="field-input min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1.5 text-sm text-path"
                />
                <span aria-hidden className="text-muted">
                  –
                </span>
                <input
                  type="month"
                  value={monthlyEndMonth}
                  onChange={(e) => setMonthlyEndMonth(e.target.value)}
                  aria-label="End month"
                  className="field-input min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1.5 text-sm text-path"
                />
              </div>
            </label>
          </div>
        )}
      </div>

      <div className="mt-4 rounded border border-line bg-surface-3 p-3 text-xs">
        <div className="mb-1 text-muted">
          Preview{" "}
          <span className="text-fg-bright">
            {dates.length} {dates.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        {dates.length === 0 ? (
          <div className="text-muted">No dates yet.</div>
        ) : (
          <div className="flex flex-wrap gap-1.5 font-mono text-path">
            {dates.slice(0, 24).map((d) => (
              <span
                key={d}
                className="rounded border border-line bg-surface px-1.5 py-0.5"
              >
                {d}
              </span>
            ))}
            {dates.length > 24 && (
              <span className="text-muted">+{dates.length - 24} more</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
