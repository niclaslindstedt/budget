import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { History } from "lucide-react";

import { compareDateStrings } from "../../data/fiscal-month";
import { ageFloorIso } from "../../data/search";
import type {
  Account,
  HistoryEntry,
  Settings,
  TransactionSortOrder,
} from "../../data/types";
import { useLang, useT } from "../../i18n";
import {
  isoToMonthNum,
  monthNumToIsoEnd,
  monthNumToIsoStart,
  monthNumToKey,
  todayIso,
} from "../../utils/date";
import {
  formatBalance,
  formatMonthLabel,
  formatNumber,
  formatShortDate,
  formatYearMonth,
  withCurrency,
} from "../../utils/format";
import { monthColorVar, monthNumberFromKey } from "../../utils/monthColor";
import { amountRangeIO, monthRangeIO } from "../form";
import { ColumnIcon } from "../icons";
import { Modal } from "../Modal";
import { ModalSearchBar } from "../ModalSearchBar";
import { ModalSearchControls } from "../ModalSearchControls";

type Props = {
  open: boolean;
  account: Account | null;
  entries: readonly HistoryEntry[];
  settings: Settings;
  onCancel: () => void;
};

// Read-only viewer for an account's imported history. Shows only the
// raw bank-statement fields the import carried (date, bank
// description, amount, balance) — no resolved type, no user-curated
// description override. User-curated metadata (types, merchant
// hints, renames) belongs to the budget view; this is the unmodified
// bank statement. Visually it mirrors the budget view's coloring
// (per-month tint on the date column and month headers, signed
// green/red on amount and balance) so the columns scan as easily.
export function HistoryModal({
  open,
  account,
  entries,
  settings,
  onCancel,
}: Props) {
  const t = useT();
  const lang = useLang();

  // Viewer-local sort order, seeded from the persisted preference and
  // reset whenever the modal closes — viewing is ephemeral, so steering
  // the order here never mutates the user's global setting. Mirrors the
  // budget viewer's sort toggle.
  const [sortOrder, setSortOrder] = useState<TransactionSortOrder>(
    settings.transactionSortOrder,
  );
  const allSortedEntries = useMemo(() => {
    return [...entries].sort((a, b) =>
      compareDateStrings(a.date, b.date, sortOrder),
    );
  }, [entries, sortOrder]);

  const [query, setQuery] = useState("");

  // Viewer-local filter bands, reset on close like the sort order — none
  // of this touches persisted state. `maxAgeYears` is the coarse
  // calendar window (shared `MAX_AGE_OPTIONS` semantics); the amount /
  // date bands are inclusive, with null on a side meaning "unbounded"
  // so a thumb parked at the natural edge reads as default.
  const [maxAgeYears, setMaxAgeYears] = useState<number | null>(null);
  const [amountMin, setAmountMin] = useState<number | null>(null);
  const [amountMax, setAmountMax] = useState<number | null>(null);
  const [dateMin, setDateMin] = useState<string | null>(null);
  const [dateMax, setDateMax] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      setQuery("");
      setSortOrder(settings.transactionSortOrder);
      setMaxAgeYears(null);
      setAmountMin(null);
      setAmountMax(null);
      setDateMin(null);
      setDateMax(null);
    }
  }, [open, settings.transactionSortOrder]);
  const accountSettings = useMemo(
    () =>
      account?.currency
        ? { ...settings, currency: account.currency }
        : settings,
    [account, settings],
  );
  // Lowercase the searchable fields once per (entries, settings) change.
  // Without this, every keystroke in the search bar walked the full
  // list re-lowercasing each description and re-running `formatBalance`
  // (an `Intl.NumberFormat` call) per entry — a multi-year account
  // with thousands of entries did thousands of Intl format calls per
  // keystroke. The cached haystacks reduce per-keystroke work to a
  // plain `indexOf`.
  const indexedEntries = useMemo(
    () =>
      allSortedEntries.map((entry) => ({
        entry,
        descriptionLc: entry.description.toLowerCase(),
        amountLc: formatBalance(entry.amount, accountSettings).toLowerCase(),
      })),
    [allSortedEntries, accountSettings],
  );
  // Inclusive ISO floor for the time-range quick-pick (null = all time),
  // resolved against today so the window tracks the calendar.
  const ageFloor = useMemo(
    () => ageFloorIso(maxAgeYears, todayIso()),
    [maxAgeYears],
  );

  // Natural amount / date extents over the rows the time-range floor
  // surfaces — what the amount and date sliders seed their domains from.
  // The bands deliberately ignore their own value here (so a slider
  // can't collapse onto itself as the user drags); the time-range floor
  // is honoured so narrowing it tightens both sliders' domains, mirroring
  // the budget search's `searchBounds`. Amount is tracked by magnitude
  // so the band matches both income and spend of the same size.
  const bounds = useMemo(() => {
    let aMin: number | null = null;
    let aMax: number | null = null;
    let dMin: string | null = null;
    let dMax: string | null = null;
    for (const e of allSortedEntries) {
      if (ageFloor !== null && (e.date === "" || e.date < ageFloor)) continue;
      const v = Math.abs(e.amount);
      if (aMin === null || v < aMin) aMin = v;
      if (aMax === null || v > aMax) aMax = v;
      if (e.date !== "") {
        if (dMin === null || e.date < dMin) dMin = e.date;
        if (dMax === null || e.date > dMax) dMax = e.date;
      }
    }
    return { amountMin: aMin, amountMax: aMax, dateMin: dMin, dateMax: dMax };
  }, [allSortedEntries, ageFloor]);

  // Slider domains + current values. A flat / empty domain has nothing
  // to drag, so the section is hidden (`hasAmount` / `hasDate`).
  const hasAmount =
    bounds.amountMin !== null &&
    bounds.amountMax !== null &&
    bounds.amountMax > bounds.amountMin;
  const amountSliderMin = bounds.amountMin ?? 0;
  const amountSliderMax = bounds.amountMax ?? 0;
  const amountValue: [number, number] = [
    amountMin ?? amountSliderMin,
    amountMax ?? amountSliderMax,
  ];

  const dateMinNum =
    bounds.dateMin !== null ? isoToMonthNum(bounds.dateMin) : 0;
  const dateMaxNum =
    bounds.dateMax !== null ? isoToMonthNum(bounds.dateMax) : 0;
  const hasDate =
    bounds.dateMin !== null &&
    bounds.dateMax !== null &&
    dateMaxNum > dateMinNum;
  const dateValue: [number, number] = [
    dateMin !== null ? isoToMonthNum(dateMin) : dateMinNum,
    dateMax !== null ? isoToMonthNum(dateMax) : dateMaxNum,
  ];

  // Store a band as null when its thumb sits at the natural edge so the
  // filter stays "default" on that side and the Filter glyph dims back.
  const commitAmount = useCallback(
    (next: [number, number]) => {
      setAmountMin(
        bounds.amountMin !== null && next[0] <= bounds.amountMin
          ? null
          : next[0],
      );
      setAmountMax(
        bounds.amountMax !== null && next[1] >= bounds.amountMax
          ? null
          : next[1],
      );
    },
    [bounds.amountMin, bounds.amountMax],
  );
  const commitDate = useCallback(
    (next: [number, number]) => {
      setDateMin(next[0] <= dateMinNum ? null : monthNumToIsoStart(next[0]));
      setDateMax(next[1] >= dateMaxNum ? null : monthNumToIsoEnd(next[1]));
    },
    [dateMinNum, dateMaxNum],
  );

  const amountLabel = useCallback(
    (v: number) =>
      withCurrency(formatNumber(v, accountSettings), accountSettings),
    [accountSettings],
  );
  const dateLabel = useCallback(
    (monthNum: number) => formatMonthLabel(monthNumToKey(monthNum), lang),
    [lang],
  );
  const amountIO = useMemo(
    () => amountRangeIO(accountSettings),
    [accountSettings],
  );
  const monthIO = useMemo(() => monthRangeIO(), []);

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: HistoryEntry[] = [];
    for (const indexed of indexedEntries) {
      const e = indexed.entry;
      if (ageFloor !== null && (e.date === "" || e.date < ageFloor)) continue;
      if (amountMin !== null || amountMax !== null) {
        const v = Math.abs(e.amount);
        if (amountMin !== null && v < amountMin) continue;
        if (amountMax !== null && v > amountMax) continue;
      }
      if (dateMin !== null && (e.date === "" || e.date < dateMin)) continue;
      if (dateMax !== null && (e.date === "" || e.date > dateMax)) continue;
      if (
        q !== "" &&
        !(
          indexed.descriptionLc.includes(q) ||
          indexed.amountLc.includes(q) ||
          e.date.includes(q)
        )
      )
        continue;
      out.push(e);
    }
    return out;
  }, [indexedEntries, query, ageFloor, amountMin, amountMax, dateMin, dateMax]);

  const groups = useMemo(() => {
    const result: { monthKey: string; entries: HistoryEntry[] }[] = [];
    for (const e of filteredEntries) {
      const key = e.date.slice(0, 7);
      const last = result[result.length - 1];
      if (last && last.monthKey === key) last.entries.push(e);
      else result.push({ monthKey: key, entries: [e] });
    }
    return result;
  }, [filteredEntries]);

  // Credit-card imports leave `balance` undefined on every row; if no
  // entry carries one, we collapse the Balance column to zero width so
  // the table doesn't leave a visible empty stripe.
  const hasAnyBalance = useMemo(
    () => filteredEntries.some((e) => e.balance !== undefined),
    [filteredEntries],
  );

  const colWidths = useMemo(() => {
    let amountChars = 0;
    let balanceChars = 0;
    for (const e of filteredEntries) {
      const fullAmount = withCurrency(
        formatNumber(Math.abs(e.amount), accountSettings, {
          alwaysTwoFractionDigits: true,
        }),
        accountSettings,
      );
      if (fullAmount.length > amountChars) amountChars = fullAmount.length;
      if (e.balance !== undefined) {
        const fullBalance = withCurrency(
          formatNumber(Math.abs(e.balance), accountSettings, {
            alwaysTwoFractionDigits: true,
          }),
          accountSettings,
        );
        if (fullBalance.length > balanceChars)
          balanceChars = fullBalance.length;
      }
    }
    return {
      amountChars: Math.max(amountChars, 4),
      balanceChars: Math.max(balanceChars, 4),
    };
  }, [filteredEntries, accountSettings]);

  const mobileGridTemplate = useMemo(() => {
    const tracks: string[] = ["auto"];
    tracks.push("minmax(0, 1fr)");
    tracks.push(`minmax(56px, calc(${colWidths.amountChars} * 1ch + 1rem))`);
    if (hasAnyBalance) {
      tracks.push(`minmax(56px, calc(${colWidths.balanceChars} * 1ch + 1rem))`);
    }
    return tracks.join(" ");
  }, [hasAnyBalance, colWidths]);

  return (
    <Modal
      open={open && account !== null}
      onClose={onCancel}
      labelledBy="history-modal-title"
      size="max-w-6xl"
      fixedHeight
    >
      <Modal.Header
        icon={<History size={14} aria-hidden focusable={false} />}
        title={t("history.titleAccount", { name: account?.name ?? "" })}
        onClose={onCancel}
      />
      <ModalSearchBar
        value={query}
        onChange={setQuery}
        placeholder={t("history.searchPlaceholder")}
        actions={
          <ModalSearchControls
            sort={{
              order: sortOrder,
              defaultOrder: settings.transactionSortOrder,
              onToggle: () =>
                setSortOrder((o) =>
                  o === "newestFirst" ? "oldestFirst" : "newestFirst",
                ),
            }}
            timeRange={
              allSortedEntries.length > 0
                ? { value: maxAgeYears, onChange: setMaxAgeYears }
                : undefined
            }
            amount={
              hasAmount
                ? {
                    min: amountSliderMin,
                    max: amountSliderMax,
                    value: amountValue,
                    onChange: commitAmount,
                    format: amountLabel,
                    io: amountIO,
                  }
                : undefined
            }
            dates={
              hasDate
                ? {
                    min: dateMinNum,
                    max: dateMaxNum,
                    value: dateValue,
                    onChange: commitDate,
                    format: dateLabel,
                    io: monthIO,
                  }
                : undefined
            }
          />
        }
      />
      <Modal.Body noPadding className="overflow-x-hidden">
        {allSortedEntries.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted">
            {t("history.noEntries")}
          </p>
        ) : filteredEntries.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted">
            {t("history.searchNoResults")}
          </p>
        ) : (
          <table
            className="budget-viewer-table w-full border-collapse text-sm"
            style={
              {
                "--viewer-row-template": mobileGridTemplate,
              } as CSSProperties
            }
          >
            {/* `top: -1px` closes a subpixel-rounded hairline on iOS Safari
                where scrolled rows would otherwise bleed through above the
                sticky band. Mirrors the `.budget-table > thead` trick. */}
            <thead
              className="sticky z-10 bg-surface-3 text-xs tracking-wider uppercase text-muted"
              style={{ top: "-1px" }}
            >
              <tr className="border-b border-line">
                <th className="px-1 pt-2.5 pb-1.5 text-center whitespace-nowrap md:px-2 md:text-left">
                  <span className="inline-flex items-center gap-1.5 md:gap-2">
                    <ColumnIcon type="date" className="shrink-0 text-accent" />
                    <span className="hidden md:inline">
                      {t("history.date")}
                    </span>
                  </span>
                </th>
                <th className="px-2 pt-2.5 pb-1.5 text-left md:w-full md:pl-4">
                  <span className="inline-flex items-center gap-1.5 md:gap-2">
                    <ColumnIcon
                      type="description"
                      className="shrink-0 text-accent"
                    />
                    <span className="hidden md:inline">
                      {t("history.description")}
                    </span>
                  </span>
                </th>
                <th className="px-1 pt-2.5 pb-1.5 text-right whitespace-nowrap md:px-2">
                  <span className="inline-flex items-center gap-1.5 md:gap-2">
                    <ColumnIcon
                      type="amount"
                      className="shrink-0 text-accent"
                    />
                    <span className="hidden md:inline">
                      {t("history.amount")}
                    </span>
                  </span>
                </th>
                {hasAnyBalance && (
                  <th className="px-1 pt-2.5 pb-1.5 text-right whitespace-nowrap md:pr-2 md:pl-4">
                    <span className="inline-flex items-center gap-1.5 md:gap-2">
                      <ColumnIcon
                        type="balance"
                        className="shrink-0 text-accent"
                      />
                      <span className="hidden md:inline">
                        {t("history.balance")}
                      </span>
                    </span>
                  </th>
                )}
              </tr>
            </thead>
            {/* One <tbody> per month so each month-header tr's
                sticky containing block ends at the next month — gives
                the natural slide-off-as-next-arrives behaviour without
                stacking every label at the same offset. */}
            {groups.map((group) => {
              const colSpan = 3 + (hasAnyBalance ? 1 : 0);
              const monthNum = monthNumberFromKey(group.monthKey);
              const monthColor =
                monthNum !== null ? monthColorVar(monthNum) : undefined;
              const monthColorStyle: CSSProperties | undefined = monthColor
                ? { color: monthColor }
                : undefined;
              return (
                <tbody key={group.monthKey}>
                  <tr className="budget-viewer-fullspan budget-viewer-month-header">
                    <td
                      colSpan={colSpan}
                      className={`border-b border-line bg-surface-2 px-2 text-xs font-bold tracking-wider uppercase ${monthColor ? "" : "text-muted"}`}
                      style={monthColorStyle}
                    >
                      <span className="flex h-7 items-center">
                        {formatYearMonth(group.monthKey, lang)}
                      </span>
                    </td>
                  </tr>
                  {group.entries.map((e) => {
                    const entryMonthNum = monthNumberFromKey(e.date);
                    const entryMonthColor =
                      entryMonthNum !== null
                        ? monthColorVar(entryMonthNum)
                        : undefined;
                    const dateStyle: CSSProperties | undefined = entryMonthColor
                      ? { color: entryMonthColor }
                      : undefined;
                    return (
                      <tr
                        key={e.id}
                        className={`border-b border-line last:border-b-0 ${
                          e.hidden ? "opacity-50" : ""
                        }`}
                      >
                        <td
                          className={`px-1 py-1.5 align-top font-mono text-xs whitespace-nowrap md:px-2 ${entryMonthColor ? "" : "text-muted"}`}
                          style={dateStyle}
                        >
                          {formatShortDate(
                            e.date,
                            settings.shortDateFormat,
                            lang,
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-top break-words md:pl-4">
                          {e.description}
                        </td>
                        <td
                          className={`px-1 py-1.5 text-right align-top font-mono tabular-nums whitespace-nowrap md:px-2 ${
                            e.amount < 0 ? "text-negative" : "text-positive"
                          }`}
                        >
                          {formatBalance(e.amount, accountSettings)}
                        </td>
                        {hasAnyBalance && (
                          <td
                            className={`px-1 py-1.5 text-right align-top font-mono tabular-nums whitespace-nowrap md:pr-2 md:pl-4 ${
                              e.balance === undefined
                                ? "text-muted"
                                : e.balance < 0
                                  ? "text-negative"
                                  : "text-positive"
                            }`}
                          >
                            {e.balance !== undefined
                              ? formatBalance(e.balance, accountSettings)
                              : ""}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        )}
      </Modal.Body>
    </Modal>
  );
}
