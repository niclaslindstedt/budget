import { useCallback, useMemo } from "react";

import type { SearchEntry, SearchFilter } from "../../data/search";
import { searchBounds } from "../../data/search";
import type { Settings } from "../../data/types";
import {
  isoToMonthNum,
  monthNumToIsoEnd,
  monthNumToIsoStart,
} from "../../utils/date";

// The month-number domain helpers live in `utils/date` so the universal
// search controls (and other pages) can reuse them without importing
// from the budget page directory. Re-exported here so existing budget
// call sites and tests keep their import path.
export {
  isoToMonthNum,
  monthNumToIsoEnd,
  monthNumToIsoStart,
  monthNumToKey,
} from "../../utils/date";

// Filter-state logic for the transaction-search filter menu, lifted out
// of `BudgetTransferSearchFilterMenu` so the menu stays pure rendering.
// The hook owns the index-derived token lists, the slider bounds, and
// the immutable filter-update functions; the helpers below are pure so
// they can be unit-tested without mounting React.

// One id+name token (companies — their only adornment is a fixed icon).
export type FilterToken = { id: string; name: string };

// A token that also carries its sheet pictogram (types, categories,
// sheets — each renders its own glyph tinted with its colour).
export type GlyphToken = {
  id: string;
  name: string;
  glyph: string;
  color: string;
};

// A tag token — rendered with a coloured dot rather than a glyph.
export type TagToken = { id: string; name: string; color: string };

// The set-valued filter keys `toggleFilterId` can flip an id within.
export type FilterIdKey =
  | "sheetIds"
  | "companyIds"
  | "typeIds"
  | "categoryIds"
  | "tagIds";

// Minimal structural views of the slider bounds so the pure helpers
// don't have to import `IndexBounds` from the search module.
type AmountBounds = { amountMin: number | null; amountMax: number | null };
type DateBounds = { dateMin: string | null; dateMax: string | null };

// Distinct sheets / companies / types / categories / tags present in the
// index, in first-seen order. The filter only offers values that
// actually appear in the current result universe — picking one that
// matches nothing would be pointless.
export function collectFilterTokens(index: readonly SearchEntry[]): {
  sheets: GlyphToken[];
  companies: FilterToken[];
  types: GlyphToken[];
  categories: GlyphToken[];
  tags: TagToken[];
} {
  const sheets = new Map<string, GlyphToken>();
  const companies = new Map<string, FilterToken>();
  const types = new Map<string, GlyphToken>();
  const categories = new Map<string, GlyphToken>();
  const tags = new Map<string, TagToken>();
  for (const e of index) {
    if (!sheets.has(e.sheetId))
      sheets.set(e.sheetId, {
        id: e.sheetId,
        name: e.sheetName,
        glyph: e.sheetGlyph,
        color: e.sheetColor,
      });
    if (e.companyId !== "" && !companies.has(e.companyId))
      companies.set(e.companyId, { id: e.companyId, name: e.companyName });
    if (e.typeId !== "" && !types.has(e.typeId))
      types.set(e.typeId, {
        id: e.typeId,
        name: e.typeName,
        glyph: e.typeGlyph,
        color: e.typeColor,
      });
    if (e.categoryId !== "" && !categories.has(e.categoryId))
      categories.set(e.categoryId, {
        id: e.categoryId,
        name: e.categoryName,
        glyph: e.categoryGlyph,
        color: e.categoryColor,
      });
    for (const tag of e.tags) {
      if (!tags.has(tag.id))
        tags.set(tag.id, { id: tag.id, name: tag.name, color: tag.color });
    }
  }
  return {
    sheets: [...sheets.values()],
    companies: [...companies.values()],
    types: [...types.values()],
    categories: [...categories.values()],
    tags: [...tags.values()],
  };
}

// Slider domain + current value for the amount band. The slider only
// drives when the matched rows span a real range; a single-value domain
// has nothing to drag.
export function deriveAmountSlider(
  filter: SearchFilter,
  bounds: AmountBounds,
): { hasAmount: boolean; min: number; max: number; value: [number, number] } {
  const min = bounds.amountMin ?? 0;
  const max = bounds.amountMax ?? 0;
  const hasAmount =
    bounds.amountMin !== null &&
    bounds.amountMax !== null &&
    bounds.amountMax > bounds.amountMin;
  return {
    hasAmount,
    min,
    max,
    value: [filter.amountMin ?? min, filter.amountMax ?? max],
  };
}

// Slider domain + current value for the date band, in month-numbers.
export function deriveDateSlider(
  filter: SearchFilter,
  bounds: DateBounds,
): { hasDate: boolean; min: number; max: number; value: [number, number] } {
  const min = bounds.dateMin !== null ? isoToMonthNum(bounds.dateMin) : 0;
  const max = bounds.dateMax !== null ? isoToMonthNum(bounds.dateMax) : 0;
  const hasDate =
    bounds.dateMin !== null && bounds.dateMax !== null && max > min;
  return {
    hasDate,
    min,
    max,
    value: [
      filter.dateMin !== null ? isoToMonthNum(filter.dateMin) : min,
      filter.dateMax !== null ? isoToMonthNum(filter.dateMax) : max,
    ],
  };
}

// Store a bound as null when its thumb sits at the natural edge so the
// filter stays "default" on that side and the Filter glyph dims back.
export function nextAmountFilter(
  filter: SearchFilter,
  bounds: AmountBounds,
  next: [number, number],
): SearchFilter {
  return {
    ...filter,
    amountMin:
      bounds.amountMin !== null && next[0] <= bounds.amountMin ? null : next[0],
    amountMax:
      bounds.amountMax !== null && next[1] >= bounds.amountMax ? null : next[1],
  };
}

export function nextDateFilter(
  filter: SearchFilter,
  dateMinNum: number,
  dateMaxNum: number,
  next: [number, number],
): SearchFilter {
  return {
    ...filter,
    dateMin: next[0] <= dateMinNum ? null : monthNumToIsoStart(next[0]),
    dateMax: next[1] >= dateMaxNum ? null : monthNumToIsoEnd(next[1]),
  };
}

export function toggleFilterId(
  filter: SearchFilter,
  key: FilterIdKey,
  id: string,
  checked: boolean,
): SearchFilter {
  const set = new Set(filter[key]);
  if (checked) set.add(id);
  else set.delete(id);
  return { ...filter, [key]: [...set] };
}

type Params = {
  filter: SearchFilter;
  onFilterChange: (next: SearchFilter) => void;
  index: readonly SearchEntry[];
  query: string;
  settings: Settings;
};

export function useTransferSearchFilter({
  filter,
  onFilterChange,
  index,
  query,
  settings,
}: Params) {
  const tokens = useMemo(() => collectFilterTokens(index), [index]);

  // Seed the range sliders from the rows the current query + categorical
  // filters surface, not the whole workspace — so a four-row "Meds"
  // search shows a 100–500 amount slider instead of 0–981K.
  const bounds = useMemo(
    () => searchBounds(index, query, filter, settings.searchRanking),
    [index, query, filter, settings.searchRanking],
  );

  const amount = deriveAmountSlider(filter, bounds);
  const date = deriveDateSlider(filter, bounds);

  const commitAmount = useCallback(
    (next: [number, number]) =>
      onFilterChange(nextAmountFilter(filter, bounds, next)),
    [filter, bounds, onFilterChange],
  );
  const commitDate = useCallback(
    (next: [number, number]) =>
      onFilterChange(nextDateFilter(filter, date.min, date.max, next)),
    [filter, date.min, date.max, onFilterChange],
  );
  const toggleId = useCallback(
    (key: FilterIdKey, id: string, checked: boolean) =>
      onFilterChange(toggleFilterId(filter, key, id, checked)),
    [filter, onFilterChange],
  );

  return {
    sheets: tokens.sheets,
    companies: tokens.companies,
    types: tokens.types,
    categories: tokens.categories,
    tags: tokens.tags,
    hasAmount: amount.hasAmount,
    amountSliderMin: amount.min,
    amountSliderMax: amount.max,
    amountValue: amount.value,
    hasDate: date.hasDate,
    dateSliderMin: date.min,
    dateSliderMax: date.max,
    dateValue: date.value,
    commitAmount,
    commitDate,
    toggleId,
  };
}
