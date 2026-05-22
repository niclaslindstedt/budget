import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Check } from "lucide-react";

import {
  currentFiscalMonthKey,
  findColumnByType,
  groupRowsByMonth,
  isTransferRow,
  previousMonthKey,
  sortMonthKeys,
  sortRowsByDate,
  type RowSortContext,
} from "../data/sheet";
import type {
  AccountBudget,
  EntryType,
  Row,
  Settings,
  Sheet,
} from "../data/types";
import { useLang, useT } from "../i18n";
import { bcp47, type Lang } from "../i18n/locale";
import {
  formatNumber,
  formatRunningBalance,
  formatShortDate,
  withCurrency,
} from "../utils/format";
import { monthColorVar, monthNumberFromKey } from "../utils/monthColor";
import { CategoryIconGlyph } from "./icons";
import { Modal } from "./Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  sheet: Sheet;
  // Decorated AccountBudget from SheetView — its `rows` already include
  // synthesized transaction + history rows and formula-resolved amount
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

// Newest months render first; the user lands on current activity. The
// initial window covers the current fiscal month plus this many past
// months. The IntersectionObserver sentinel below loads `PAGE_SIZE`
// more older months each time it scrolls into view.
const INITIAL_VISIBLE_MONTHS = 3;
const PAGE_SIZE = 6;

const EMPTY_ROWS: Row[] = [];

// Read-only viewer for a single sheet. Renders the same month-grouped
// data the editable SheetView shows — same rows (including synthesized
// transaction / history rows) and same running balances — but stripped
// of every interactive affordance: no inline editing, no add buttons,
// no column drag, no selection. Designed to be opened from the sheet
// header's Eye button for cases where the user wants to read the
// budget without risk of accidental edits.
//
// Older months are loaded lazily — sheets with years of history would
// otherwise blow the DOM on every open. Future-dated months and the
// `undated` bucket render up-front (they're rare and the user expects
// them in view).
export function SheetViewerModal({
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

  // Mirror the sort context SheetView builds so multi-entry days agree
  // between the editable and viewer surfaces.
  const sortContext = useMemo<RowSortContext | undefined>(() => {
    if (!descCol || !amountCol) return undefined;
    return {
      descriptionColumnId: descCol.id,
      amountColumnId: amountCol.id,
      typesById,
    };
  }, [descCol, amountCol, typesById]);

  // Honour the same hide-transfers filter the main view uses. Running
  // balances were computed upstream against the unfiltered rows so the
  // totals stay correct even when transfer rows are suppressed.
  const visibleRows = useMemo(
    () =>
      settings.hideTransfers
        ? item.rows.filter((r) => !isTransferRow(r))
        : item.rows,
    [item.rows, settings.hideTransfers],
  );

  const monthGroups = useMemo(() => {
    if (!dateCol) return new Map<string, Row[]>();
    return groupRowsByMonth(visibleRows, dateCol.id, settings.startOfMonth);
  }, [visibleRows, dateCol, settings.startOfMonth]);

  const sortedMonthGroups = useMemo(() => {
    if (!dateCol) return monthGroups;
    const out = new Map<string, Row[]>();
    for (const [key, rows] of monthGroups) {
      out.set(key, sortRowsByDate(rows, dateCol.id, sortContext));
    }
    return out;
  }, [monthGroups, dateCol, sortContext]);

  const currentMonth = useMemo(
    () => currentFiscalMonthKey(settings.startOfMonth),
    [settings.startOfMonth],
  );

  // How many additional past months past INITIAL_VISIBLE_MONTHS the
  // sentinel has loaded. Reset every time the modal closes so re-opens
  // start from the most-recent activity.
  const [extra, setExtra] = useState(0);
  useEffect(() => {
    if (!open) setExtra(0);
  }, [open]);

  const oldestVisibleMonth = useMemo(() => {
    let key = currentMonth;
    for (let i = 0; i < INITIAL_VISIBLE_MONTHS + extra; i += 1) {
      key = previousMonthKey(key);
    }
    return key;
  }, [currentMonth, extra]);

  // Past months in the window only appear when they contain rows
  // (matches SheetView's pagination semantics). Future-dated months
  // and the `undated` bucket always render so future entries don't
  // require scrolling to a sentinel.
  const visibleMonths = useMemo(() => {
    const keys = new Set<string>();
    keys.add(currentMonth);
    let cursor = currentMonth;
    for (let i = 0; i < INITIAL_VISIBLE_MONTHS + extra; i += 1) {
      cursor = previousMonthKey(cursor);
      const rows = monthGroups.get(cursor);
      if (rows && rows.length > 0) keys.add(cursor);
    }
    for (const key of monthGroups.keys()) {
      if (key === "undated") {
        keys.add(key);
        continue;
      }
      if (key >= cursor) keys.add(key);
    }
    // Descending sort: newest months first so the modal opens on
    // current activity. `sortMonthKeys` returns ascending, so flip.
    return [...sortMonthKeys(keys)].reverse();
  }, [monthGroups, currentMonth, extra]);

  const hasMore = useMemo(() => {
    for (const key of monthGroups.keys()) {
      if (key === "undated") continue;
      if (key < oldestVisibleMonth) return true;
    }
    return false;
  }, [monthGroups, oldestVisibleMonth]);

  // Column widths derived once from the loaded rows so amount /
  // balance stay narrow without truncating any value. Description
  // takes the remainder.
  const colChars = useMemo(() => {
    let amountW = 0;
    let balanceW = 0;
    if (amountCol) {
      for (const row of visibleRows) {
        const v = row.cells[amountCol.id];
        if (typeof v !== "number") continue;
        const full = withCurrency(
          formatNumber(Math.abs(v), settings),
          settings,
        );
        if (full.length > amountW) amountW = full.length;
      }
    }
    if (balanceCol) {
      for (const b of balances.values()) {
        const full = formatRunningBalance(b, settings);
        if (full.length > balanceW) balanceW = full.length;
      }
    }
    return { amount: Math.max(amountW, 4), balance: Math.max(balanceW, 4) };
  }, [visibleRows, amountCol, balanceCol, balances, settings]);

  // Load more older months when the bottom sentinel becomes visible.
  // The scroll container is `Modal.Body`, so we use it as the
  // IntersectionObserver root — `null` would observe against the
  // viewport, which doesn't match the modal's overflow.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    if (!hasMore) return;
    const node = sentinelRef.current;
    const root = scrollRootRef.current;
    if (!node || !root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setExtra((n) => n + PAGE_SIZE);
            break;
          }
        }
      },
      { root, rootMargin: "200px 0px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [open, hasMore, visibleMonths.length]);

  const hasNoRows = item.rows.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="sheet-viewer-modal-title"
      size="max-w-6xl"
      fixedHeight
    >
      <Modal.Header title={sheet.name} onClose={onClose} />
      <Modal.Body
        noPadding
        className="overflow-x-hidden"
        scrollRef={scrollRootRef}
      >
        {hasNoRows ? (
          <p className="px-4 py-6 text-center text-xs text-muted">
            {t("sheet.viewerEmpty")}
          </p>
        ) : (
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-12 md:w-20" />
              {typeCol && <col className="w-9 md:w-10" />}
              <col />
              {amountCol && (
                <col style={{ width: `calc(${colChars.amount}ch + 1rem)` }} />
              )}
              {balanceCol && (
                <col style={{ width: `calc(${colChars.balance}ch + 1rem)` }} />
              )}
            </colgroup>
            <thead
              className="sticky z-10 bg-surface-3 text-xs tracking-wider uppercase text-muted"
              style={{ top: "-1px" }}
            >
              <tr className="border-b border-line">
                <th className="px-1 py-1.5 text-center md:px-2 md:text-left">
                  {t("sheet.date")}
                </th>
                {typeCol && (
                  <th className="px-1 py-1.5 text-center md:px-2">
                    {t("sheet.type")}
                  </th>
                )}
                <th className="px-2 py-1.5 text-left">
                  {t("sheet.description")}
                </th>
                {amountCol && (
                  <th className="px-1 py-1.5 text-right md:px-2">
                    {t("sheet.amount")}
                  </th>
                )}
                {balanceCol && (
                  <th className="px-1 py-1.5 text-right md:px-2">
                    {t("sheet.balance")}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {visibleMonths.map((monthKey) => {
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
                    <tr className="border-b border-line bg-surface-2">
                      <td
                        colSpan={colSpan}
                        className="px-2 py-1 text-xs font-bold tracking-wider uppercase"
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
              {hasMore && (
                <tr>
                  <td colSpan={5} className="p-0">
                    <div
                      ref={sentinelRef}
                      className="h-10"
                      aria-hidden="true"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Modal.Body>
    </Modal>
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
        <td className="px-1 py-1.5 text-center align-top md:px-2">
          {type ? (
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full"
              style={{
                backgroundColor: `color-mix(in srgb, ${type.color} 18%, transparent)`,
                color: type.color,
              }}
              title={type.name}
            >
              <CategoryIconGlyph name={type.glyph} size={12} />
            </span>
          ) : null}
        </td>
      )}
      <td className="px-2 py-1.5 align-top text-fg break-words">{descValue}</td>
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
        <td className="px-1 py-1.5 text-right align-top font-mono tabular-nums whitespace-nowrap text-muted md:px-2">
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
