import { useCallback, useMemo, useRef, useState } from "react";
import { Building2, Filter } from "lucide-react";

import type { SearchEntry, SearchFilter } from "../../data/search";
import { EMPTY_FILTER, isFilterActive, searchBounds } from "../../data/search";
import type { CategoryIcon, Settings } from "../../data/types";
import type { FloatingPlacement } from "../../hooks";
import { useLang, useT } from "../../i18n";
import {
  formatMonthLabel,
  formatNumber,
  withCurrency,
} from "../../utils/format";
import {
  BudgetTransferSearchTokenFilter,
  type TokenOption,
} from "./BudgetTransferSearchTokenFilter";
import { FloatingPanel } from "../FloatingPanel";
import { Checkbox, RangeSlider } from "../form";
import { CategoryIconGlyph } from "../icons";

// Leading glyph for a type / category option — the same pictogram the
// row shows on the sheet, tinted with the entry's colour.
function glyphLeading(glyph: string, color: string): React.ReactNode {
  return (
    <span
      aria-hidden
      className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center"
      style={color ? { color } : undefined}
    >
      <CategoryIconGlyph name={glyph as CategoryIcon} size={14} />
    </span>
  );
}

const FILTER_MENU_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 288 },
  anchor: "right",
  coordinateSpace: "viewport",
};

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

// One sheet option in the sheet multi-select.
type Option = {
  id: string;
  name: string;
  glyph: string;
  color: string;
};

// A bordered, scrollable checkbox list backing the sheet multi-select.
// Sheets are a small, fixed set per workspace, so a checkbox list still
// fits; the company / type / category / tag filters use the type-to-
// filter token control instead because those grow unbounded.
function OptionList({
  title,
  options,
  selectedIds,
  onToggle,
  allHint,
}: {
  title: string;
  options: readonly Option[];
  selectedIds: readonly string[];
  onToggle: (id: string, checked: boolean) => void;
  allHint: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-3">
      <p className="text-xs font-medium text-fg-bright">{title}</p>
      <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
        {options.map((option) => (
          <Checkbox
            key={option.id}
            checked={selectedIds.includes(option.id)}
            onChange={(v) => onToggle(option.id, v)}
            label={
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center"
                  style={{ color: option.color }}
                >
                  <CategoryIconGlyph
                    name={option.glyph as CategoryIcon}
                    size={14}
                  />
                </span>
                <span className="truncate">{option.name}</span>
              </span>
            }
          />
        ))}
      </div>
      {selectedIds.length === 0 && (
        <p className="text-xs text-muted">{allHint}</p>
      )}
    </div>
  );
}

export function BudgetTransferSearchFilterMenu({
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

  // Distinct companies / types / categories / tags present in the
  // index, in first-seen order, projected to `TokenOption`s (each with
  // the leading glyph / colour swatch it shows on the sheet). The filter
  // only offers values that actually appear in the current result
  // universe — picking one that matches nothing would be pointless.
  const { companies, types, categories, tags } = useMemo(() => {
    const companies = new Map<string, TokenOption>();
    const types = new Map<string, TokenOption>();
    const categories = new Map<string, TokenOption>();
    const tags = new Map<string, TokenOption>();
    for (const e of index) {
      if (e.companyId !== "" && !companies.has(e.companyId))
        companies.set(e.companyId, {
          id: e.companyId,
          name: e.companyName,
          leading: (
            <Building2
              size={14}
              aria-hidden
              focusable={false}
              className="shrink-0 text-muted"
            />
          ),
        });
      if (e.typeId !== "" && !types.has(e.typeId))
        types.set(e.typeId, {
          id: e.typeId,
          name: e.typeName,
          leading: glyphLeading(e.typeGlyph, e.typeColor),
        });
      if (e.categoryId !== "" && !categories.has(e.categoryId))
        categories.set(e.categoryId, {
          id: e.categoryId,
          name: e.categoryName,
          leading: glyphLeading(e.categoryGlyph, e.categoryColor),
        });
      for (const tag of e.tags) {
        if (!tags.has(tag.id))
          tags.set(tag.id, {
            id: tag.id,
            name: tag.name,
            leading: (
              <span
                aria-hidden
                className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
            ),
          });
      }
    }
    return {
      companies: [...companies.values()],
      types: [...types.values()],
      categories: [...categories.values()],
      tags: [...tags.values()],
    };
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
  function toggleId(
    key: "sheetIds" | "companyIds" | "typeIds" | "categoryIds" | "tagIds",
    id: string,
    checked: boolean,
  ) {
    const set = new Set(filter[key]);
    if (checked) set.add(id);
    else set.delete(id);
    onFilterChange({ ...filter, [key]: [...set] });
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
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto px-3 py-3">
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
              <OptionList
                title={t("searchTransaction.filterSheets")}
                options={sheets}
                selectedIds={filter.sheetIds}
                onToggle={(id, v) => toggleId("sheetIds", id, v)}
                allHint={t("searchTransaction.filterSheetsAll")}
              />
            )}

            {companies.length > 0 && (
              <BudgetTransferSearchTokenFilter
                label={t("searchTransaction.filterCompanies")}
                placeholder={t("searchTransaction.filterCompaniesPlaceholder")}
                options={companies}
                selectedIds={filter.companyIds}
                onChange={(ids) =>
                  onFilterChange({ ...filter, companyIds: ids })
                }
              />
            )}

            {types.length > 0 && (
              <BudgetTransferSearchTokenFilter
                label={t("searchTransaction.filterTypes")}
                placeholder={t("searchTransaction.filterTypesPlaceholder")}
                options={types}
                selectedIds={filter.typeIds}
                onChange={(ids) => onFilterChange({ ...filter, typeIds: ids })}
              />
            )}

            {categories.length > 0 && (
              <BudgetTransferSearchTokenFilter
                label={t("searchTransaction.filterCategories")}
                placeholder={t("searchTransaction.filterCategoriesPlaceholder")}
                options={categories}
                selectedIds={filter.categoryIds}
                onChange={(ids) =>
                  onFilterChange({ ...filter, categoryIds: ids })
                }
              />
            )}

            {tags.length > 0 && (
              <BudgetTransferSearchTokenFilter
                label={t("searchTransaction.filterTags")}
                placeholder={t("searchTransaction.filterTagsPlaceholder")}
                options={tags}
                selectedIds={filter.tagIds}
                onChange={(ids) => onFilterChange({ ...filter, tagIds: ids })}
                headerExtra={
                  <div
                    role="radiogroup"
                    aria-label={t("searchTransaction.filterTagMode")}
                    className="inline-flex overflow-hidden rounded border border-line"
                  >
                    {(
                      [
                        ["any", "filterTagModeAny"],
                        ["all", "filterTagModeAll"],
                      ] as const
                    ).map(([mode, key]) => {
                      const on =
                        mode === "all"
                          ? filter.tagMatchAll
                          : !filter.tagMatchAll;
                      return (
                        <button
                          key={mode}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() =>
                            onFilterChange({
                              ...filter,
                              tagMatchAll: mode === "all",
                            })
                          }
                          className={`cursor-pointer px-2 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
                            on
                              ? "bg-accent/15 text-accent"
                              : "text-muted hover:bg-surface-2 hover:text-fg"
                          }`}
                        >
                          {t(`searchTransaction.${key}`)}
                        </button>
                      );
                    })}
                  </div>
                }
              />
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
