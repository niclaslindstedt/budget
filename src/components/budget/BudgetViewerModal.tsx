import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { Check, Eye } from "lucide-react";

import {
  currentFiscalMonthKey,
  findColumnByType,
  groupRowsByMonth,
  isTransferRow,
  reverseRowsByDay,
  sortMonthKeys,
  sortRowsByDate,
  type RowSortContext,
} from "../../data/sheet";
import type {
  AccountBudget,
  EntryType,
  Row,
  Settings,
  Sheet,
} from "../../data/types";
import { useLang, useT } from "../../i18n";
import { bcp47, type Lang } from "../../i18n/locale";
import {
  formatNumber,
  formatRunningBalance,
  formatShortDate,
  withCurrency,
} from "../../utils/format";
import { monthColorVar, monthNumberFromKey } from "../../utils/monthColor";
import { CategoryIconGlyph, ColumnIcon } from "../icons";
import { Modal } from "../Modal";
import { ModalSearchBar } from "../ModalSearchBar";

type Props = {
  open: boolean;
  onClose: () => void;
  sheet: Sheet;
  // Decorated AccountBudget from BudgetPage — its `rows` already include
  // synthesized transfer + history rows and formula-resolved amount
  // cells. The viewer just reads; it never writes.
  item: AccountBudget;
  // Running-balance map keyed by row id, computed upstream by
  // `computeBalances` so the running totals match what the editable
  // view shows.
  balances: Map<string, number>;
  types: readonly EntryType[];
  settings: Settings;
};

const monthFormatCache = new Map<Lang, Intl.DateTimeFormat>();

function monthFormatFor(lang: Lang): Intl.DateTimeFormat {
  let f = monthFormatCache.get(lang);
  if (!f) {
    f = new Intl.DateTimeFormat(bcp47(lang), {
      month: "long",
      year: "numeric",
    });
    monthFormatCache.set(lang, f);
  }
  return f;
}

function formatMonth(key: string, lang: Lang, undatedLabel: string): string {
  if (key === "undated") return undatedLabel;
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return monthFormatFor(lang).format(new Date(y, m - 1, 1));
}

const EMPTY_ROWS: Row[] = [];

// Read-only viewer for a single sheet. Renders the same month-grouped
// data the editable BudgetPage shows — same rows (including synthesized
// transfer / history rows) and same running balances — but stripped
// of every interactive affordance: no inline editing, no add buttons,
// no column drag, no selection. Designed to be opened from the sheet
// header's Eye button for cases where the user wants to read the
// budget without risk of accidental edits.
//
// Every month renders up-front so the in-modal search filter sees the
// entire history (matches HistoryModal). No interactive affordances
// hang off the rows, so a years-deep ledger still renders fine.
export function BudgetViewerModal({
  open,
  onClose,
  sheet,
  item,
  balances,
  types,
  settings,
}: Props) {
  const t = useT();
  const lang = useLang();

  const dateCol = useMemo(
    () => findColumnByType(item.columns, "date"),
    [item.columns],
  );
  const descCol = useMemo(
    () => findColumnByType(item.columns, "description"),
    [item.columns],
  );
  const amountCol = useMemo(
    () => findColumnByType(item.columns, "amount"),
    [item.columns],
  );
  const balanceCol = useMemo(
    () => findColumnByType(item.columns, "balance"),
    [item.columns],
  );
  const typeCol = useMemo(
    () => findColumnByType(item.columns, "type"),
    [item.columns],
  );
  const completedCol = useMemo(
    () => findColumnByType(item.columns, "completed"),
    [item.columns],
  );

  const typesById = useMemo(() => {
    const m = new Map<string, EntryType>();
    for (const tp of types) m.set(tp.id, tp);
    return m;
  }, [types]);

  // Mirror the sort context BudgetPage builds so multi-entry days agree
  // between the editable and viewer surfaces.
  const sortContext = useMemo<RowSortContext | undefined>(() => {
    if (!descCol || !amountCol) return undefined;
    return {
      descriptionColumnId: descCol.id,
      amountColumnId: amountCol.id,
      typesById,
    };
  }, [descCol, amountCol, typesById]);

  // In-place filter against description, type name, and the formatted
  // amount text. Resets on every modal close so re-opening starts
  // unfiltered. Applied on top of the hide-transfers filter below.
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Honour the same hide-transfers filter the main view uses. Running
  // balances were computed upstream against the unfiltered rows so the
  // totals stay correct even when transfer rows are suppressed.
  const visibleRows = useMemo(() => {
    const transferFiltered = settings.hideTransfers
      ? item.rows.filter((r) => !isTransferRow(r))
      : item.rows;
    const q = query.trim().toLowerCase();
    if (q === "") return transferFiltered;
    return transferFiltered.filter((row) => {
      if (row.isCorrection) return false;
      if (descCol) {
        const v = row.cells[descCol.id];
        if (typeof v === "string" && v.toLowerCase().includes(q)) return true;
      }
      const typeId = row.typeId ?? null;
      if (typeId) {
        const type = typesById.get(typeId);
        if (type && type.name.toLowerCase().includes(q)) return true;
      }
      if (amountCol) {
        const v = row.cells[amountCol.id];
        if (typeof v === "number") {
          const text = withCurrency(
            formatNumber(Math.abs(v), settings),
            settings,
          );
          if (text.toLowerCase().includes(q)) return true;
        }
      }
      if (dateCol) {
        const v = row.cells[dateCol.id];
        if (typeof v === "string" && v.includes(q)) return true;
      }
      return false;
    });
  }, [item.rows, settings, query, descCol, amountCol, dateCol, typesById]);

  const monthGroups = useMemo(() => {
    if (!dateCol) return new Map<string, Row[]>();
    return groupRowsByMonth(visibleRows, dateCol.id, settings.startOfMonth);
  }, [visibleRows, dateCol, settings.startOfMonth]);

  const sortedMonthGroups = useMemo(() => {
    if (!dateCol) return monthGroups;
    const out = new Map<string, Row[]>();
    const reverse = settings.transactionSortOrder === "newestFirst";
    for (const [key, rows] of monthGroups) {
      const sorted = sortRowsByDate(rows, dateCol.id, sortContext);
      out.set(key, reverse ? reverseRowsByDay(sorted, dateCol.id) : sorted);
    }
    return out;
  }, [monthGroups, dateCol, sortContext, settings.transactionSortOrder]);

  const currentMonth = useMemo(
    () => currentFiscalMonthKey(settings.startOfMonth),
    [settings.startOfMonth],
  );

  // Every month with rows, plus the current fiscal month even when it's
  // empty so the user always lands on "today". Direction tracks the
  // user's transaction-order preference so the modal agrees with the
  // editable sheet view.
  const visibleMonths = useMemo(() => {
    const keys = new Set<string>(monthGroups.keys());
    keys.add(currentMonth);
    const sorted = sortMonthKeys(keys);
    return settings.transactionSortOrder === "newestFirst"
      ? sorted.reverse()
      : sorted;
  }, [monthGroups, currentMonth, settings.transactionSortOrder]);

  // Future months sit above today in the descending list. Hide them
  // behind a clickable "Show future entries" line so the modal opens
  // anchored on today's fiscal month, matching the editable view that
  // tucks "Show earlier months" above its visible window. Search
  // bypasses the gate so a query reveals every match regardless.
  const [showFuture, setShowFuture] = useState(false);
  useEffect(() => {
    if (!open) setShowFuture(false);
  }, [open]);
  const isSearching = query.trim() !== "";
  const futureMonths = useMemo(
    () =>
      visibleMonths.filter((key) => key !== "undated" && key > currentMonth),
    [visibleMonths, currentMonth],
  );
  const renderedMonths = useMemo(() => {
    if (isSearching || showFuture) return visibleMonths;
    return visibleMonths.filter(
      (key) => key === "undated" || key <= currentMonth,
    );
  }, [visibleMonths, isSearching, showFuture, currentMonth]);
  const hasHiddenFuture =
    !isSearching && !showFuture && futureMonths.length > 0;

  const hasNoRows = item.rows.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="budget-viewer-modal-title"
      size="max-w-6xl"
      fixedHeight
    >
      <Modal.Header
        icon={<Eye size={14} aria-hidden focusable={false} />}
        title={sheet.name}
        onClose={onClose}
      />
      <Modal.Body noPadding className="overflow-x-hidden">
        {!hasNoRows && (
          <ModalSearchBar
            value={query}
            onChange={setQuery}
            placeholder={t("sheet.viewerSearchPlaceholder")}
            clearLabel={t("sheet.viewerSearchClear")}
          />
        )}
        {hasNoRows ? (
          <p className="px-4 py-6 text-center text-xs text-muted">
            {t("sheet.viewerEmpty")}
          </p>
        ) : visibleRows.length === 0 && query.trim() !== "" ? (
          <p className="px-4 py-6 text-center text-xs text-muted">
            {t("sheet.viewerSearchNoResults")}
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead
              className="sticky z-10 bg-surface-3 text-xs tracking-wider uppercase text-muted"
              style={{ top: "-1px" }}
            >
              <tr className="border-b border-line">
                <th className="px-1 pt-2.5 pb-1.5 text-center whitespace-nowrap md:px-2 md:text-left">
                  <span className="inline-flex items-center gap-1.5 md:gap-2">
                    <ColumnIcon type="date" className="shrink-0 text-accent" />
                    <span className="hidden md:inline">{t("sheet.date")}</span>
                  </span>
                </th>
                {typeCol && (
                  <th className="px-1 pt-2.5 pb-1.5 text-center whitespace-nowrap md:px-1 md:text-left">
                    <span className="inline-flex items-center gap-1.5 md:gap-2">
                      <ColumnIcon
                        type="type"
                        className="shrink-0 text-accent"
                      />
                      <span className="hidden md:inline">
                        {t("sheet.type")}
                      </span>
                    </span>
                  </th>
                )}
                <th className="px-2 pt-2.5 pb-1.5 text-left md:w-full md:pl-4">
                  <span className="inline-flex items-center gap-1.5 md:gap-2">
                    <ColumnIcon
                      type="description"
                      className="shrink-0 text-accent"
                    />
                    <span className="hidden md:inline">
                      {t("sheet.description")}
                    </span>
                  </span>
                </th>
                {amountCol && (
                  <th className="px-1 pt-2.5 pb-1.5 text-right whitespace-nowrap md:px-2">
                    <span className="inline-flex items-center gap-1.5 md:gap-2">
                      <ColumnIcon
                        type="amount"
                        className="shrink-0 text-accent"
                      />
                      <span className="hidden md:inline">
                        {t("sheet.amount")}
                      </span>
                    </span>
                  </th>
                )}
                {balanceCol && (
                  <th className="px-1 pt-2.5 pb-1.5 text-right whitespace-nowrap md:pr-2 md:pl-4">
                    <span className="inline-flex items-center gap-1.5 md:gap-2">
                      <ColumnIcon
                        type="balance"
                        className="shrink-0 text-accent"
                      />
                      <span className="hidden md:inline">
                        {t("sheet.balance")}
                      </span>
                    </span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {hasHiddenFuture &&
                settings.transactionSortOrder === "newestFirst" && (
                  <ShowFutureEntriesRow
                    label={t("sheet.viewerShowFutureEntries")}
                    onClick={() => setShowFuture(true)}
                    colSpan={
                      2 +
                      (typeCol ? 1 : 0) +
                      (amountCol ? 1 : 0) +
                      (balanceCol ? 1 : 0)
                    }
                  />
                )}
              {renderedMonths.map((monthKey) => {
                const monthNum = monthNumberFromKey(monthKey);
                const monthColor =
                  monthNum !== null ? monthColorVar(monthNum) : undefined;
                const colorStyle: CSSProperties | undefined = monthColor
                  ? { color: monthColor }
                  : undefined;
                const rows = sortedMonthGroups.get(monthKey) ?? EMPTY_ROWS;
                const colSpan =
                  2 +
                  (typeCol ? 1 : 0) +
                  (amountCol ? 1 : 0) +
                  (balanceCol ? 1 : 0);
                return (
                  <Fragment key={monthKey}>
                    <tr>
                      <td
                        colSpan={colSpan}
                        className="sticky top-[32px] z-[9] border-b border-line bg-surface-2 px-2 py-1 text-xs font-bold tracking-wider uppercase"
                        style={colorStyle}
                      >
                        {formatMonth(monthKey, lang, t("sheet.undated"))}
                      </td>
                    </tr>
                    {rows.length === 0 ? (
                      <tr className="border-b border-line">
                        <td
                          colSpan={colSpan}
                          className="px-2 py-1.5 text-center text-xs italic text-muted"
                        >
                          {t("sheet.monthEmpty", {
                            month: formatMonth(
                              monthKey,
                              lang,
                              t("sheet.undated"),
                            ),
                          })}
                        </td>
                      </tr>
                    ) : (
                      rows.map((row) =>
                        row.isCorrection ? (
                          <CorrectionRow
                            key={row.id}
                            row={row}
                            amountCol={amountCol?.id}
                            colSpan={colSpan}
                            settings={settings}
                            correctionLabel={t("sheet.correctionLine")}
                          />
                        ) : (
                          <ViewerRow
                            key={row.id}
                            row={row}
                            dateColId={dateCol?.id}
                            descColId={descCol?.id}
                            amountColId={amountCol?.id}
                            balanceColId={balanceCol?.id}
                            typeColId={typeCol?.id}
                            completedColId={completedCol?.id}
                            typesById={typesById}
                            balances={balances}
                            settings={settings}
                            lang={lang}
                            monthColor={monthColor}
                          />
                        ),
                      )
                    )}
                  </Fragment>
                );
              })}
              {hasHiddenFuture &&
                settings.transactionSortOrder === "oldestFirst" && (
                  <ShowFutureEntriesRow
                    label={t("sheet.viewerShowFutureEntries")}
                    onClick={() => setShowFuture(true)}
                    colSpan={
                      2 +
                      (typeCol ? 1 : 0) +
                      (amountCol ? 1 : 0) +
                      (balanceCol ? 1 : 0)
                    }
                  />
                )}
            </tbody>
          </table>
        )}
      </Modal.Body>
    </Modal>
  );
}

function ShowFutureEntriesRow({
  label,
  onClick,
  colSpan,
}: {
  label: string;
  onClick: () => void;
  colSpan: number;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <button
          type="button"
          onClick={onClick}
          className="group flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-xs text-muted hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden className="h-px flex-1 bg-line" />
          <span className="whitespace-nowrap">{label}</span>
          <span aria-hidden className="h-px flex-1 bg-line" />
        </button>
      </td>
    </tr>
  );
}

type ViewerRowProps = {
  row: Row;
  dateColId: string | undefined;
  descColId: string | undefined;
  amountColId: string | undefined;
  balanceColId: string | undefined;
  typeColId: string | undefined;
  completedColId: string | undefined;
  typesById: ReadonlyMap<string, EntryType>;
  balances: Map<string, number>;
  settings: Settings;
  lang: Lang;
  monthColor: string | undefined;
};

function ViewerRow({
  row,
  dateColId,
  descColId,
  amountColId,
  balanceColId,
  typeColId,
  completedColId,
  typesById,
  balances,
  settings,
  lang,
  monthColor,
}: ViewerRowProps) {
  const dateValue =
    dateColId && typeof row.cells[dateColId] === "string"
      ? (row.cells[dateColId] as string)
      : "";
  const descValue =
    descColId && typeof row.cells[descColId] === "string"
      ? (row.cells[descColId] as string)
      : "";
  const amountValue =
    amountColId && typeof row.cells[amountColId] === "number"
      ? (row.cells[amountColId] as number)
      : null;
  const balanceValue = balanceColId ? balances.get(row.id) : undefined;
  const completed =
    completedColId && row.cells[completedColId] === true ? true : false;
  const typeId = row.typeId ?? null;
  const type = typeId ? (typesById.get(typeId) ?? null) : null;

  const colorStyle: CSSProperties | undefined = monthColor
    ? { color: monthColor }
    : undefined;

  // Uncompleted rows render slightly muted so a glance picks out the
  // settled history versus the still-pending entries — matches the
  // sheet's own faded look for unchecked rows without bringing the
  // checkbox column along.
  const fadeClass = completedColId && !completed ? "opacity-60" : "";

  return (
    <tr className={`border-b border-line last:border-b-0 ${fadeClass}`}>
      <td
        className="px-1 py-1.5 align-top font-mono text-xs font-bold whitespace-nowrap md:px-2 md:font-normal"
        style={colorStyle}
      >
        <span className="inline-flex items-center gap-1">
          {completedColId && completed && (
            <Check
              size={12}
              aria-hidden
              focusable={false}
              className="shrink-0"
            />
          )}
          <span>
            {dateValue
              ? formatShortDate(dateValue, settings.shortDateFormat, lang)
              : ""}
          </span>
        </span>
      </td>
      {typeColId && (
        <td className="px-1 py-1.5 text-center align-top md:px-1 md:text-left">
          {type ? (
            <span
              className="inline-flex max-w-full items-center gap-1.5 rounded-full px-1.5 py-0.5 text-xs"
              style={{
                backgroundColor: `color-mix(in srgb, ${type.color} 18%, transparent)`,
                color: type.color,
              }}
              title={type.name}
            >
              <CategoryIconGlyph
                name={type.glyph}
                size={14}
                className="shrink-0"
              />
              <span className="hidden truncate md:inline">{type.name}</span>
            </span>
          ) : null}
        </td>
      )}
      <td className="px-2 py-1.5 align-top text-fg break-words md:pl-4">
        {descValue}
      </td>
      {amountColId && (
        <td
          className={`px-1 py-1.5 text-right align-top font-mono tabular-nums whitespace-nowrap md:px-2 ${
            amountValue !== null && amountValue < 0
              ? "text-negative"
              : "text-positive"
          }`}
        >
          {amountValue !== null
            ? withCurrency(
                formatNumber(Math.abs(amountValue), settings),
                settings,
              )
            : ""}
        </td>
      )}
      {balanceColId && (
        <td className="px-1 py-1.5 text-right align-top font-mono tabular-nums whitespace-nowrap text-muted md:pr-2 md:pl-4">
          {balanceValue !== undefined
            ? formatRunningBalance(balanceValue, settings)
            : ""}
        </td>
      )}
    </tr>
  );
}

type CorrectionRowProps = {
  row: Row;
  amountCol: string | undefined;
  colSpan: number;
  settings: Settings;
  correctionLabel: string;
};

function CorrectionRow({
  row,
  amountCol,
  colSpan,
  settings,
  correctionLabel,
}: CorrectionRowProps) {
  const amount =
    amountCol && typeof row.cells[amountCol] === "number"
      ? (row.cells[amountCol] as number)
      : 0;
  const sign = amount >= 0 ? "+" : "−";
  const body = withCurrency(formatNumber(Math.abs(amount), settings), settings);
  return (
    <tr className="border-b border-line last:border-b-0">
      <td
        colSpan={colSpan}
        className="px-2 py-1 text-center text-xs italic text-muted"
      >
        ——— {correctionLabel} {sign}
        {body} ———
      </td>
    </tr>
  );
}
