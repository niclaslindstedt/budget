import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Check, Eye } from "lucide-react";

import {
  reverseRowsByDay,
  sortRowsByDate,
  type RowSortContext,
} from "../../data/budget/rows";
import { isTransferRow } from "../../data/budget/synthesis";
import {
  currentFiscalMonthKey,
  groupRowsByMonth,
  nextMonthKey,
  sortMonthKeys,
} from "../../data/fiscal-month";
import type {
  AccountBudget,
  Company,
  EntryType,
  Row,
  Settings,
  Sheet,
  TransactionSortOrder,
} from "../../data/types";
import { useStandardColumns } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { type Lang } from "../../i18n/locale";
import { displayTypeName } from "../../i18n/preset-names";
import {
  formatNumber,
  formatRunningBalance,
  formatShortDate,
  formatYearMonth,
  withCurrency,
} from "../../utils/format";
import { indexById } from "../../utils/indexById";
import { monthColorVar, monthNumberFromKey } from "../../utils/monthColor";
import { tintFill } from "../../utils/tint";
import { CategoryIconGlyph, ColumnIcon } from "../icons";
import { Modal } from "../Modal";
import { ModalSearchBar } from "../ModalSearchBar";
import { BudgetViewerSearchControls } from "./BudgetViewerSearchControls";

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
  companies: readonly Company[];
  settings: Settings;
};

function formatMonth(key: string, lang: Lang, undatedLabel: string): string {
  if (key === "undated") return undatedLabel;
  return formatYearMonth(key, lang);
}

const EMPTY_ROWS: Row[] = [];

// Future-month reveal pagination size. Matches the editable BudgetPage so
// clicking the reveal button advances the same number of months whether
// the user is viewing or editing.
const FUTURE_PAGE_SIZE = 3;

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
  companies,
  settings,
}: Props) {
  const t = useT();
  const lang = useLang();

  const { dateCol, descCol, amountCol, balanceCol, typeCol, completedCol } =
    useStandardColumns(item.columns);

  const typesById = useMemo(() => indexById(types), [types]);

  const companiesById = useMemo(() => indexById(companies), [companies]);

  // The "hide transfers" filter only earns its place when the ledger
  // actually carries synthesized transfer rows; "hide uncompleted"
  // only when a completed column exists to read.
  const hasTransferRows = useMemo(
    () => item.rows.some(isTransferRow),
    [item.rows],
  );

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

  // In-place filter against description, type name, company name,
  // and the formatted amount text. Resets on every modal close so
  // re-opening starts unfiltered. Applied on top of the hide-
  // transfers filter below.
  const [query, setQuery] = useState("");

  // Viewer-local sort + filter state, seeded from the persisted
  // preferences and reset whenever the modal closes — viewing is
  // ephemeral, so steering the order or hiding rows here never mutates
  // the user's global settings. The reset effect re-seeds from settings
  // on close so the next open reflects any preference change made in
  // between.
  const [sortOrder, setSortOrder] = useState<TransactionSortOrder>(
    settings.transactionSortOrder,
  );
  const [hideTransfers, setHideTransfers] = useState(settings.hideTransfers);
  const [hideUncompleted, setHideUncompleted] = useState(false);
  useEffect(() => {
    if (!open) {
      setQuery("");
      setSortOrder(settings.transactionSortOrder);
      setHideTransfers(settings.hideTransfers);
      setHideUncompleted(false);
    }
  }, [open, settings.transactionSortOrder, settings.hideTransfers]);

  // Pre-lowercased + pre-formatted search haystacks for every row that
  // could ever show up in the filtered output. Built once per change to
  // the source data (or the hide-transfers preference) so the
  // per-keystroke filter below collapses to a string of cheap `indexOf`
  // calls — the previous shape re-lowercased every description / type
  // name AND re-formatted every amount on every keystroke, which on a
  // 3000-row ledger meant ~9000 fresh string allocations and ~3000
  // `formatNumber` calls per typed character. Mirrors the same
  // optimisation `buildSearchIndex` in `src/data/search.ts` already
  // applies for the global transfer-search modal.
  const searchIndex = useMemo(() => {
    let candidates = hideTransfers
      ? item.rows.filter((r) => !isTransferRow(r))
      : item.rows;
    if (hideUncompleted && completedCol) {
      const completedId = completedCol.id;
      // Only rows that carry an explicit completed boolean (the user's
      // own entries) are subject to the filter; synthesized transfer /
      // history rows and corrections leave the cell unset and stay
      // visible regardless.
      candidates = candidates.filter((r) => {
        const v = r.cells[completedId];
        return typeof v !== "boolean" || v === true;
      });
    }
    return candidates.map((row) => {
      let descLc = "";
      let typeNameLc = "";
      let companyNameLc = "";
      let amountTextLc = "";
      let dateStr = "";
      if (descCol) {
        const v = row.cells[descCol.id];
        if (typeof v === "string") descLc = v.toLowerCase();
      }
      const typeId = row.typeId ?? null;
      if (typeId) {
        const type = typesById.get(typeId);
        if (type) typeNameLc = displayTypeName(type, t).toLowerCase();
      }
      const companyId = row.companyId ?? null;
      if (companyId) {
        const company = companiesById.get(companyId);
        if (company) companyNameLc = company.name.toLowerCase();
      }
      if (amountCol) {
        const v = row.cells[amountCol.id];
        if (typeof v === "number") {
          amountTextLc = withCurrency(
            formatNumber(Math.abs(v), settings),
            settings,
          ).toLowerCase();
        }
      }
      if (dateCol) {
        const v = row.cells[dateCol.id];
        if (typeof v === "string") dateStr = v;
      }
      return { row, descLc, typeNameLc, companyNameLc, amountTextLc, dateStr };
    });
  }, [
    item.rows,
    settings,
    hideTransfers,
    hideUncompleted,
    completedCol,
    descCol,
    amountCol,
    dateCol,
    typesById,
    companiesById,
    t,
  ]);

  // Honour the same hide-transfers filter the main view uses. Running
  // balances were computed upstream against the unfiltered rows so the
  // totals stay correct even when transfer rows are suppressed.
  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return searchIndex.map((e) => e.row);
    const out: Row[] = [];
    for (const e of searchIndex) {
      if (e.row.kind === "correction") continue;
      if (
        e.descLc.includes(q) ||
        e.typeNameLc.includes(q) ||
        e.companyNameLc.includes(q) ||
        e.amountTextLc.includes(q) ||
        e.dateStr.includes(q)
      ) {
        out.push(e.row);
      }
    }
    return out;
  }, [searchIndex, query]);

  const monthGroups = useMemo(() => {
    if (!dateCol) return new Map<string, Row[]>();
    return groupRowsByMonth(visibleRows, dateCol.id, settings.startOfMonth);
  }, [visibleRows, dateCol, settings.startOfMonth]);

  // Compute the longest formatted amount and balance across every row so
  // the mobile grid template can pin those columns to a width that fits
  // the worst case. Mirrors `BudgetPage`'s `colWidths` memo — without it
  // the table falls back on table-auto sizing, which lets a long
  // description squeeze the right-aligned amount + balance columns until
  // they're clipped by the modal body's `overflow-x-hidden`.
  const colWidths = useMemo(() => {
    let dateChars = 0;
    let amountChars = 0;
    let balanceChars = 0;
    if (dateCol) {
      for (const row of item.rows) {
        const v = row.cells[dateCol.id];
        if (typeof v !== "string" || !v) continue;
        const text = formatShortDate(v, settings.shortDateFormat, lang);
        if (text.length > dateChars) dateChars = text.length;
      }
    }
    if (amountCol) {
      for (const row of item.rows) {
        const v = row.cells[amountCol.id];
        if (typeof v !== "number") continue;
        const full = withCurrency(
          formatNumber(Math.abs(v), settings),
          settings,
        );
        if (full.length > amountChars) amountChars = full.length;
      }
    }
    if (balanceCol) {
      for (const b of balances.values()) {
        const full = withCurrency(
          formatNumber(Math.abs(b), settings, {
            alwaysTwoFractionDigits: true,
            alwaysAbbreviate: settings.alwaysAbbreviateBalance,
          }),
          settings,
        );
        if (full.length > balanceChars) balanceChars = full.length;
      }
    }
    return {
      dateChars: Math.max(dateChars, 4),
      amountChars: Math.max(amountChars, 4),
      balanceChars: Math.max(balanceChars, 4),
    };
  }, [item.rows, dateCol, amountCol, balanceCol, balances, settings, lang]);

  // Mobile grid template — one track per rendered column. The date
  // track is pinned to `Nch + 1.5rem` (chars + padding + room for the
  // completed-check icon) so the header's icon-only date cell and the
  // data rows' "✓ 31/12" cells reserve the same width — each `<tr>` is
  // its own grid in mobile mode, so an `auto` date track sizes
  // independently per row and shifts every subsequent column out of
  // alignment between the header and the body. Type is pinned to
  // `40px` for the same reason (header's icon vs rows whose type cell
  // is empty); 40px matches BudgetPage's narrow-track convention.
  // Description takes the flexible `minmax(0, 1fr)` so it shrinks
  // before the amount + balance tracks do, and amount + balance are
  // pinned to `Nch + buffer` using the longest formatted value above.
  // Inline rather than CSS-only because the type / amount / balance
  // columns are optional — pre-declaring every variant in styles.css
  // would be brittle.
  const mobileGridTemplate = useMemo(() => {
    const tracks: string[] = [`calc(${colWidths.dateChars} * 1ch + 1.5rem)`];
    if (typeCol) tracks.push("40px");
    tracks.push("minmax(0, 1fr)"); // description
    if (amountCol) {
      tracks.push(`minmax(56px, calc(${colWidths.amountChars} * 1ch + 1rem))`);
    }
    if (balanceCol) {
      // The running balance is the rightmost track, jammed against the
      // modal edge, so it needs a touch more breathing room than the
      // amount column — a wider floor and buffer keep abbreviated totals
      // ("38K") off the edge instead of clipped by `overflow-x-hidden`.
      tracks.push(
        `minmax(68px, calc(${colWidths.balanceChars} * 1ch + 1.5rem))`,
      );
    }
    return tracks.join(" ");
  }, [typeCol, amountCol, balanceCol, colWidths]);

  const sortedMonthGroups = useMemo(() => {
    if (!dateCol) return monthGroups;
    const out = new Map<string, Row[]>();
    const reverse = sortOrder === "newestFirst";
    for (const [key, rows] of monthGroups) {
      const sorted = sortRowsByDate(rows, dateCol.id, sortContext);
      out.set(key, reverse ? reverseRowsByDay(sorted, dateCol.id) : sorted);
    }
    return out;
  }, [monthGroups, dateCol, sortContext, sortOrder]);

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
    return sortOrder === "newestFirst" ? sorted.reverse() : sorted;
  }, [monthGroups, currentMonth, sortOrder]);

  // Future months sit above today in the descending list. Hide them
  // behind a clickable "Show N future months" line so the modal opens
  // anchored on today's fiscal month, matching the editable view that
  // tucks "Show earlier months" above its visible window. Each click
  // reveals another `FUTURE_PAGE_SIZE` months instead of dumping the
  // entire future at once — mirroring `BudgetPage`'s paginated reveal.
  // Search bypasses the gate so a query reveals every match regardless.
  const [extraFutureMonths, setExtraFutureMonths] = useState(0);
  useEffect(() => {
    if (!open) setExtraFutureMonths(0);
  }, [open]);
  const isSearching = query.trim() !== "";
  const futureCutoff = useMemo(() => {
    let key = currentMonth;
    for (let i = 0; i < extraFutureMonths; i += 1) {
      key = nextMonthKey(key);
    }
    return key;
  }, [currentMonth, extraFutureMonths]);
  const renderedMonths = useMemo(() => {
    if (isSearching) return visibleMonths;
    return visibleMonths.filter(
      (key) => key === "undated" || key <= futureCutoff,
    );
  }, [visibleMonths, isSearching, futureCutoff]);
  const hasHiddenFuture = useMemo(() => {
    if (isSearching) return false;
    for (const key of visibleMonths) {
      if (key === "undated") continue;
      if (key > futureCutoff) return true;
    }
    return false;
  }, [visibleMonths, isSearching, futureCutoff]);

  // Preserve the user's visual position when the reveal button steps the
  // cutoff forward. In newest-first sort the revealed months get inserted
  // above the current-month header; the Modal.Body's scroll position
  // would otherwise stay at scrollTop=0, parking the user in the deepest
  // future instead of the current month they were reading. Capture the
  // current-month header's top before the state change and adjust the
  // scroll container by the delta after layout so clicking the toggle
  // just expands the list. In oldest-first the new months append below
  // the existing content so the delta is 0 and nothing moves.
  const scrollBodyRef = useRef<HTMLDivElement | null>(null);
  const currentMonthHeaderRef = useRef<HTMLTableRowElement | null>(null);
  const futureRevealAnchorRef = useRef<number | null>(null);
  const onShowMoreFutureClick = useCallback(() => {
    const anchor = currentMonthHeaderRef.current;
    futureRevealAnchorRef.current = anchor
      ? anchor.getBoundingClientRect().top
      : null;
    setExtraFutureMonths((n) => n + FUTURE_PAGE_SIZE);
  }, []);
  useLayoutEffect(() => {
    const before = futureRevealAnchorRef.current;
    if (before === null) return;
    futureRevealAnchorRef.current = null;
    const anchor = currentMonthHeaderRef.current;
    const body = scrollBodyRef.current;
    if (!anchor || !body) return;
    const delta = anchor.getBoundingClientRect().top - before;
    if (Math.abs(delta) > 0.5) {
      body.scrollTop += delta;
    }
  }, [extraFutureMonths]);

  // Land on today's fiscal month every time the modal opens. In
  // newest-first sort the current month already sits at the top of the
  // rendered list (future months are tucked behind the reveal button),
  // so the scroll is a near no-op there. Oldest-first stacks past
  // months above today — without this jump the user lands on the
  // earliest month and has to scroll years down to find their current
  // position. The rAF gives the portal + table one paint pass to
  // commit its first layout before we read getBoundingClientRect.
  useLayoutEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      const body = scrollBodyRef.current;
      const anchor = currentMonthHeaderRef.current;
      if (!body || !anchor) return;
      const thead = body.querySelector("thead");
      const theadH = thead?.getBoundingClientRect().height ?? 0;
      const delta =
        anchor.getBoundingClientRect().top -
        body.getBoundingClientRect().top -
        theadH;
      const next = body.scrollTop + delta;
      body.scrollTop = next > 0 ? next : 0;
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

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
      <Modal.Body
        noPadding
        className="overflow-x-hidden"
        scrollRef={scrollBodyRef}
      >
        {!hasNoRows && (
          <ModalSearchBar
            value={query}
            onChange={setQuery}
            placeholder={t("budget.viewerSearchPlaceholder")}
            actions={
              <BudgetViewerSearchControls
                sortOrder={sortOrder}
                defaultSortOrder={settings.transactionSortOrder}
                onToggleSort={() =>
                  setSortOrder((o) =>
                    o === "newestFirst" ? "oldestFirst" : "newestFirst",
                  )
                }
                hideTransfers={hideTransfers}
                onHideTransfersChange={setHideTransfers}
                hideUncompleted={hideUncompleted}
                onHideUncompletedChange={setHideUncompleted}
                canHideTransfers={hasTransferRows}
                canHideUncompleted={Boolean(completedCol)}
              />
            }
          />
        )}
        {hasNoRows ? (
          <p className="px-4 py-6 text-center text-xs text-muted">
            {t("budget.viewerEmpty")}
          </p>
        ) : visibleRows.length === 0 && query.trim() !== "" ? (
          <p className="px-4 py-6 text-center text-xs text-muted">
            {t("budget.viewerSearchNoResults")}
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
            <thead
              className="sticky z-10 bg-surface-3 text-xs tracking-wider uppercase text-muted"
              style={{ top: "-1px" }}
            >
              <tr className="border-b border-line">
                <th className="px-1 pt-2.5 pb-1.5 text-center whitespace-nowrap md:px-2 md:text-left">
                  <span className="inline-flex items-center gap-1.5 md:gap-2">
                    <ColumnIcon type="date" className="shrink-0 text-accent" />
                    <span className="hidden md:inline">{t("budget.date")}</span>
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
                        {t("budget.type")}
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
                      {t("budget.description")}
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
                        {t("budget.amount")}
                      </span>
                    </span>
                  </th>
                )}
                {balanceCol && (
                  <th className="pr-2 pl-1 pt-2.5 pb-1.5 text-right whitespace-nowrap md:pl-4">
                    <span className="inline-flex items-center gap-1.5 md:gap-2">
                      <ColumnIcon
                        type="balance"
                        className="shrink-0 text-accent"
                      />
                      <span className="hidden md:inline">
                        {t("budget.balance")}
                      </span>
                    </span>
                  </th>
                )}
              </tr>
            </thead>
            {hasHiddenFuture && sortOrder === "newestFirst" && (
              <tbody>
                <ShowFutureEntriesRow
                  label={t("budget.showFutureMonths", {
                    n: FUTURE_PAGE_SIZE,
                  })}
                  onClick={onShowMoreFutureClick}
                  colSpan={
                    2 +
                    (typeCol ? 1 : 0) +
                    (amountCol ? 1 : 0) +
                    (balanceCol ? 1 : 0)
                  }
                />
              </tbody>
            )}
            {/* One <tbody> per month so each month-header tr's sticky
                containing block ends at the next month — that's what
                makes the previous label slide off as the next month's
                label arrives. A single shared tbody would keep every
                month-header pinned at the same offset, stacking them on
                top of each other. */}
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
                <tbody key={monthKey}>
                  <tr
                    className="budget-viewer-fullspan budget-viewer-month-header"
                    ref={
                      monthKey === currentMonth
                        ? currentMonthHeaderRef
                        : undefined
                    }
                  >
                    <td
                      colSpan={colSpan}
                      className="border-b border-line bg-surface-2 px-2 text-xs font-bold tracking-wider uppercase"
                      style={colorStyle}
                    >
                      <span className="flex h-7 items-center">
                        {formatMonth(monthKey, lang, t("budget.undated"))}
                      </span>
                    </td>
                  </tr>
                  {rows.length === 0 ? (
                    <tr className="budget-viewer-fullspan border-b border-line">
                      <td
                        colSpan={colSpan}
                        className="px-2 py-1.5 text-center text-xs italic text-muted"
                      >
                        {t("budget.monthEmpty", {
                          month: formatMonth(
                            monthKey,
                            lang,
                            t("budget.undated"),
                          ),
                        })}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) =>
                      row.kind === "correction" ? (
                        <CorrectionRow
                          key={row.id}
                          row={row}
                          amountCol={amountCol?.id}
                          colSpan={colSpan}
                          settings={settings}
                          correctionLabel={t("budget.correctionLine")}
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
                </tbody>
              );
            })}
            {hasHiddenFuture && sortOrder === "oldestFirst" && (
              <tbody>
                <ShowFutureEntriesRow
                  label={t("budget.showFutureMonths", {
                    n: FUTURE_PAGE_SIZE,
                  })}
                  onClick={onShowMoreFutureClick}
                  colSpan={
                    2 +
                    (typeCol ? 1 : 0) +
                    (amountCol ? 1 : 0) +
                    (balanceCol ? 1 : 0)
                  }
                />
              </tbody>
            )}
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
    <tr className="budget-viewer-fullspan">
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
                backgroundColor: tintFill(type.color),
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
        <td className="pr-2 pl-1 py-1.5 text-right align-top font-mono tabular-nums whitespace-nowrap text-muted md:pl-4">
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
    <tr className="budget-viewer-fullspan border-b border-line last:border-b-0">
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
