import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  BanknoteArrowDown,
  BanknoteArrowUp,
  Building2,
  CalendarArrowDown,
  CalendarArrowUp,
  Filter,
  Landmark,
  ListChecks,
  Search,
  Sparkles,
  Tag,
} from "lucide-react";

import type {
  SearchEntry,
  SearchFilter,
  SearchMatch,
  SearchResult,
  SearchSort,
} from "../../data/search";
import {
  EMPTY_FILTER,
  isFilterActive,
  matchingEntries,
  runSearch,
  searchBounds,
} from "../../data/search";
import type { CategoryIcon, Settings } from "../../data/types";
import type { FloatingPlacement } from "../../hooks";
import { useLang, useT, type TFunction } from "../../i18n";
import {
  formatDate,
  formatMonthLabel,
  formatNumber,
  withCurrency,
} from "../../utils/format";
import { BulkActionBar } from "../BulkActionBar";
import { FloatingPanel } from "../FloatingPanel";
import { Checkbox, ClearableInput, RangeSlider } from "../form";
import { CategoryIconGlyph } from "../icons";
import { Modal } from "../Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  // Persisted on the parent so the input keeps its text across
  // open / close cycles while the tab stays open.
  query: string;
  onQueryChange: (next: string) => void;
  // Caller-controlled sort order. Lives on the parent so the choice
  // survives modal close like `query` does.
  sort: SearchSort;
  onSortChange: (next: SearchSort) => void;
  // Caller-controlled filter, persisted on the parent like sort / query
  // so the choice survives modal close.
  filter: SearchFilter;
  onFilterChange: (next: SearchFilter) => void;
  index: readonly SearchEntry[];
  settings: Settings;
  onPick: (entry: SearchEntry) => void;
  // Select-many wiring. Drives the same `useBulkSelection` instance and
  // the same bulk modals the BottomBar uses, so results can be picked in
  // bulk and run through Edit / Move / Copy / Delete. Selection is locked
  // to one sheet at a time (the active sheet); only `kind === "user"`
  // rows are selectable.
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;
  activeSheetId: string;
  onToggleSelectMode: () => void;
  onToggleSelect: (rowId: string) => void;
  // Batch-select a set of row ids on the active sheet. Backs "Select
  // all", which reaches every match on the active sheet — including the
  // ones past the MAX_RESULTS display cap, not just the rows on screen.
  onSelectMany: (rowIds: string[]) => void;
  onSelectSheet: (sheetId: string) => void;
  onBulkEdit: () => void;
  onBulkMove: () => void;
  onBulkCopy: () => void;
  onBulkDelete: () => void;
  onBulkCancel: () => void;
};

const SORT_MENU_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 220 },
  anchor: "right",
  coordinateSpace: "viewport",
};

const FILTER_MENU_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 288 },
  anchor: "right",
  coordinateSpace: "viewport",
};

// The hook seeds the sort at "date-desc"; the glyph only highlights when
// the user has moved away from that default.
const DEFAULT_SORT: SearchSort = "date-desc";

// The date range slider works in whole months, not days — day-level
// resolution is more granularity than a transaction-browsing filter
// needs, and a month-stepped thumb is far easier to land on. A "month
// number" is `year * 12 + (month - 1)` so the slider gets a dense
// integer domain; the FilterMenu maps ISO dates to/from it.
function isoToMonthNum(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return y * 12 + (m - 1);
}

function monthNumToKey(month: number): string {
  const y = Math.floor(month / 12);
  const m = (month % 12) + 1;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

// First day of the month — the inclusive lower ISO bound a min thumb
// commits to.
function monthNumToIsoStart(month: number): string {
  return `${monthNumToKey(month)}-01`;
}

// Last day of the month — the inclusive upper ISO bound a max thumb
// commits to, so the band covers the whole selected month. Day 0 of
// the following month resolves to the last day of this one, handling
// February and 30-day months without a lookup table.
function monthNumToIsoEnd(month: number): string {
  const y = Math.floor(month / 12);
  const m = month % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return `${monthNumToKey(month)}-${String(lastDay).padStart(2, "0")}`;
}

// Cap a long string with an ellipsis so the result row stays in a
// single line on narrow viewports. Used as a fallback when a match
// hit lands near the start; for hits deep into a long description we
// instead slide a window centred on the match (see `windowedHit`).
const SNIPPET_MAX = 80;

export function BudgetTransferSearchModal({
  open,
  onClose,
  query,
  onQueryChange,
  sort,
  onSortChange,
  filter,
  onFilterChange,
  index,
  settings,
  onPick,
  selectMode,
  selectedIds,
  activeSheetId,
  onToggleSelectMode,
  onToggleSelect,
  onSelectMany,
  onSelectSheet,
  onBulkEdit,
  onBulkMove,
  onBulkCopy,
  onBulkDelete,
  onBulkCancel,
}: Props) {
  const t = useT();

  const { results, total } = useMemo(
    () => runSearch(index, query, sort, filter),
    [index, query, sort, filter],
  );
  const filterActive = isFilterActive(filter);
  const selectLabel = selectMode
    ? t("app.exitSelectMode")
    : t("app.selectRows");

  // "Select all" reaches the full match set — not just the rendered top
  // 50 — but bulk ops are single-sheet, so it selects only the active
  // sheet's selectable (user-kind) matches. The first manual pick on a
  // result switches the active sheet, so the flow is: tap one row on the
  // sheet you want, then Select all to grab the rest.
  const selectAll = useCallback(() => {
    const ids = matchingEntries(index, query, filter)
      .filter((e) => e.kind === "user" && e.sheetId === activeSheetId)
      .map((e) => e.rowId);
    onSelectMany(ids);
  }, [index, query, filter, activeSheetId, onSelectMany]);

  // Toggle a result's selection, first switching the active sheet to its
  // sheet when starting a fresh selection — bulk ops dispatch against the
  // active sheet, so the selection has to live there. Once a selection
  // exists, off-sheet results are non-selectable, so this only ever
  // switches on the first pick.
  const toggleEntry = useCallback(
    (entry: SearchEntry) => {
      if (entry.sheetId !== activeSheetId) onSelectSheet(entry.sheetId);
      onToggleSelect(entry.rowId);
    },
    [activeSheetId, onSelectSheet, onToggleSelect],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Enter jumps to the top hit — suppressed in select mode, where the
    // list is a multi-pick surface rather than a navigation shortcut.
    if (!selectMode && e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      onPick(results[0].entry);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="transaction-search-modal-title"
    >
      <Modal.Header
        icon={<Search size={14} aria-hidden focusable={false} />}
        title={t("searchTransaction.title")}
        onClose={onClose}
      />
      <Modal.Body noPadding>
        <div className="border-b border-line bg-surface-2 px-3 py-2 sm:px-4">
          <div className="flex items-stretch rounded border border-line bg-surface focus-within:border-accent">
            <ClearableInput
              value={query}
              onValueChange={onQueryChange}
              onKeyDown={handleKeyDown}
              placeholder={t("searchTransaction.placeholder")}
              aria-label={t("searchTransaction.placeholder")}
              clearLabel={t("searchTransaction.clear")}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              wrapperClassName="min-w-0 flex-1"
              className="field-input w-full min-w-0 border-0 bg-transparent px-2 py-1.5 text-sm text-fg focus:outline-none"
            />
            <div className="flex items-center gap-1 border-l border-line px-1">
              <FilterMenu
                filter={filter}
                onFilterChange={onFilterChange}
                index={index}
                query={query}
                settings={settings}
              />
              <SortMenu sort={sort} onSortChange={onSortChange} />
              <button
                type="button"
                onClick={onToggleSelectMode}
                aria-pressed={selectMode}
                aria-label={selectLabel}
                title={selectLabel}
                className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
                  selectMode
                    ? "bg-accent/15 text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-fg"
                }`}
              >
                <ListChecks size={16} aria-hidden focusable={false} />
              </button>
            </div>
          </div>
        </div>
        {query.trim() === "" && !filterActive ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            {t("searchTransaction.emptyHint")}
          </p>
        ) : results.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            {t("searchTransaction.noResults")}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2 px-3 py-1.5 text-xs text-muted sm:px-4">
              <span>
                {total > results.length
                  ? t("searchTransaction.hitsShowing", {
                      total,
                      shown: results.length,
                    })
                  : total === 1
                    ? t("searchTransaction.hitsOne", { n: total })
                    : t("searchTransaction.hitsOther", { n: total })}
              </span>
              {selectMode && (
                <button
                  type="button"
                  onClick={selectAll}
                  className="shrink-0 cursor-pointer text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
                >
                  {t("searchTransaction.selectAll")}
                </button>
              )}
            </div>
            <ol className="flex flex-col">
              {results.map((result) => {
                const { entry } = result;
                const selectable =
                  entry.kind === "user" &&
                  (selectedIds.size === 0 || entry.sheetId === activeSheetId);
                return (
                  <li key={`${entry.sheetId}:${entry.rowId}`}>
                    <ResultRow
                      result={result}
                      settings={settings}
                      onPick={onPick}
                      selectMode={selectMode}
                      selected={selectedIds.has(entry.rowId)}
                      selectable={selectable}
                      onToggle={() => toggleEntry(entry)}
                    />
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        {selectMode ? (
          <div className="flex w-full items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <BulkActionBar
              selectedCount={selectedIds.size}
              onEdit={onBulkEdit}
              onMove={onBulkMove}
              onCopy={onBulkCopy}
              onDelete={onBulkDelete}
              onCancel={onBulkCancel}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded bg-surface-3 px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface"
          >
            {t("common.close")}
          </button>
        )}
      </Modal.Footer>
    </Modal>
  );
}

function ResultRow({
  result,
  settings,
  onPick,
  selectMode,
  selected,
  selectable,
  onToggle,
}: {
  result: SearchResult;
  settings: Settings;
  onPick: (entry: SearchEntry) => void;
  selectMode: boolean;
  selected: boolean;
  selectable: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const { entry, match } = result;
  const dateLabel = entry.iso
    ? formatDate(entry.iso, settings.dateFormat, lang)
    : t("common.notSet");
  const amountLabel =
    entry.amount !== null
      ? withCurrency(formatNumber(entry.amount, settings), settings)
      : "";
  const amountTone =
    entry.amount !== null && entry.amount < 0
      ? "text-negative"
      : entry.amount !== null && entry.amount > 0
        ? "text-positive"
        : "text-muted";
  // In select mode the row toggles selection (only for selectable
  // user-rows); otherwise it navigates. Non-selectable rows in select
  // mode are inert and dimmed.
  const disabled = selectMode && !selectable;
  const description = entry.description || t("common.untitled");
  return (
    <button
      type="button"
      onClick={selectMode ? onToggle : () => onPick(entry)}
      disabled={disabled}
      aria-pressed={selectMode && selectable ? selected : undefined}
      aria-label={
        selectMode
          ? t("searchTransaction.selectResult", { description })
          : t("searchTransaction.resultAria", {
              sheet: entry.sheetName,
              description,
            })
      }
      className={`flex w-full items-start gap-3 border-b border-line px-3 py-2.5 text-left text-sm transition-colors sm:px-4 ${
        disabled
          ? "cursor-default opacity-40"
          : "cursor-pointer hover:bg-surface-2"
      }`}
    >
      {selectMode && selectable && (
        <span
          aria-hidden
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
            selected
              ? "border-accent bg-accent text-page-bg"
              : "border-muted text-transparent"
          }`}
        >
          ✓
        </span>
      )}
      <span
        aria-hidden
        className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center"
        style={{ color: entry.sheetColor }}
      >
        <CategoryIconGlyph name={entry.sheetGlyph as CategoryIcon} size={16} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="truncate font-medium text-fg-bright">
            {renderHighlighted(
              entry.description || t("common.untitled"),
              match,
              "description",
            )}
          </span>
          <span className="ml-auto shrink-0 font-mono text-xs text-muted">
            {dateLabel}
          </span>
        </span>
        <span className="flex items-baseline gap-2 text-xs text-muted">
          <span className="truncate">
            {entry.sheetName}
            {entry.companyName ? (
              <>
                {" · "}
                <Building2
                  size={12}
                  aria-hidden
                  focusable={false}
                  className="mb-0.5 mr-0.5 inline align-middle"
                />
                {renderHighlighted(entry.companyName, match, "companyName")}
              </>
            ) : null}
            {entry.typeName ? (
              <>
                {" · "}
                {renderHighlighted(entry.typeName, match, "typeName")}
              </>
            ) : null}
            {entry.categoryName ? (
              <>
                {" · "}
                {renderHighlighted(entry.categoryName, match, "categoryName")}
              </>
            ) : null}
          </span>
          {amountLabel !== "" && (
            <span className={`ml-auto shrink-0 font-mono ${amountTone}`}>
              {amountLabel}
            </span>
          )}
        </span>
        {match.field === "bankDescription" && entry.bankDescription ? (
          <span
            className="flex items-center gap-1.5 text-xs italic text-muted"
            title={t("searchTransaction.bankLabel")}
          >
            <Landmark
              size={12}
              aria-hidden
              focusable={false}
              className="shrink-0"
            />
            <span className="truncate">
              {renderHighlighted(
                entry.bankDescription,
                match,
                "bankDescription",
              )}
            </span>
          </span>
        ) : null}
        {match.field === "tagNames" && entry.tagNames ? (
          <span
            className="flex items-center gap-1.5 text-xs italic text-muted"
            title={t("searchTransaction.tagsLabel")}
          >
            <Tag size={12} aria-hidden focusable={false} className="shrink-0" />
            <span className="truncate">
              {renderHighlighted(entry.tagNames, match, "tagNames")}
            </span>
          </span>
        ) : null}
      </span>
    </button>
  );
}

// Render `text` with the matched range wrapped in a styled <mark> so
// the user can spot the hit. When `match` isn't a hit on this field
// (or is an amount match), the text renders unwrapped. For very long
// descriptions the snippet slides so the highlighted range stays
// visible inside the truncation window.
function renderHighlighted(
  text: string,
  match: SearchMatch,
  field:
    | "description"
    | "typeName"
    | "categoryName"
    | "companyName"
    | "tagNames"
    | "bankDescription",
) {
  if (match.field !== field) return text;
  const { start, end } = match;
  if (text.length <= SNIPPET_MAX) {
    return (
      <>
        {text.slice(0, start)}
        <mark className="rounded bg-accent/30 px-0.5 text-fg-bright">
          {text.slice(start, end)}
        </mark>
        {text.slice(end)}
      </>
    );
  }
  // Slide the window so the highlighted span sits roughly centred.
  const half = Math.floor((SNIPPET_MAX - (end - start)) / 2);
  let windowStart = Math.max(0, start - half);
  const windowEnd = Math.min(text.length, windowStart + SNIPPET_MAX);
  windowStart = Math.max(0, windowEnd - SNIPPET_MAX);
  const prefix = windowStart > 0 ? "…" : "";
  const suffix = windowEnd < text.length ? "…" : "";
  const localStart = start - windowStart + prefix.length;
  const localEnd = end - windowStart + prefix.length;
  const snippet = prefix + text.slice(windowStart, windowEnd) + suffix;
  return (
    <>
      {snippet.slice(0, localStart)}
      <mark className="rounded bg-accent/30 px-0.5 text-fg-bright">
        {snippet.slice(localStart, localEnd)}
      </mark>
      {snippet.slice(localEnd)}
    </>
  );
}

type SortOption = {
  value: SearchSort;
  glyph: React.ReactNode;
  label: (t: TFunction) => string;
};

// Order mirrors the visual list — relevance first because it's the
// default, then the four directional pairs grouped by field. The
// glyphs come from lucide-react: arrows on the calendar / banknote
// pictograms read as "by date / by amount, in this direction"
// without needing the secondary "asc / desc" caption.
const SORT_OPTIONS: SortOption[] = [
  {
    value: "relevance",
    glyph: <Sparkles size={16} aria-hidden focusable={false} />,
    label: (t) => t("searchTransaction.sortRelevance"),
  },
  {
    value: "date-desc",
    glyph: <CalendarArrowDown size={16} aria-hidden focusable={false} />,
    label: (t) => t("searchTransaction.sortDateDesc"),
  },
  {
    value: "date-asc",
    glyph: <CalendarArrowUp size={16} aria-hidden focusable={false} />,
    label: (t) => t("searchTransaction.sortDateAsc"),
  },
  {
    value: "amount-desc",
    glyph: <BanknoteArrowDown size={16} aria-hidden focusable={false} />,
    label: (t) => t("searchTransaction.sortAmountDesc"),
  },
  {
    value: "amount-asc",
    glyph: <BanknoteArrowUp size={16} aria-hidden focusable={false} />,
    label: (t) => t("searchTransaction.sortAmountAsc"),
  },
];

function SortMenu({
  sort,
  onSortChange,
}: {
  sort: SearchSort;
  onSortChange: (next: SearchSort) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const current = SORT_OPTIONS.find((o) => o.value === sort) ?? SORT_OPTIONS[0];
  // Highlight whenever a non-default sort is chosen (or the menu is
  // open). The current choice is intentionally not shown in the trigger
  // — the glyph just signals "sort is active".
  const active = sort !== DEFAULT_SORT || open;
  return (
    <div ref={triggerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("searchTransaction.sortMenuAria")}
        title={current.label(t)}
        className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
          active
            ? "bg-accent/15 text-accent"
            : "text-muted hover:bg-surface-2 hover:text-fg"
        }`}
      >
        <ArrowDownUp size={16} aria-hidden focusable={false} />
      </button>
      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={triggerRef}
        placement={SORT_MENU_PLACEMENT}
        className="overflow-hidden"
      >
        <div role="menu" aria-label={t("searchTransaction.sortMenuTitle")}>
          <p className="border-b border-line bg-surface-3 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
            {t("searchTransaction.sortMenuTitle")}
          </p>
          <ul className="py-1">
            {SORT_OPTIONS.map((option) => {
              const active = option.value === sort;
              return (
                <li key={option.value} role="none">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      onSortChange(option.value);
                      close();
                    }}
                    className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
                      active
                        ? "bg-accent/10 text-accent"
                        : "text-fg hover:bg-surface"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={active ? "text-accent" : "text-muted"}
                    >
                      {option.glyph}
                    </span>
                    <span className="flex-1 truncate">{option.label(t)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </FloatingPanel>
    </div>
  );
}

function FilterMenu({
  filter,
  onFilterChange,
  index,
  query,
  settings,
}: {
  filter: SearchFilter;
  onFilterChange: (next: SearchFilter) => void;
  index: readonly SearchEntry[];
  query: string;
  settings: Settings;
}) {
  const t = useT();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const active = isFilterActive(filter) || open;

  // Unique budget sheets present in the index, in first-seen order.
  const sheets = useMemo(() => {
    const seen = new Map<
      string,
      { id: string; name: string; glyph: string; color: string }
    >();
    for (const e of index) {
      if (!seen.has(e.sheetId))
        seen.set(e.sheetId, {
          id: e.sheetId,
          name: e.sheetName,
          glyph: e.sheetGlyph,
          color: e.sheetColor,
        });
    }
    return [...seen.values()];
  }, [index]);

  // Seed the range sliders from the rows the current query + categorical
  // filters surface, not the whole workspace — so a four-row "Meds"
  // search shows a 100–500 amount slider instead of 0–981K.
  const bounds = useMemo(
    () => searchBounds(index, query, filter),
    [index, query, filter],
  );

  const hasAmount =
    bounds.amountMin !== null &&
    bounds.amountMax !== null &&
    bounds.amountMax > bounds.amountMin;
  const amountValue: [number, number] = [
    filter.amountMin ?? bounds.amountMin ?? 0,
    filter.amountMax ?? bounds.amountMax ?? 0,
  ];
  const dateMinNum =
    bounds.dateMin !== null ? isoToMonthNum(bounds.dateMin) : 0;
  const dateMaxNum =
    bounds.dateMax !== null ? isoToMonthNum(bounds.dateMax) : 0;
  // Drive the slider only when the matched rows span more than one
  // month — a single-month domain has no range to drag.
  const hasDate =
    bounds.dateMin !== null &&
    bounds.dateMax !== null &&
    dateMaxNum > dateMinNum;
  const dateValue: [number, number] = [
    filter.dateMin !== null ? isoToMonthNum(filter.dateMin) : dateMinNum,
    filter.dateMax !== null ? isoToMonthNum(filter.dateMax) : dateMaxNum,
  ];

  const amountLabel = (v: number) =>
    withCurrency(formatNumber(v, settings), settings);
  const dateLabel = (month: number) =>
    formatMonthLabel(monthNumToKey(month), lang);

  // Store a bound as null when its thumb sits at the natural edge so the
  // filter stays "default" on that side and the Filter glyph dims back.
  function commitAmount(next: [number, number]) {
    onFilterChange({
      ...filter,
      amountMin:
        bounds.amountMin !== null && next[0] <= bounds.amountMin
          ? null
          : next[0],
      amountMax:
        bounds.amountMax !== null && next[1] >= bounds.amountMax
          ? null
          : next[1],
    });
  }
  function commitDate(next: [number, number]) {
    onFilterChange({
      ...filter,
      dateMin: next[0] <= dateMinNum ? null : monthNumToIsoStart(next[0]),
      dateMax: next[1] >= dateMaxNum ? null : monthNumToIsoEnd(next[1]),
    });
  }
  function toggleSheet(id: string, checked: boolean) {
    const set = new Set(filter.sheetIds);
    if (checked) set.add(id);
    else set.delete(id);
    onFilterChange({ ...filter, sheetIds: [...set] });
  }

  return (
    <div ref={triggerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("searchTransaction.filterMenuAria")}
        title={t("searchTransaction.filterMenuTitle")}
        className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
          active
            ? "bg-accent/15 text-accent"
            : "text-muted hover:bg-surface-2 hover:text-fg"
        }`}
      >
        <Filter size={16} aria-hidden focusable={false} />
      </button>
      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={triggerRef}
        placement={FILTER_MENU_PLACEMENT}
        className="overflow-hidden"
      >
        <div
          role="dialog"
          aria-label={t("searchTransaction.filterMenuTitle")}
          className="flex flex-col"
        >
          <p className="border-b border-line bg-surface-3 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
            {t("searchTransaction.filterMenuTitle")}
          </p>
          <div className="flex flex-col gap-3 px-3 py-3">
            <div className="flex flex-col gap-2">
              <Checkbox
                checked={filter.excludeTransfers}
                onChange={(v) =>
                  onFilterChange({ ...filter, excludeTransfers: v })
                }
                label={t("searchTransaction.filterExcludeTransfers")}
              />
              <Checkbox
                checked={filter.excludeHistory}
                onChange={(v) =>
                  onFilterChange({ ...filter, excludeHistory: v })
                }
                label={t("searchTransaction.filterExcludeHistory")}
              />
              <Checkbox
                checked={filter.excludeUnconfirmed}
                onChange={(v) =>
                  onFilterChange({ ...filter, excludeUnconfirmed: v })
                }
                label={t("searchTransaction.filterExcludeUnconfirmed")}
              />
            </div>

            {sheets.length > 1 && (
              <div className="flex flex-col gap-1.5 border-t border-line pt-3">
                <p className="text-xs font-medium text-fg-bright">
                  {t("searchTransaction.filterSheets")}
                </p>
                <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
                  {sheets.map((sheet) => (
                    <Checkbox
                      key={sheet.id}
                      checked={filter.sheetIds.includes(sheet.id)}
                      onChange={(v) => toggleSheet(sheet.id, v)}
                      label={
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className="inline-flex h-4 w-4 items-center justify-center"
                            style={{ color: sheet.color }}
                          >
                            <CategoryIconGlyph
                              name={sheet.glyph as CategoryIcon}
                              size={14}
                            />
                          </span>
                          <span className="truncate">{sheet.name}</span>
                        </span>
                      }
                    />
                  ))}
                </div>
                {filter.sheetIds.length === 0 && (
                  <p className="text-xs text-muted">
                    {t("searchTransaction.filterSheetsAll")}
                  </p>
                )}
              </div>
            )}

            {hasAmount && (
              <div className="flex flex-col gap-1.5 border-t border-line pt-3">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium text-fg-bright">
                    {t("searchTransaction.filterAmount")}
                  </span>
                  <span className="font-mono text-muted">
                    {amountLabel(amountValue[0])} –{" "}
                    {amountLabel(amountValue[1])}
                  </span>
                </div>
                <RangeSlider
                  min={bounds.amountMin ?? 0}
                  max={bounds.amountMax ?? 0}
                  value={amountValue}
                  onChange={commitAmount}
                  ariaLabelMin={t("searchTransaction.filterAmountMin")}
                  ariaLabelMax={t("searchTransaction.filterAmountMax")}
                  formatValueText={amountLabel}
                />
              </div>
            )}

            {hasDate && (
              <div className="flex flex-col gap-1.5 border-t border-line pt-3">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium text-fg-bright">
                    {t("searchTransaction.filterDates")}
                  </span>
                  <span className="font-mono text-muted">
                    {dateLabel(dateValue[0])} – {dateLabel(dateValue[1])}
                  </span>
                </div>
                <RangeSlider
                  min={dateMinNum}
                  max={dateMaxNum}
                  value={dateValue}
                  onChange={commitDate}
                  ariaLabelMin={t("searchTransaction.filterDateMin")}
                  ariaLabelMax={t("searchTransaction.filterDateMax")}
                  formatValueText={dateLabel}
                />
              </div>
            )}

            {isFilterActive(filter) && (
              <button
                type="button"
                onClick={() => onFilterChange(EMPTY_FILTER)}
                className="self-start text-xs text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
              >
                {t("searchTransaction.filterReset")}
              </button>
            )}
          </div>
        </div>
      </FloatingPanel>
    </div>
  );
}
