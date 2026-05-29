import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowLeftRight,
  BanknoteArrowDown,
  BanknoteArrowUp,
  Building2,
  CalendarArrowDown,
  CalendarArrowUp,
  Landmark,
  ListChecks,
  Pencil,
  Repeat,
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
import { isFilterActive, matchingEntries, runSearch } from "../../data/search";
import type { CategoryIcon, Settings } from "../../data/types";
import type { FloatingPlacement } from "../../hooks";
import { useLang, useT, type TFunction } from "../../i18n";
import { formatDate, formatNumber, withCurrency } from "../../utils/format";
import { isIosDevice } from "../../utils/platform";
import { BudgetTransferSearchFilterMenu } from "./BudgetTransferSearchFilterMenu";
import { BulkActionBar } from "../BulkActionBar";
import { FloatingPanel } from "../FloatingPanel";
import { ClearableInput } from "../form";
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
  // ones past the result display cap, not just the rows on screen.
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

// The hook seeds the sort at "relevance"; the glyph only highlights when
// the user has moved away from that default.
const DEFAULT_SORT: SearchSort = "relevance";

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
    () => runSearch(index, query, sort, filter, settings.searchRanking),
    [index, query, sort, filter, settings.searchRanking],
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
    const ids = matchingEntries(index, query, filter, settings.searchRanking)
      .filter((e) => e.kind === "user" && e.sheetId === activeSheetId)
      .map((e) => e.rowId);
    onSelectMany(ids);
  }, [
    index,
    query,
    filter,
    settings.searchRanking,
    activeSheetId,
    onSelectMany,
  ]);

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
    if (selectMode || e.key !== "Enter") return;
    // On iOS the soft keyboard's "Search" key is the only Enter source,
    // and the user almost always means "I'm done typing, show me the
    // results" — not "jump to the top hit and close the modal", which
    // strands them with no chance to scan the list they just searched.
    // Dismiss the keyboard (blur) so the results come into view instead.
    if (isIosDevice()) {
      e.preventDefault();
      e.currentTarget.blur();
      return;
    }
    // Elsewhere Enter is a physical Return — jump straight to the top hit.
    if (results.length > 0) {
      e.preventDefault();
      onPick(results[0].entry);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="transaction-search-modal-title"
      // Match the Settings modal's desktop footprint: wider than the
      // default `max-w-lg` and pinned to a stable `95svh` so the result
      // list gets a generous, non-jumping area instead of a cramped card
      // that resizes as hits come and go. Mobile keeps the `100svh`
      // fullscreen shell so the soft-keyboard math (`focusOnOpen` →
      // type-ready input) still keeps the footer above the keyboard.
      size="max-w-3xl"
      fixedHeight
      focusOnOpen
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
              <BudgetTransferSearchFilterMenu
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

// The large glyph on the left of each result tells the user what kind
// of entry the row is at a glance: a bank-imported historic row, a
// synthesized inter-account transfer, a recurring (series) row, or a
// plain row the user added by hand. Recurring borrows the sheet's
// `text-flag` accent (matching the Repeat glyph the budget table draws
// on series rows); the rest stay muted so the colour pop is reserved
// for the recurrence signal.
function entryKindIcon(
  entry: SearchEntry,
  t: TFunction,
): { node: React.ReactNode; title: string; colorClass: string } {
  if (entry.kind === "historic") {
    return {
      node: <Landmark size={18} aria-hidden focusable={false} />,
      title: t("searchTransaction.kindHistoric"),
      colorClass: "text-muted",
    };
  }
  if (entry.kind === "transfer") {
    return {
      node: <ArrowLeftRight size={18} aria-hidden focusable={false} />,
      title: t("searchTransaction.kindTransfer"),
      colorClass: "text-meta",
    };
  }
  if (entry.isRecurring) {
    return {
      node: <Repeat size={18} aria-hidden focusable={false} />,
      title: t("searchTransaction.kindRecurring"),
      colorClass: "text-flag",
    };
  }
  return {
    node: <Pencil size={18} aria-hidden focusable={false} />,
    title: t("searchTransaction.kindUser"),
    colorClass: "text-muted",
  };
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
  const kindIcon = entryKindIcon(entry, t);
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
        title={kindIcon.title}
        className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center ${kindIcon.colorClass}`}
      >
        {kindIcon.node}
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
          <span className="flex min-w-0 items-center gap-3">
            <span className="inline-flex shrink-0 items-center gap-1">
              <span
                aria-hidden
                className="inline-flex shrink-0 items-center justify-center"
                style={{ color: entry.sheetColor }}
              >
                <CategoryIconGlyph
                  name={entry.sheetGlyph as CategoryIcon}
                  size={12}
                />
              </span>
              {entry.sheetName}
            </span>
            {entry.companyName ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <Building2
                  size={12}
                  aria-hidden
                  focusable={false}
                  className="shrink-0"
                />
                <span className="truncate">
                  {renderHighlighted(entry.companyName, match, "companyName")}
                </span>
              </span>
            ) : null}
            {entry.typeName ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <CategoryIconGlyph
                  name={entry.typeGlyph as CategoryIcon}
                  size={12}
                  className="shrink-0"
                  style={{ color: entry.typeColor || undefined }}
                />
                <span className="truncate">
                  {renderHighlighted(entry.typeName, match, "typeName")}
                </span>
              </span>
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
