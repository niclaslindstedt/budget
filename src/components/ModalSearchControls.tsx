import { useCallback, useRef, useState } from "react";
import {
  CalendarArrowDown,
  CalendarArrowUp,
  ChevronDown,
  Filter,
} from "lucide-react";

import { MAX_AGE_OPTIONS } from "../data/search";
import type { TransactionSortOrder } from "../data/types";
import type { FloatingPlacement } from "../hooks";
import { usePointerOutside } from "../hooks";
import { useT, type TFunction } from "../i18n";
import { FloatingPanel } from "./FloatingPanel";
import {
  Checkbox,
  RangeBoundsEditor,
  RangeSlider,
  type RangeEditIO,
} from "./form";

const FILTER_MENU_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 240 },
  anchor: "right",
  coordinateSpace: "viewport",
};

// Shared styling for the icon buttons that sit in a search bar's
// trailing cluster. Centralised here so every modal's sort / filter
// controls read as the same family — restyle once, propagate to all of
// them.
function iconButtonClass(active: boolean): string {
  return `inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
    active
      ? "bg-accent/15 text-accent"
      : "text-muted hover:bg-surface-2 hover:text-fg"
  }`;
}

export type ModalSearchSort = {
  // Current order and the persisted default it was seeded from. The
  // toggle highlights when the user has steered away from the default,
  // matching the entry search modal's "non-default" cue.
  order: TransactionSortOrder;
  defaultOrder: TransactionSortOrder;
  onToggle: () => void;
};

export type ModalSearchFilter = {
  // Stable React key. The label is caller-owned (already translated) so
  // each modal phrases its own filter while sharing this chrome.
  key: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
};

export type ModalSearchTimeRange = {
  // Calendar years to keep (current year inclusive); null = all time.
  // See `MAX_AGE_OPTIONS` / `ageFloorIso` in `data/search` for the
  // shared semantics.
  value: number | null;
  onChange: (next: number | null) => void;
};

export type ModalSearchRange = {
  // Slider domain. The caller seeds this from the rows currently in
  // view; an empty / single-value domain has nothing to drag, so callers
  // omit the prop entirely rather than passing `min === max`.
  min: number;
  max: number;
  // Current [from, to] pair, defaulting to [min, max] when the band is
  // unset. The controls treat a thumb sitting at its natural edge as
  // "default" for the active-highlight cue.
  value: [number, number];
  onChange: (next: [number, number]) => void;
  // Human label for a thumb value (currency, a month name) — drives both
  // the readout above the slider and each thumb's `aria-valuetext`.
  format: (value: number) => string;
  // When set, the `from – to` readout becomes click-to-edit so the user
  // can type an exact bound instead of dragging a thumb to it. Omit to
  // keep the readout static.
  io?: RangeEditIO;
};

type Props = {
  // Every surface is optional so a modal can opt into any combination.
  // Omit `sort` for a filter-only bar; the filter button appears when
  // any of `filters` / `timeRange` / `amount` / `dates` is supplied.
  sort?: ModalSearchSort;
  filters?: readonly ModalSearchFilter[];
  timeRange?: ModalSearchTimeRange;
  amount?: ModalSearchRange;
  dates?: ModalSearchRange;
};

// Universal sort + filter cluster for a search modal, rendered into
// `ModalSearchBar`'s `actions` slot. Keeping the chrome here means a
// design change to the search controls lands in every modal that shows
// them at once, instead of being copy-pasted per modal.
export function ModalSearchControls({
  sort,
  filters,
  timeRange,
  amount,
  dates,
}: Props) {
  const hasFilterSurface =
    (filters && filters.length > 0) ||
    timeRange !== undefined ||
    amount !== undefined ||
    dates !== undefined;
  return (
    <>
      {sort && <SortToggle sort={sort} />}
      {hasFilterSurface && (
        <FilterMenu
          filters={filters}
          timeRange={timeRange}
          amount={amount}
          dates={dates}
        />
      )}
    </>
  );
}

function SortToggle({ sort }: { sort: ModalSearchSort }) {
  const t = useT();
  const newestFirst = sort.order === "newestFirst";
  const sortLabel = newestFirst
    ? t("search.sortNewest")
    : t("search.sortOldest");
  return (
    <button
      type="button"
      onClick={sort.onToggle}
      aria-label={t("search.sortAria")}
      title={sortLabel}
      className={iconButtonClass(sort.order !== sort.defaultOrder)}
    >
      {newestFirst ? (
        <CalendarArrowDown size={16} aria-hidden focusable={false} />
      ) : (
        <CalendarArrowUp size={16} aria-hidden focusable={false} />
      )}
    </button>
  );
}

function maxAgeLabel(value: number | null, t: TFunction): string {
  if (value === null) return t("search.filterTimeRangeAll");
  if (value === 1) return t("search.filterTimeRangeThisYear");
  return t("search.filterTimeRangeYears", { n: value });
}

// Custom button + listbox (never a native <select>, per the project's
// dropdown rule) for the time-range quick-pick. The list renders inline
// rather than absolutely-positioned so the popover's own
// `overflow-y-auto` scrolls it into view instead of clipping it.
function TimeRangeDropdown({ timeRange }: { timeRange: ModalSearchTimeRange }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  usePointerOutside(open, [ref], () => setOpen(false));
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-fg-bright">
        {t("search.filterTimeRange")}
      </p>
      <div ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t("search.filterTimeRangeAria")}
          className="field-input flex w-full cursor-pointer items-center justify-between gap-2 border border-line bg-surface px-2 py-1.5 text-left text-sm text-fg hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
        >
          <span className="truncate">{maxAgeLabel(timeRange.value, t)}</span>
          <ChevronDown
            size={14}
            aria-hidden
            focusable={false}
            className="shrink-0 text-muted"
          />
        </button>
        {open && (
          <ul
            role="listbox"
            aria-label={t("search.filterTimeRange")}
            className="mt-1 max-h-56 overflow-y-auto rounded border border-line bg-surface-2 py-1"
          >
            {MAX_AGE_OPTIONS.map((option) => {
              const selected = option === timeRange.value;
              return (
                <li key={option ?? "all"} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      timeRange.onChange(option);
                      setOpen(false);
                    }}
                    className={`flex w-full cursor-pointer items-center px-2 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
                      selected
                        ? "bg-accent/10 text-accent"
                        : "text-fg hover:bg-surface"
                    }`}
                  >
                    {maxAgeLabel(option, t)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// Whether a range's thumbs sit anywhere other than the natural edges —
// drives the filter button's active-highlight cue.
function rangeActive(range: ModalSearchRange): boolean {
  return range.value[0] > range.min || range.value[1] < range.max;
}

function RangeSection({
  label,
  range,
  ariaLabelMin,
  ariaLabelMax,
}: {
  label: string;
  range: ModalSearchRange;
  ariaLabelMin: string;
  ariaLabelMax: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-fg-bright">{label}</span>
        {range.io ? (
          <RangeBoundsEditor
            value={range.value}
            min={range.min}
            max={range.max}
            onChange={range.onChange}
            format={range.format}
            io={range.io}
            ariaLabelMin={ariaLabelMin}
            ariaLabelMax={ariaLabelMax}
          />
        ) : (
          <span className="font-mono text-muted">
            {range.format(range.value[0])} – {range.format(range.value[1])}
          </span>
        )}
      </div>
      <div className="px-2">
        <RangeSlider
          min={range.min}
          max={range.max}
          value={range.value}
          onChange={range.onChange}
          ariaLabelMin={ariaLabelMin}
          ariaLabelMax={ariaLabelMax}
          formatValueText={range.format}
        />
      </div>
    </div>
  );
}

function FilterMenu({
  filters,
  timeRange,
  amount,
  dates,
}: {
  filters?: readonly ModalSearchFilter[];
  timeRange?: ModalSearchTimeRange;
  amount?: ModalSearchRange;
  dates?: ModalSearchRange;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const active =
    open ||
    (filters?.some((f) => f.checked) ?? false) ||
    (timeRange?.value ?? null) !== null ||
    (amount !== undefined && rangeActive(amount)) ||
    (dates !== undefined && rangeActive(dates));

  // Insert a hairline divider between every populated section so the
  // popover scans as grouped rows however many sections the caller opts
  // into.
  const sections: { key: string; node: React.ReactNode }[] = [];
  if (filters && filters.length > 0) {
    sections.push({
      key: "checks",
      node: (
        <div className="flex flex-col gap-2">
          {filters.map((f) => (
            <Checkbox
              key={f.key}
              checked={f.checked}
              onChange={f.onChange}
              label={f.label}
            />
          ))}
        </div>
      ),
    });
  }
  if (timeRange) {
    sections.push({
      key: "time",
      node: <TimeRangeDropdown timeRange={timeRange} />,
    });
  }
  if (amount) {
    sections.push({
      key: "amount",
      node: (
        <RangeSection
          label={t("search.filterAmount")}
          range={amount}
          ariaLabelMin={t("search.filterAmountMin")}
          ariaLabelMax={t("search.filterAmountMax")}
        />
      ),
    });
  }
  if (dates) {
    sections.push({
      key: "dates",
      node: (
        <RangeSection
          label={t("search.filterDates")}
          range={dates}
          ariaLabelMin={t("search.filterDateMin")}
          ariaLabelMax={t("search.filterDateMax")}
        />
      ),
    });
  }

  return (
    <div ref={triggerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("search.filterAria")}
        title={t("search.filterTitle")}
        className={iconButtonClass(active)}
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
          aria-label={t("search.filterTitle")}
          className="flex flex-col"
        >
          <p className="border-b border-line bg-surface-3 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
            {t("search.filterTitle")}
          </p>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto px-3 py-3">
            {sections.map((section, i) => (
              <div
                key={section.key}
                className={i > 0 ? "border-t border-line pt-3" : undefined}
              >
                {section.node}
              </div>
            ))}
          </div>
        </div>
      </FloatingPanel>
    </div>
  );
}
