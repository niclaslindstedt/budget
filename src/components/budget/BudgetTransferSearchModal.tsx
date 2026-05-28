import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  BanknoteArrowDown,
  BanknoteArrowUp,
  CalendarArrowDown,
  CalendarArrowUp,
  Search,
  Sparkles,
} from "lucide-react";

import type {
  SearchEntry,
  SearchMatch,
  SearchResult,
  SearchSort,
} from "../../data/search";
import { runSearch } from "../../data/search";
import type { CategoryIcon, Settings } from "../../data/types";
import type { FloatingPlacement } from "../../hooks";
import { useLang, useT, type TFunction } from "../../i18n";
import { formatDate, formatNumber, withCurrency } from "../../utils/format";
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
  index: readonly SearchEntry[];
  settings: Settings;
  onPick: (entry: SearchEntry) => void;
};

const SORT_MENU_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 220 },
  anchor: "right",
  coordinateSpace: "viewport",
};

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
  index,
  settings,
  onPick,
}: Props) {
  const t = useT();

  const results = useMemo(
    () => runSearch(index, query, sort),
    [index, query, sort],
  );

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
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2 sm:px-4">
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
            className="field-input w-full min-w-0 rounded border border-line bg-surface px-2 py-1.5 text-sm text-fg"
          />
          <SortMenu sort={sort} onSortChange={onSortChange} />
        </div>
        {query.trim() === "" ? (
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
  return (
    <div ref={triggerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("searchTransaction.sortMenuAria")}
        title={current.label(t)}
        className={`inline-flex h-[34px] cursor-pointer items-center gap-1.5 rounded border px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
          open
            ? "border-accent bg-accent/15 text-accent"
            : "border-line bg-surface text-muted hover:border-fg hover:bg-surface-2 hover:text-fg"
        }`}
      >
        <ArrowDownUp size={16} aria-hidden focusable={false} />
        <span aria-hidden className="text-muted">
          {current.glyph}
        </span>
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
