import { useCallback, useMemo, useRef, useState } from "react";
import { Building2, ChevronDown, Filter } from "lucide-react";

import type { SearchEntry, SearchFilter } from "../../data/search";
import { EMPTY_FILTER, isFilterActive } from "../../data/search";
import type { CategoryIcon, Settings } from "../../data/types";
import type { FloatingPlacement } from "../../hooks";
import { usePointerOutside } from "../../hooks";
import { useLang, useT, type TFunction } from "../../i18n";
import {
  formatMonthLabel,
  formatNumber,
  withCurrency,
} from "../../utils/format";
import {
  BudgetTransferSearchTokenFilter,
  type TokenOption,
} from "./BudgetTransferSearchTokenFilter";
import {
  monthNumToKey,
  useTransferSearchFilter,
} from "./useTransferSearchFilter";
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

// Quick-pick calendar windows for the "exclude old data" dropdown. Each
// value is a count of calendar years to keep, current year inclusive (1
// = this year only, 2 = this year + last, …); null = no age limit. The
// list intentionally skips 4 — beyond "last 3 years" the user is browsing
// in coarser strides, so 5 / 10 cover the long tail without a long menu.
const MAX_AGE_OPTIONS: readonly (number | null)[] = [null, 1, 2, 3, 5, 10];

function maxAgeLabel(value: number | null, t: TFunction): string {
  if (value === null) return t("searchTransaction.filterMaxAgeAll");
  if (value === 1) return t("searchTransaction.filterMaxAgeThisYear");
  return t("searchTransaction.filterMaxAgeYears", { n: value });
}

// Custom button + listbox (never a native <select>, per the project's
// dropdown rule) for the `maxAgeYears` filter. The list renders inline
// rather than absolutely-positioned so the popover's own
// `overflow-y-auto` scrolls it into view instead of clipping it — the
// same trick the token filter uses for its match list.
function MaxAgeDropdown({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  usePointerOutside(open, [ref], () => setOpen(false));
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-3">
      <p className="text-xs font-medium text-fg-bright">
        {t("searchTransaction.filterMaxAge")}
      </p>
      <div ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t("searchTransaction.filterMaxAgeAria")}
          className="field-input flex w-full cursor-pointer items-center justify-between gap-2 border border-line bg-surface px-2 py-1.5 text-left text-sm text-fg hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
        >
          <span className="truncate">{maxAgeLabel(value, t)}</span>
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
            aria-label={t("searchTransaction.filterMaxAge")}
            className="mt-1 max-h-56 overflow-y-auto rounded border border-line bg-surface-2 py-1"
          >
            {MAX_AGE_OPTIONS.map((option) => {
              const selected = option === value;
              return (
                <li key={option ?? "all"} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(option);
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

// One sheet option in the sheet dropdown.
type Option = {
  id: string;
  name: string;
  glyph: string;
  color: string;
};

// The sheet's pictogram, tinted with its colour — shown in both the
// trigger and the option rows.
function sheetGlyph(option: Option): React.ReactNode {
  return (
    <span
      aria-hidden
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center"
      style={{ color: option.color }}
    >
      <CategoryIconGlyph name={option.glyph as CategoryIcon} size={14} />
    </span>
  );
}

// Custom button + listbox (never a native <select>, per the project's
// dropdown rule) for scoping the search to a single sheet. `null`
// selects every sheet. Single-select rather than a checkbox list: the
// menu only needs to point the search at one ledger at a time, and the
// list renders inline so the popover's own `overflow-y-auto` scrolls it
// into view instead of clipping it — the same trick `MaxAgeDropdown`
// and the token filter use.
function SheetDropdown({
  options,
  selectedId,
  onChange,
}: {
  options: readonly Option[];
  selectedId: string | null;
  onChange: (next: string | null) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  usePointerOutside(open, [ref], () => setOpen(false));
  const selected = options.find((o) => o.id === selectedId) ?? null;
  const optionClass = (active: boolean) =>
    `flex w-full cursor-pointer items-center gap-1.5 px-2 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
      active ? "bg-accent/10 text-accent" : "text-fg hover:bg-surface"
    }`;
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-3">
      <p className="text-xs font-medium text-fg-bright">
        {t("searchTransaction.filterSheets")}
      </p>
      <div ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t("searchTransaction.filterSheetsAria")}
          className="field-input flex w-full cursor-pointer items-center justify-between gap-2 border border-line bg-surface px-2 py-1.5 text-left text-sm text-fg hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {selected && sheetGlyph(selected)}
            <span className="truncate">
              {selected
                ? selected.name
                : t("searchTransaction.filterSheetsAllOption")}
            </span>
          </span>
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
            aria-label={t("searchTransaction.filterSheets")}
            className="mt-1 max-h-56 overflow-y-auto rounded border border-line bg-surface-2 py-1"
          >
            <li role="none">
              <button
                type="button"
                role="option"
                aria-selected={selectedId === null}
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className={optionClass(selectedId === null)}
              >
                {t("searchTransaction.filterSheetsAllOption")}
              </button>
            </li>
            {options.map((option) => {
              const active = option.id === selectedId;
              return (
                <li key={option.id} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                    className={optionClass(active)}
                  >
                    {sheetGlyph(option)}
                    <span className="truncate">{option.name}</span>
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

  const {
    sheets,
    companies,
    types,
    categories,
    tags,
    hasAmount,
    amountSliderMin,
    amountSliderMax,
    amountValue,
    hasDate,
    dateSliderMin,
    dateSliderMax,
    dateValue,
    commitAmount,
    commitDate,
  } = useTransferSearchFilter({
    filter,
    onFilterChange,
    index,
    query,
    settings,
  });

  // Project the index-derived tokens to `TokenOption`s with the leading
  // glyph / colour swatch each shows on the sheet. Kept in the menu (not
  // the hook) so the hook stays JSX-free; memoized on the raw token
  // lists, which only change when the index does.
  const companyOptions = useMemo<TokenOption[]>(
    () =>
      companies.map((c) => ({
        id: c.id,
        name: c.name,
        leading: (
          <Building2
            size={14}
            aria-hidden
            focusable={false}
            className="shrink-0 text-muted"
          />
        ),
      })),
    [companies],
  );
  const typeOptions = useMemo<TokenOption[]>(
    () =>
      types.map((ty) => ({
        id: ty.id,
        name: ty.name,
        leading: glyphLeading(ty.glyph, ty.color),
      })),
    [types],
  );
  const categoryOptions = useMemo<TokenOption[]>(
    () =>
      categories.map((c) => ({
        id: c.id,
        name: c.name,
        leading: glyphLeading(c.glyph, c.color),
      })),
    [categories],
  );
  const tagOptions = useMemo<TokenOption[]>(
    () =>
      tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        leading: (
          <span
            aria-hidden
            className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: tag.color }}
          />
        ),
      })),
    [tags],
  );

  const amountLabel = (v: number) =>
    withCurrency(formatNumber(v, settings), settings);
  const dateLabel = (month: number) =>
    formatMonthLabel(monthNumToKey(month), lang);

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

            <MaxAgeDropdown
              value={filter.maxAgeYears}
              onChange={(v) => onFilterChange({ ...filter, maxAgeYears: v })}
            />

            {sheets.length > 1 && (
              <SheetDropdown
                options={sheets}
                selectedId={filter.sheetIds[0] ?? null}
                onChange={(id) =>
                  onFilterChange({
                    ...filter,
                    sheetIds: id === null ? [] : [id],
                  })
                }
              />
            )}

            {companyOptions.length > 0 && (
              <BudgetTransferSearchTokenFilter
                label={t("searchTransaction.filterCompanies")}
                placeholder={t("searchTransaction.filterCompaniesPlaceholder")}
                options={companyOptions}
                selectedIds={filter.companyIds}
                onChange={(ids) =>
                  onFilterChange({ ...filter, companyIds: ids })
                }
              />
            )}

            {typeOptions.length > 0 && (
              <BudgetTransferSearchTokenFilter
                label={t("searchTransaction.filterTypes")}
                placeholder={t("searchTransaction.filterTypesPlaceholder")}
                options={typeOptions}
                selectedIds={filter.typeIds}
                onChange={(ids) => onFilterChange({ ...filter, typeIds: ids })}
              />
            )}

            {categoryOptions.length > 0 && (
              <BudgetTransferSearchTokenFilter
                label={t("searchTransaction.filterCategories")}
                placeholder={t("searchTransaction.filterCategoriesPlaceholder")}
                options={categoryOptions}
                selectedIds={filter.categoryIds}
                onChange={(ids) =>
                  onFilterChange({ ...filter, categoryIds: ids })
                }
              />
            )}

            {tagOptions.length > 0 && (
              <BudgetTransferSearchTokenFilter
                label={t("searchTransaction.filterTags")}
                placeholder={t("searchTransaction.filterTagsPlaceholder")}
                options={tagOptions}
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
                <div className="px-2">
                  <RangeSlider
                    min={amountSliderMin}
                    max={amountSliderMax}
                    value={amountValue}
                    onChange={commitAmount}
                    ariaLabelMin={t("searchTransaction.filterAmountMin")}
                    ariaLabelMax={t("searchTransaction.filterAmountMax")}
                    formatValueText={amountLabel}
                  />
                </div>
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
                <div className="px-2">
                  <RangeSlider
                    min={dateSliderMin}
                    max={dateSliderMax}
                    value={dateValue}
                    onChange={commitDate}
                    ariaLabelMin={t("searchTransaction.filterDateMin")}
                    ariaLabelMax={t("searchTransaction.filterDateMax")}
                    formatValueText={dateLabel}
                  />
                </div>
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
