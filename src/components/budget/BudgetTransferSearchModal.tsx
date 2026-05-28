import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  BanknoteArrowDown,
  BanknoteArrowUp,
  CalendarArrowDown,
  CalendarArrowUp,
  Filter,
  Search,
  Sparkles,
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
  indexBounds,
  isFilterActive,
  runSearch,
} from "../../data/search";
import type { CategoryIcon, Settings } from "../../data/types";
import type { FloatingPlacement } from "../../hooks";
import { useLang, useT, type TFunction } from "../../i18n";
import { formatDate, formatNumber, withCurrency } from "../../utils/format";
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

// One UTC day in milliseconds — the date range slider works in whole
// days so it can drive `RangeSlider`'s numeric domain. The FilterMenu
// maps ISO dates to/from day indices around this constant.
const MS_PER_DAY = 86_400_000;

function isoToDayNum(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / MS_PER_DAY);
}

function dayNumToIso(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
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
}: Props) {
  const t = useT();

  const results = useMemo(
    () => runSearch(index, query, sort, filter),
    [index, query, sort, filter],
  );
  const filterActive = isFilterActive(filter);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && results.length > 0) {
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
                settings={settings}
              />
              <SortMenu sort={sort} onSortChange={onSortChange} />
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
          <ol className="flex flex-col">
            {results.map((result) => (
              <li key={`${result.entry.sheetId}:${result.entry.rowId}`}>
                <ResultRow
                  result={result}
                  settings={settings}
                  onPick={onPick}
                />
              </li>
            ))}
          </ol>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded bg-surface-3 px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface"
        >
          {t("common.close")}
        </button>
      </Modal.Footer>
    </Modal>
  );
}

function ResultRow({
  result,
  settings,
  onPick,
}: {
  result: SearchResult;
  settings: Settings;
  onPick: (entry: SearchEntry) => void;
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
  return (
    <button
      type="button"
      onClick={() => onPick(entry)}
      aria-label={t("searchTransaction.resultAria", {
        sheet: entry.sheetName,
        description: entry.description || t("common.untitled"),
      })}
      className="flex w-full cursor-pointer items-start gap-3 border-b border-line px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-2 sm:px-4"
    >
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
          <span className="truncate text-xs italic text-muted">
            {t("searchTransaction.bankLabel")}
            {": "}
            {renderHighlighted(entry.bankDescription, match, "bankDescription")}
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
  settings,
}: {
  filter: SearchFilter;
  onFilterChange: (next: SearchFilter) => void;
  index: readonly SearchEntry[];
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

  const bounds = useMemo(() => indexBounds(index), [index]);

  const hasAmount =
    bounds.amountMin !== null &&
    bounds.amountMax !== null &&
    bounds.amountMax > bounds.amountMin;
  const hasDate =
    bounds.dateMin !== null &&
    bounds.dateMax !== null &&
    bounds.dateMax > bounds.dateMin;

  const amountValue: [number, number] = [
    filter.amountMin ?? bounds.amountMin ?? 0,
    filter.amountMax ?? bounds.amountMax ?? 0,
  ];
  const dateMinNum = bounds.dateMin !== null ? isoToDayNum(bounds.dateMin) : 0;
  const dateMaxNum = bounds.dateMax !== null ? isoToDayNum(bounds.dateMax) : 0;
  const dateValue: [number, number] = [
    filter.dateMin !== null ? isoToDayNum(filter.dateMin) : dateMinNum,
    filter.dateMax !== null ? isoToDayNum(filter.dateMax) : dateMaxNum,
  ];

  const amountLabel = (v: number) =>
    withCurrency(formatNumber(v, settings), settings);
  const dateLabel = (day: number) =>
    formatDate(dayNumToIso(day), settings.dateFormat, lang);

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
      dateMin: next[0] <= dateMinNum ? null : dayNumToIso(next[0]),
      dateMax: next[1] >= dateMaxNum ? null : dayNumToIso(next[1]),
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
