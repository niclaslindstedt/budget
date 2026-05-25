import { useEffect, useMemo, useRef } from "react";
import { Search, X } from "lucide-react";

import type { SearchEntry, SearchMatch, SearchResult } from "../data/search";
import { runSearch } from "../data/search";
import type { CategoryIcon, Settings } from "../data/types";
import { useLang, useT } from "../i18n";
import { formatNumber, formatShortDate, withCurrency } from "../utils/format";
import { CategoryIconGlyph } from "./icons";
import { Modal } from "./Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  // Persisted on the parent so the input keeps its text across
  // open / close cycles while the tab stays open.
  query: string;
  onQueryChange: (next: string) => void;
  index: readonly SearchEntry[];
  settings: Settings;
  onPick: (entry: SearchEntry) => void;
};

// Cap a long string with an ellipsis so the result row stays in a
// single line on narrow viewports. Used as a fallback when a match
// hit lands near the start; for hits deep into a long description we
// instead slide a window centred on the match (see `windowedHit`).
const SNIPPET_MAX = 80;

export function TransactionSearchModal({
  open,
  onClose,
  query,
  onQueryChange,
  index,
  settings,
  onPick,
}: Props) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus the input on every open. The Modal portals into <body> so a
  // ref + autoFocus would race the portal mount; use an effect keyed
  // on `open` instead.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const results = useMemo(() => runSearch(index, query), [index, query]);

  function handleClear() {
    onQueryChange("");
    inputRef.current?.focus();
  }

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
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("searchTransaction.placeholder")}
              aria-label={t("searchTransaction.placeholder")}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="field-input w-full min-w-0 rounded border border-line bg-surface px-2 py-1.5 pr-8 text-sm text-fg"
            />
            {query !== "" && (
              <button
                type="button"
                onClick={handleClear}
                aria-label={t("searchTransaction.clear")}
                title={t("searchTransaction.clear")}
                className="absolute top-1/2 right-1 inline-flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
              >
                <X size={14} aria-hidden focusable={false} />
              </button>
            )}
          </div>
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
    ? formatShortDate(entry.iso, settings.shortDateFormat, lang)
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
  field: "description" | "typeName" | "categoryName",
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
