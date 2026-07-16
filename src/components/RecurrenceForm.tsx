import { useEffect, useMemo, useReducer } from "react";
import { Plus, X } from "lucide-react";

import { unlock } from "../data/achievements";
import { DEFAULT_RECURRENCE_MONTHS } from "../data/constants/defaults";
import { useT } from "../i18n";
import {
  expandRecurrence,
  isIsoDate,
  type RecurrenceRule,
} from "../data/recurrence";
import { addMonthsIso, todayIso } from "../utils/date";
import { ClearableInput, DateField } from "./form";
import {
  recurrenceFormReducer,
  initialRecurrenceFormState,
  type Mode,
} from "./recurrence-form-reducer";

// Whether a rule reaches past a plain monthly-on-a-day cadence — a
// day-based interval, a non-monthly stride (quarterly / yearly /
// every-N), or a day clamped to month-end (29–31, i.e. last day of
// month). Backs the `calendarBender` achievement.
function isCalendarBendingRule(rule: RecurrenceRule | null): boolean {
  if (!rule) return false;
  if (rule.kind === "everyNDays") return true;
  if (rule.kind === "everyNMonths") {
    return rule.intervalMonths !== 1 || rule.dayOfMonth >= 29;
  }
  return false;
}

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
  seedRule,
  historicDates,
  onChange,
}: Props) {
  const t = useT();
  const seedDate = isIsoDate(rawSeed) ? rawSeed : todayIso();
  const horizonEnd = addMonthsIso(seedDate, DEFAULT_RECURRENCE_MONTHS);

  const [state, dispatch] = useReducer(
    recurrenceFormReducer,
    null,
    // Initialised lazily so we only call the factory on first render; the
    // reset effect below handles all subsequent `resetKey` changes via a
    // single atomic `reset` dispatch.
    () =>
      initialRecurrenceFormState(
        seedRule ?? null,
        seedDate,
        horizonEnd,
        includeOnce,
      ),
  );

  const {
    mode,
    onceDate,
    datesList,
    everyNStart,
    everyNEnd,
    everyNDays,
    monthlyStride,
    monthlyDay,
    monthlyOffset,
    monthlyStartMonth,
    monthlyEndMonth,
  } = state;

  useEffect(() => {
    dispatch({
      kind: "reset",
      state: initialRecurrenceFormState(
        seedRule ?? null,
        seedDate,
        horizonEnd,
        includeOnce,
      ),
    });
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
    if (isCalendarBendingRule(rule)) unlock("calendarBender");
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
            onClick={() => dispatch({ kind: "setMode", mode: key })}
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
            <DateField
              value={onceDate}
              onChange={(value) => dispatch({ kind: "setOnceDate", value })}
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
                <DateField
                  value={d}
                  onChange={(value) =>
                    dispatch({
                      kind: "setDateAt",
                      index: i,
                      value,
                    })
                  }
                  className="field-input flex-1 rounded border border-line bg-surface px-2 py-1.5 text-sm text-path"
                />
                <button
                  type="button"
                  onClick={() => dispatch({ kind: "removeDateAt", index: i })}
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
              onClick={() => dispatch({ kind: "addDate", fallback: seedDate })}
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
              <DateField
                value={everyNStart}
                onChange={(value) =>
                  dispatch({ kind: "setEveryNStart", value })
                }
                className="field-input rounded border border-line bg-surface px-2 py-1.5 text-sm text-path"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              <span>{t("recurrenceForm.everyNDaysLabel")}</span>
              <ClearableInput
                type="number"
                min={1}
                value={everyNDays}
                onValueChange={(value) =>
                  dispatch({ kind: "setEveryNDays", value })
                }
                className="field-input w-full rounded border border-line bg-surface px-2 py-1.5 text-right font-mono text-sm text-meta tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              <span>{t("recurrenceForm.end")}</span>
              <DateField
                value={everyNEnd}
                onChange={(value) => dispatch({ kind: "setEveryNEnd", value })}
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
                    onClick={() =>
                      dispatch({ kind: "setMonthlyStride", value: val })
                    }
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
                    onValueChange={(value) =>
                      dispatch({ kind: "setMonthlyStride", value })
                    }
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
                onValueChange={(value) =>
                  dispatch({ kind: "setMonthlyDay", value })
                }
                className="field-input w-full rounded border border-line bg-surface px-2 py-1.5 text-right font-mono text-sm text-meta tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              <span>{t("recurrenceForm.offsetDays")}</span>
              <ClearableInput
                type="number"
                value={monthlyOffset}
                onValueChange={(value) =>
                  dispatch({ kind: "setMonthlyOffset", value })
                }
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
                  onChange={(e) =>
                    dispatch({
                      kind: "setMonthlyStartMonth",
                      value: e.target.value,
                    })
                  }
                  aria-label={t("recurrenceForm.startMonth")}
                  className="field-input min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1.5 text-sm text-path"
                />
                <span aria-hidden className="text-muted">
                  –
                </span>
                <input
                  type="month"
                  value={monthlyEndMonth}
                  onChange={(e) =>
                    dispatch({
                      kind: "setMonthlyEndMonth",
                      value: e.target.value,
                    })
                  }
                  aria-label={t("recurrenceForm.endMonth")}
                  className="field-input min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1.5 text-sm text-path"
                />
              </div>
            </label>
          </div>
        )}
      </div>

      {/* A "once" entry is fully described by the single date field above,
          so a preview block listing that same date is just noise — skip
          it. Other modes (and the promote flow's historic-date overlay,
          which only runs with `includeOnce={false}`) keep the preview. */}
      {mode !== "once" && (
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
      )}
    </div>
  );
}
