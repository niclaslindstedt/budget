import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { DEFAULT_RECURRENCE_MONTHS } from "../../data/constants/defaults";
import { useT } from "../../i18n";
import {
  expandRecurrence,
  isIsoDate,
  type RecurrenceRule,
} from "../../data/recurrence";
import { ClearableInput } from "../form";

type Mode = "once" | "dates" | "everyNDays" | "monthly";

type Props = {
  seedDate: string;
  // Resets internal state whenever this token changes — used by parent
  // modals so re-opening doesn't keep stale values.
  resetKey: string | number;
  includeOnce?: boolean;
  // Optional initial rule used to pre-fill the mode and field values on
  // the first render after each `resetKey`. Lets parents like the
  // recurring-candidate promote flow open the form already tuned to the
  // detected cadence instead of the defaults derived from `seedDate`.
  seedRule?: RecurrenceRule | null;
  // Optional already-happened dates (e.g. bank-history matches for the
  // row being promoted) shown alongside the future preview in a muted
  // colour. Display-only: they don't feed into the rule and aren't
  // included in the `dates` returned via `onChange`.
  historicDates?: readonly string[];
  onChange: (rule: RecurrenceRule | null, dates: string[]) => void;
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayDayOfMonth(): string {
  return String(new Date().getDate());
}

function seedDayOfMonth(seed: string): string {
  if (!isIsoDate(seed)) return todayDayOfMonth();
  return String(Number(seed.slice(8, 10)));
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

type RecurrenceFormState = {
  mode: Mode;
  onceDate: string;
  datesList: string[];
  everyNStart: string;
  everyNEnd: string;
  everyNDays: string;
  monthlyStride: string;
  monthlyDay: string;
  monthlyOffset: string;
  monthlyStartMonth: string;
  monthlyEndMonth: string;
};

function initialStateFor(
  seedRule: RecurrenceRule | null,
  seedDate: string,
  horizonEnd: string,
  includeOnce: boolean,
): RecurrenceFormState {
  const defaults: RecurrenceFormState = {
    mode: includeOnce ? "once" : "monthly",
    onceDate: seedDate,
    datesList: [seedDate],
    everyNStart: seedDate,
    everyNEnd: horizonEnd,
    everyNDays: "14",
    monthlyStride: "1",
    monthlyDay: seedDayOfMonth(seedDate),
    monthlyOffset: "0",
    monthlyStartMonth: seedDate.slice(0, 7),
    monthlyEndMonth: horizonEnd.slice(0, 7),
  };
  if (!seedRule) return defaults;
  switch (seedRule.kind) {
    case "once":
      return includeOnce
        ? { ...defaults, mode: "once", onceDate: seedRule.date }
        : { ...defaults, mode: "dates", datesList: [seedRule.date] };
    case "dates": {
      const valid = seedRule.dates.filter(isIsoDate);
      return {
        ...defaults,
        mode: "dates",
        datesList: valid.length > 0 ? valid : [seedDate],
      };
    }
    case "everyNDays":
      return {
        ...defaults,
        mode: "everyNDays",
        everyNStart: isIsoDate(seedRule.start) ? seedRule.start : seedDate,
        everyNEnd: isIsoDate(seedRule.end) ? seedRule.end : horizonEnd,
        everyNDays: String(Math.max(1, Math.floor(seedRule.intervalDays))),
      };
    case "everyNMonths":
      return {
        ...defaults,
        mode: "monthly",
        monthlyStride: String(Math.max(1, Math.floor(seedRule.intervalMonths))),
        monthlyDay: String(
          Math.min(31, Math.max(1, Math.floor(seedRule.dayOfMonth))),
        ),
        monthlyOffset: String(Math.floor(seedRule.offsetDays)),
        monthlyStartMonth: isIsoDate(seedRule.start)
          ? seedRule.start.slice(0, 7)
          : seedDate.slice(0, 7),
        monthlyEndMonth: isIsoDate(seedRule.end)
          ? seedRule.end.slice(0, 7)
          : horizonEnd.slice(0, 7),
      };
  }
}

export function BudgetRecurrenceForm({
  seedDate: rawSeed,
  resetKey,
  includeOnce = true,
  seedRule,
  historicDates,
  onChange,
}: Props) {
  const t = useT();
  const seedDate = isIsoDate(rawSeed) ? rawSeed : todayIso();
  const horizonEnd = addMonthsIso(seedDate, DEFAULT_RECURRENCE_MONTHS);

  const initial = useMemo(
    () => initialStateFor(seedRule ?? null, seedDate, horizonEnd, includeOnce),
    // We only want to recompute the initial state for the first render
    // and on `resetKey` changes — captured by the reset effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [mode, setMode] = useState<Mode>(initial.mode);

  const [onceDate, setOnceDate] = useState(initial.onceDate);

  const [datesList, setDatesList] = useState<string[]>(initial.datesList);

  const [everyNStart, setEveryNStart] = useState(initial.everyNStart);
  const [everyNEnd, setEveryNEnd] = useState(initial.everyNEnd);
  const [everyNDays, setEveryNDays] = useState(initial.everyNDays);

  const [monthlyStride, setMonthlyStride] = useState<string>(
    initial.monthlyStride,
  );
  const [monthlyDay, setMonthlyDay] = useState(initial.monthlyDay);
  const [monthlyOffset, setMonthlyOffset] = useState(initial.monthlyOffset);
  const [monthlyStartMonth, setMonthlyStartMonth] = useState(
    initial.monthlyStartMonth,
  );
  const [monthlyEndMonth, setMonthlyEndMonth] = useState(
    initial.monthlyEndMonth,
  );

  useEffect(() => {
    const next = initialStateFor(
      seedRule ?? null,
      seedDate,
      horizonEnd,
      includeOnce,
    );
    setMode(next.mode);
    setOnceDate(next.onceDate);
    setDatesList(next.datesList);
    setEveryNStart(next.everyNStart);
    setEveryNEnd(next.everyNEnd);
    setEveryNDays(next.everyNDays);
    setMonthlyStride(next.monthlyStride);
    setMonthlyDay(next.monthlyDay);
    setMonthlyOffset(next.monthlyOffset);
    setMonthlyStartMonth(next.monthlyStartMonth);
    setMonthlyEndMonth(next.monthlyEndMonth);
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
    includeOnce ? (["once", t("recurrenceForm.modeOnce")] as const) : null,
    ["dates", t("recurrenceForm.modeDates")] as const,
    ["everyNDays", t("recurrenceForm.modeEveryNDays")] as const,
    ["monthly", t("recurrenceForm.modeMonthly")] as const,
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
            <span>{t("recurrenceForm.date")}</span>
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
            <span className="text-xs text-muted">
              {t("recurrenceForm.dates")}
            </span>
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
                  aria-label={t("recurrenceForm.removeDate")}
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
              {t("recurrenceForm.addDate")}
            </button>
          </div>
        )}

        {mode === "everyNDays" && (
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              <span>{t("recurrenceForm.start")}</span>
              <input
                type="date"
                value={everyNStart}
                onChange={(e) => setEveryNStart(e.target.value)}
                className="field-input rounded border border-line bg-surface px-2 py-1.5 text-sm text-path"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              <span>{t("recurrenceForm.everyNDaysLabel")}</span>
              <ClearableInput
                type="number"
                min={1}
                value={everyNDays}
                onValueChange={setEveryNDays}
                className="field-input w-full rounded border border-line bg-surface px-2 py-1.5 text-right font-mono text-sm text-meta tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              <span>{t("recurrenceForm.end")}</span>
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
              <span>{t("recurrenceForm.cadence")}</span>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["1", t("recurrenceForm.cadenceMonthly")],
                    ["3", t("recurrenceForm.cadenceQuarterly")],
                    ["12", t("recurrenceForm.cadenceYearly")],
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
                  <span>{t("recurrenceForm.cadenceEveryN")}</span>
                  <ClearableInput
                    type="number"
                    min={1}
                    value={monthlyStride}
                    onValueChange={setMonthlyStride}
                    wrapperClassName="w-14"
                    className="field-input w-full rounded border border-line bg-surface px-2 py-1 text-right font-mono text-sm text-meta tabular-nums"
                  />
                </label>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              <span>{t("recurrenceForm.dayOfMonth")}</span>
              <ClearableInput
                type="number"
                min={1}
                max={31}
                value={monthlyDay}
                onValueChange={setMonthlyDay}
                className="field-input w-full rounded border border-line bg-surface px-2 py-1.5 text-right font-mono text-sm text-meta tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              <span>{t("recurrenceForm.offsetDays")}</span>
              <ClearableInput
                type="number"
                value={monthlyOffset}
                onValueChange={setMonthlyOffset}
                className="field-input w-full rounded border border-line bg-surface px-2 py-1.5 text-right font-mono text-sm text-meta tabular-nums"
                placeholder="-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
              <span>{t("recurrenceForm.range")}</span>
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  value={monthlyStartMonth}
                  onChange={(e) => setMonthlyStartMonth(e.target.value)}
                  aria-label={t("recurrenceForm.startMonth")}
                  className="field-input min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1.5 text-sm text-path"
                />
                <span aria-hidden className="text-muted">
                  –
                </span>
                <input
                  type="month"
                  value={monthlyEndMonth}
                  onChange={(e) => setMonthlyEndMonth(e.target.value)}
                  aria-label={t("recurrenceForm.endMonth")}
                  className="field-input min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1.5 text-sm text-path"
                />
              </div>
            </label>
          </div>
        )}
      </div>

      <div className="mt-4 rounded border border-line bg-surface-3 p-3 text-xs">
        <div className="mb-1 text-muted">
          {t("recurrenceForm.previewLabel")}{" "}
          <span className="text-fg-bright">
            {dates.length === 1
              ? t("recurrenceForm.previewEntryOne", { n: dates.length })
              : t("recurrenceForm.previewEntryOther", { n: dates.length })}
          </span>
          {historicDates && historicDates.length > 0 && (
            <>
              {" + "}
              <span className="text-muted">
                {historicDates.length === 1
                  ? t("recurrenceForm.previewHistoricOne", {
                      n: historicDates.length,
                    })
                  : t("recurrenceForm.previewHistoricOther", {
                      n: historicDates.length,
                    })}
              </span>
            </>
          )}
        </div>
        {dates.length === 0 &&
        (!historicDates || historicDates.length === 0) ? (
          <div className="text-muted">{t("recurrenceForm.noDatesYet")}</div>
        ) : (
          <div className="flex flex-wrap gap-1.5 font-mono">
            {historicDates &&
              historicDates.slice(0, 24).map((d, i) => (
                <span
                  key={`hist-${i}-${d}`}
                  className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-muted opacity-70"
                  title={t("recurrenceForm.previewHistoricTitle")}
                >
                  {d}
                </span>
              ))}
            {historicDates && historicDates.length > 24 && (
              <span className="text-muted opacity-70">
                {t("recurrenceForm.morePrefix", {
                  n: historicDates.length - 24,
                })}
              </span>
            )}
            {dates.slice(0, 24).map((d) => (
              <span
                key={d}
                className="rounded border border-line bg-surface px-1.5 py-0.5 text-path"
              >
                {d}
              </span>
            ))}
            {dates.length > 24 && (
              <span className="text-muted">
                {t("recurrenceForm.morePrefix", { n: dates.length - 24 })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
