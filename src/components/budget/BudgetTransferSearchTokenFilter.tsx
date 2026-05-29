import { useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import { useT } from "../../i18n";

// One selectable value in a token filter. `leading` is the small glyph
// / colour swatch rendered before the name in both the match list and
// the selected chip, so the option reads the same way it shows on the
// sheet (a type's pictogram, a tag's colour dot, …).
export type TokenOption = {
  id: string;
  name: string;
  leading?: React.ReactNode;
};

// How many matches to render at once. The list scrolls past this, but
// capping the DOM keeps the popover light when a workspace has hundreds
// of companies / tags — the whole point of the type-to-filter redesign.
const MAX_MATCHES = 50;

// A compact, type-to-filter multi-select used for the company / type /
// category / tag filters in the search popover. Replaces the old
// scrollable checkbox lists, which grew unbounded and dominated the
// popover. Collapsed it is one input plus the chosen values as removable
// chips; typing reveals a filtered match list that commits on click /
// Enter. An empty selection means "no constraint" (search everything),
// matching the rest of the filter popover.
export function BudgetTransferSearchTokenFilter({
  label,
  placeholder,
  options,
  selectedIds,
  onChange,
  headerExtra,
}: {
  label: string;
  placeholder: string;
  options: readonly TokenOption[];
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
  // Optional control rendered on the right of the label row — used by
  // the tag filter for its Any / All combinator toggle.
  headerExtra?: React.ReactNode;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const byId = useMemo(() => {
    const map = new Map<string, TokenOption>();
    for (const o of options) map.set(o.id, o);
    return map;
  }, [options]);

  // Chosen values, in selection order, resolved back to their option.
  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => byId.get(id))
        .filter((o): o is TokenOption => o !== undefined),
    [selectedIds, byId],
  );

  // Unselected options matching the query, sorted by name, capped. With
  // an empty query the top of the alphabetised list shows so the control
  // is browsable without typing.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const selectedSet = new Set(selectedIds);
    return options
      .filter((o) => !selectedSet.has(o.id))
      .filter((o) => q === "" || o.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_MATCHES);
  }, [options, selectedIds, query]);

  const showList = focused && matches.length > 0;
  // Clamp the active row to the current match set so a shrinking list
  // can't leave the highlight pointing past the end.
  const active = Math.min(activeIndex, Math.max(0, matches.length - 1));

  function add(id: string) {
    if (!selectedIds.includes(id)) onChange([...selectedIds, id]);
    setQuery("");
    setActiveIndex(0);
    inputRef.current?.focus();
  }

  function remove(id: string) {
    onChange(selectedIds.filter((x) => x !== id));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (showList && matches[active]) {
        e.preventDefault();
        add(matches[active].id);
      }
    } else if (e.key === "Backspace" && query === "" && selected.length > 0) {
      // Empty-query Backspace pops the last chip — the familiar tokenizer
      // gesture, so a mistaken pick is one keystroke to undo.
      e.preventDefault();
      remove(selected[selected.length - 1].id);
    } else if (e.key === "Escape" && query !== "") {
      // Swallow Escape only to clear the query; an empty-query Escape
      // falls through so the popover / modal can close as usual.
      e.preventDefault();
      setQuery("");
    }
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-fg-bright">{label}</p>
        {headerExtra}
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-1 rounded border border-line bg-surface px-1.5 py-1 focus-within:border-accent">
          {selected.map((option) => (
            <span
              key={option.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-fg"
            >
              {option.leading}
              <span className="min-w-0 truncate">{option.name}</span>
              <button
                type="button"
                onClick={() => remove(option.id)}
                aria-label={t("searchTransaction.filterRemoveToken", {
                  name: option.name,
                })}
                className="-mr-0.5 inline-flex cursor-pointer items-center text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
              >
                <X size={12} aria-hidden focusable={false} />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList ? `${listId}-${active}` : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={selected.length === 0 ? placeholder : ""}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-[6rem] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm text-fg focus:outline-none"
          />
        </div>
        {showList && (
          <ul
            id={listId}
            role="listbox"
            className="mt-1 max-h-44 overflow-y-auto rounded border border-line bg-surface-2 py-1"
          >
            {matches.map((option, idx) => (
              <li
                key={option.id}
                id={`${listId}-${idx}`}
                role="option"
                aria-selected={idx === active}
              >
                <button
                  type="button"
                  // Keep focus on the input so the list stays open across
                  // a click — without this the input blurs first and the
                  // list unmounts before the click lands.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(option.id)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`flex w-full cursor-pointer items-center gap-1.5 px-2 py-1.5 text-left text-sm ${
                    idx === active
                      ? "bg-accent/10 text-accent"
                      : "text-fg hover:bg-surface-2"
                  }`}
                >
                  {option.leading}
                  <span className="min-w-0 truncate">{option.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
