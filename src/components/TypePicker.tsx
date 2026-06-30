import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, Plus, Tag, X } from "lucide-react";

import { TYPE_GLYPH_NAMES } from "../data/constants/taxonomy";
import { DEFAULT_CATEGORY_ID } from "../data/presets/categories";
import type { Category, EntryType } from "../data/types";
import { useRovingTabindex, type FloatingPlacement } from "../hooks";
import { useT } from "../i18n";
import { displayCategoryName, displayTypeName } from "../i18n/preset-names";
import { CategoryChip, CategoryCreator } from "./CategoryPicker";
import { EntityChip } from "./EntityChip";
import { TypeBadge } from "./Pills";
import { EntityCreatorForm } from "./EntityCreatorForm";
import { FloatingPanel } from "./FloatingPanel";
import { CategoryIconGlyph } from "./icons";

// Mirrors CategoryPicker: prefer aligning the dropdown's right edge
// with the trigger so it opens "down and to the left" of a narrow
// chip, but the hook clamps into the viewport so it never goes off
// screen.
const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 240 },
  anchor: "right",
  coordinateSpace: "viewport",
};

type Props = {
  // When rendered inside a sheet row, the row's id wires the picker
  // into the active-row coordinator so outside clicks dismiss it
  // without firing whatever was clicked. Modals leave it undefined.
  rowId?: string;
  types: readonly EntryType[];
  // Full set of selectable categories — used to drive the first tier
  // of the picker (the category list) and to populate the category
  // dropdown inside the inline type creator. Required because every
  // type belongs to a category.
  categories: readonly Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (draft: Omit<EntryType, "id">) => EntryType;
  // Wired through to the inline type creator's category picker so the
  // user can spawn a brand-new category without leaving the type
  // creation flow. Optional — call sites that don't provide it leave
  // the category dropdown without a "Create category" footer row.
  onCreateCategory?: (draft: Omit<Category, "id">) => Category;
  // Sign of the row's amount: "positive" hides expense-only types,
  // "negative" hides income-only types, "any"/undefined shows
  // everything. The currently selected type is always shown — once
  // a row has been labelled "Salary" we don't drop it from the
  // picker just because the user is reconsidering the sign.
  amountSign?: "positive" | "negative" | "any";
  // Generic predicate over the type list. Takes precedence over
  // `amountSign` so future sheet types (loans, savings) can supply
  // their own filter shape without the picker hardcoding every
  // variant. The currently-selected type bypasses the predicate so
  // an already-labelled row keeps its chip visible while the user
  // reconsiders.
  filterFn?: (type: EntryType) => boolean;
  // Company → type hint ids for the row/entry's currently-picked
  // company, in priority order (see `computeCompanyTypeHints`). When
  // non-empty, the resolved types render as a one-tap "Suggested"
  // section atop the category tier so the user skips the
  // category → type drill-down for the company's usual types. Ids that
  // don't resolve to a currently-available type (wrong sign, filtered
  // out, deleted) are silently dropped. Empty / absent ⇒ no section.
  hintTypeIds?: readonly string[];
  // When rendered inside a sheet row, the row's date + description
  // are surfaced in a small header above the listbox so the user
  // keeps that context visible while picking — the dropdown
  // physically overlaps the date and description columns on mobile.
  // `rowDate` is the pre-formatted short date; `rowDateColor` is the
  // matching month-tint CSS value (passed straight through from the
  // sheet's date column). Modal callers leave them undefined.
  rowDate?: string;
  rowDateColor?: string;
  rowDescription?: string;
  // Render style. "chip" fills a table cell; "field" looks like a form field.
  variant?: "chip" | "field";
  placeholder?: string;
  // An induced type the user hasn't accepted yet (see
  // `computeDescriptionMetadataInductions`). Only consulted when nothing
  // is selected: the empty chip renders this as a dotted, muted
  // "suggestion" badge instead of the bare "+" affordance, so an untagged
  // history row hints at its likely type. Tapping the trigger still opens
  // the normal picker — the suggestion is accepted via the Done column,
  // not by re-picking here. Ignored in the "field" variant.
  suggestedType?: EntryType | null;
};

// Two-tier picker: category list first, then a sliding type list per
// category. The shell is bespoke rather than the shared
// `EntityPickerShell` because the latter is built around a single flat
// listbox; bending it to host an animated track with internal
// navigation state would leak picker-specific concerns into a generic
// component. The pattern below mirrors `CategorySelector` further down
// this file — a button + `FloatingPanel` + plain `<ul role="listbox">`.
export function TypePicker({
  rowId,
  types,
  categories,
  selectedId,
  onSelect,
  onCreate,
  onCreateCategory,
  amountSign,
  filterFn,
  hintTypeIds,
  rowDate,
  rowDateColor,
  rowDescription,
  variant = "field",
  placeholder,
  suggestedType,
}: Props) {
  const t = useT();
  const placeholderText = placeholder ?? t("type.pickTypeEllipsis");
  // Show the header only when either side has content — an empty
  // header band over a fresh row would just be visual noise.
  const hasHeader = !!(
    (rowDate && rowDate.length > 0) ||
    (rowDescription && rowDescription.length > 0)
  );

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tier, setTier] = useState<"category" | "type">("category");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => types.find((ty) => ty.id === selectedId) ?? null,
    [types, selectedId],
  );

  // Filter pass before grouping: when the row's amount sign is known
  // (positive → income context, negative → expense context), drop
  // types whose `kind` points the wrong way. The currently-selected
  // type bypasses the filter so an already-labelled row keeps its
  // chip visible while the user reconsiders. A caller-supplied
  // `filterFn` overrides the sign-based default so non-budget sheets
  // can express their own semantics.
  const availableTypes = useMemo(() => {
    if (filterFn) {
      return types.filter((ty) => ty.id === selectedId || filterFn(ty));
    }
    if (amountSign === "positive") {
      return types.filter(
        (ty) => ty.id === selectedId || ty.kind !== "expense",
      );
    }
    if (amountSign === "negative") {
      return types.filter((ty) => ty.id === selectedId || ty.kind !== "income");
    }
    return types;
  }, [types, amountSign, filterFn, selectedId]);

  // Resolve the company's hint ids to currently-available types,
  // preserving priority order and dropping ids that filtered out (wrong
  // sign), were deleted, or are otherwise absent.
  const hintTypes = useMemo(() => {
    if (!hintTypeIds || hintTypeIds.length === 0) return [];
    const byId = new Map(availableTypes.map((ty) => [ty.id, ty]));
    const out: EntryType[] = [];
    for (const id of hintTypeIds) {
      const ty = byId.get(id);
      if (ty) out.push(ty);
    }
    return out;
  }, [hintTypeIds, availableTypes]);

  // Categories that have at least one available type. The selected
  // type's category is always kept so the back-tap target never
  // disappears under the user.
  const visibleCategories = useMemo(() => {
    const present = new Set<string>();
    for (const ty of availableTypes) present.add(ty.categoryId);
    if (selected) present.add(selected.categoryId);
    return [...categories]
      .filter((c) => present.has(c.id))
      .sort((a, b) =>
        displayCategoryName(a, t).localeCompare(displayCategoryName(b, t)),
      );
  }, [availableTypes, categories, selected, t]);

  // Types inside the active category, alphabetical by translated name.
  const typesInActiveCategory = useMemo(() => {
    if (!activeCategoryId) return [];
    return availableTypes
      .filter((ty) => ty.categoryId === activeCategoryId)
      .sort((a, b) =>
        displayTypeName(a, t).localeCompare(displayTypeName(b, t)),
      );
  }, [availableTypes, activeCategoryId, t]);

  const activeCategory = useMemo(
    () => categories.find((c) => c.id === activeCategoryId) ?? null,
    [categories, activeCategoryId],
  );

  const close = useCallback(() => {
    setOpen(false);
    setCreating(false);
  }, []);

  const handleOpen = useCallback(() => {
    if (open) {
      close();
      return;
    }
    // Re-entering the picker on a labelled row drops straight into
    // that type's category with the existing selection checkmarked,
    // so swapping within the same category stays one tap.
    if (selected) {
      setActiveCategoryId(selected.categoryId);
      setTier("type");
    } else {
      setActiveCategoryId(null);
      setTier("category");
    }
    setOpen(true);
  }, [open, close, selected]);

  const handlePickType = useCallback(
    (id: string | null) => {
      onSelect(id);
      close();
    },
    [onSelect, close],
  );

  const handlePickCategory = useCallback((id: string) => {
    setActiveCategoryId(id);
    setTier("type");
  }, []);

  const handleBackToCategories = useCallback(() => {
    setTier("category");
  }, []);

  const beginCreating = useCallback(() => {
    setOpen(false);
    setCreating(true);
  }, []);

  const isChip = variant === "chip";
  const showChevron = !isChip;

  return (
    <div ref={rootRef} className="relative inline-block w-full">
      <button
        type="button"
        className={
          isChip
            ? "flex h-full min-h-9 w-full cursor-pointer items-center justify-center gap-1.5 border-0 bg-transparent px-2 py-1 text-left font-mono text-xs hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:justify-start"
            : "field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface px-2 py-1.5 text-left text-sm hover:border-accent focus-visible:outline-none"
        }
        onClick={handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={!selected && isChip ? t("type.addType") : undefined}
      >
        {selected ? (
          isChip ? (
            <>
              <span
                className="inline-flex items-center justify-center md:hidden"
                style={{ color: selected.color }}
                aria-hidden
              >
                <CategoryIconGlyph name={selected.glyph} size={18} />
              </span>
              <span className="hidden md:inline-flex">
                <TypeChip type={selected} compact />
              </span>
            </>
          ) : (
            <TypeChip type={selected} compact={false} />
          )
        ) : isChip && suggestedType ? (
          // Nothing picked yet, but the merchant's history induces a
          // single type — render it as a dotted "suggestion" badge so the
          // row hints at its likely type. The Done column accepts it; a
          // tap here still opens the picker to choose something else.
          <TypeBadge entryType={suggestedType} suggested />
        ) : isChip ? (
          // Dashed-outlined pill mirrors the shape of a filled
          // TypeChip, so the empty state reads as "a slot you can
          // fill" instead of a stray + glyph.
          <span
            className="inline-flex items-center justify-center rounded-full border border-dashed border-muted px-1.5 py-0.5 text-muted"
            aria-hidden
          >
            <Plus size={12} aria-hidden focusable={false} />
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-muted">
            <Tag size={14} aria-hidden focusable={false} />
            <span>{placeholderText}</span>
          </span>
        )}
        {showChevron && (
          <ChevronDown
            size={12}
            className="ml-auto shrink-0 text-muted"
            aria-hidden
            focusable={false}
          />
        )}
      </button>

      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={rootRef}
        placement={PLACEMENT}
        rowId={rowId}
      >
        {hasHeader && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-line bg-surface-3 px-3 py-2 font-mono text-xs">
            {rowDate ? (
              <span
                className="font-bold tabular-nums whitespace-nowrap"
                style={rowDateColor ? { color: rowDateColor } : undefined}
              >
                {rowDate}
              </span>
            ) : null}
            {rowDescription ? (
              <span className="min-w-0 break-words text-fg">
                {rowDescription}
              </span>
            ) : null}
          </div>
        )}
        {/* `overflow-clip` instead of `overflow-hidden` so the inner
            div doesn't become a scroll container. With overflow-hidden,
            the browser's auto-scroll on focus (fired by useRovingTabindex
            when tier flips to "type" and the first type button gains
            focus) shifts this container's scrollLeft to bring the focused
            item into view, compounding with the CSS translateX and
            leaving the visible region empty. overflow:clip clips without
            establishing a scroll container, so the focus auto-scroll has
            nothing to scroll. */}
        <div className="relative overflow-clip">
          <div
            className="flex w-[200%] transition-transform duration-200 ease-out"
            style={{
              transform:
                tier === "category" ? "translateX(0%)" : "translateX(-50%)",
            }}
          >
            <div
              className={
                tier === "category"
                  ? "w-1/2 shrink-0"
                  : "pointer-events-none w-1/2 shrink-0"
              }
              aria-hidden={tier !== "category"}
            >
              {hintTypes.length > 0 && (
                <SuggestedTypes
                  types={hintTypes}
                  selectedId={selectedId}
                  onPick={handlePickType}
                  label={t("type.suggested")}
                />
              )}
              <CategoryPane
                categories={visibleCategories}
                selectedCategoryId={selected?.categoryId ?? null}
                onPick={handlePickCategory}
                onClear={selected ? () => handlePickType(null) : undefined}
                clearLabel={t("type.clearType")}
                emptyLabel={t("type.noTypesYet")}
              />
            </div>
            <div
              className={
                tier === "type"
                  ? "w-1/2 shrink-0"
                  : "pointer-events-none w-1/2 shrink-0"
              }
              aria-hidden={tier !== "type"}
            >
              <TypePane
                category={activeCategory}
                types={typesInActiveCategory}
                selectedId={selectedId}
                onBack={handleBackToCategories}
                onPick={handlePickType}
                onClear={selected ? () => handlePickType(null) : undefined}
                onCreate={beginCreating}
                backLabel={t("type.backToCategories")}
                clearLabel={t("type.clearType")}
                createLabel={t("type.newType")}
                emptyLabel={t("type.noTypesInCategory")}
              />
            </div>
          </div>
        </div>
      </FloatingPanel>
      {creating && (
        <TypeCreator
          categories={categories}
          initialCategoryId={activeCategoryId}
          onCreateCategory={onCreateCategory}
          onCancel={close}
          onSubmit={(draft) => {
            const created = onCreate(draft);
            onSelect(created.id);
            close();
          }}
        />
      )}
    </div>
  );
}

// One-tap "Suggested" band shown atop the category tier when the
// row/entry's company has associated types (see `computeCompanyTypeHints`).
// A flat row of TypeChips — picking one short-circuits the
// category → type drill-down. The full category list stays below for
// anything the company hasn't been paired with.
function SuggestedTypes({
  types,
  selectedId,
  onPick,
  label,
}: {
  types: readonly EntryType[];
  selectedId: string | null;
  onPick: (id: string) => void;
  label: string;
}) {
  return (
    <div className="border-b border-line bg-surface-3 px-2 py-2">
      <div className="px-1 pb-1.5 text-xs font-bold tracking-wider text-muted uppercase">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {types.map((ty) => (
          <button
            key={ty.id}
            type="button"
            aria-pressed={ty.id === selectedId}
            onClick={() => onPick(ty.id)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-full border-0 bg-transparent p-0 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <TypeChip type={ty} compact />
            {ty.id === selectedId && (
              <Check
                size={12}
                className="text-accent"
                aria-hidden
                focusable={false}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function CategoryPane({
  categories,
  selectedCategoryId,
  onPick,
  onClear,
  clearLabel,
  emptyLabel,
}: {
  categories: readonly Category[];
  selectedCategoryId: string | null;
  onPick: (id: string) => void;
  onClear?: () => void;
  clearLabel: string;
  emptyLabel: string;
}) {
  const initialIdx = Math.max(
    0,
    categories.findIndex((c) => c.id === selectedCategoryId),
  );
  const { isCursorAt, registerItem, onKeyDown, typeaheadQuery } =
    useRovingTabindex({
      itemCount: categories.length,
      initialIndex: initialIdx,
      active: true,
      typeaheadLabels: categories.map((c) => c.name),
    });
  return (
    <ul role="listbox" className="max-h-72 overflow-auto py-1">
      {categories.length === 0 && (
        <li className="px-3 py-2 text-xs text-muted">{emptyLabel}</li>
      )}
      {categories.map((cat, idx) => (
        <li key={cat.id}>
          <button
            ref={registerItem(idx)}
            type="button"
            role="option"
            aria-selected={cat.id === selectedCategoryId}
            tabIndex={isCursorAt(idx) ? 0 : -1}
            onClick={() => onPick(cat.id)}
            onKeyDown={onKeyDown}
            className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          >
            <CategoryChip
              category={cat}
              compact
              query={isCursorAt(idx) ? typeaheadQuery : ""}
            />
            <ChevronDown
              size={12}
              className="ml-auto shrink-0 -rotate-90 text-muted"
              aria-hidden
              focusable={false}
            />
          </button>
        </li>
      ))}
      {onClear && (
        <li>
          <button
            type="button"
            onClick={onClear}
            className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-xs text-muted hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          >
            <X size={12} aria-hidden focusable={false} />
            {clearLabel}
          </button>
        </li>
      )}
    </ul>
  );
}

function TypePane({
  category,
  types,
  selectedId,
  onBack,
  onPick,
  onClear,
  onCreate,
  backLabel,
  clearLabel,
  createLabel,
  emptyLabel,
}: {
  category: Category | null;
  types: readonly EntryType[];
  selectedId: string | null;
  onBack: () => void;
  onPick: (id: string) => void;
  onClear?: () => void;
  onCreate?: () => void;
  backLabel: string;
  clearLabel: string;
  createLabel: string;
  emptyLabel: string;
}) {
  const initialIdx = Math.max(
    0,
    types.findIndex((t) => t.id === selectedId),
  );
  const { isCursorAt, registerItem, onKeyDown, typeaheadQuery } =
    useRovingTabindex({
      itemCount: types.length,
      initialIndex: initialIdx,
      active: true,
      typeaheadLabels: types.map((ty) => ty.name),
    });
  return (
    <ul role="listbox" className="max-h-72 overflow-auto py-1">
      <li>
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className="flex w-full cursor-pointer items-center gap-2 border-0 border-b border-line bg-transparent px-3 py-1.5 text-left text-xs text-muted hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          <ChevronLeft size={14} aria-hidden focusable={false} />
          {category ? (
            <CategoryChip category={category} compact />
          ) : (
            <span>{backLabel}</span>
          )}
        </button>
      </li>
      {types.length === 0 && (
        <li className="px-3 py-2 text-xs text-muted">{emptyLabel}</li>
      )}
      {types.map((ty, idx) => (
        <Fragment key={ty.id}>
          <li>
            <button
              ref={registerItem(idx)}
              type="button"
              role="option"
              aria-selected={ty.id === selectedId}
              tabIndex={isCursorAt(idx) ? 0 : -1}
              onClick={() => onPick(ty.id)}
              onKeyDown={onKeyDown}
              className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <TypeChip
                type={ty}
                compact
                query={isCursorAt(idx) ? typeaheadQuery : ""}
              />
              {ty.id === selectedId && (
                <Check
                  size={14}
                  className="ml-auto text-accent"
                  aria-hidden
                  focusable={false}
                />
              )}
            </button>
          </li>
        </Fragment>
      ))}
      {onClear && (
        <li>
          <button
            type="button"
            onClick={onClear}
            className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-xs text-muted hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          >
            <X size={12} aria-hidden focusable={false} />
            {clearLabel}
          </button>
        </li>
      )}
      {onCreate && (
        <li className="mt-1 border-t border-line">
          <button
            type="button"
            onClick={onCreate}
            className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          >
            <Plus size={14} aria-hidden focusable={false} />
            {createLabel}
          </button>
        </li>
      )}
    </ul>
  );
}

export function TypeChip({
  type,
  compact = false,
  query,
}: {
  type: EntryType;
  compact?: boolean;
  query?: string;
}) {
  const t = useT();
  return (
    <EntityChip
      name={displayTypeName(type, t)}
      color={type.color}
      icon={type.glyph}
      compact={compact}
      query={query}
    />
  );
}

function TypeCreator({
  categories,
  initialCategoryId,
  onCreateCategory,
  onCancel,
  onSubmit,
}: {
  categories: readonly Category[];
  initialCategoryId: string | null;
  onCreateCategory?: (draft: Omit<Category, "id">) => Category;
  onCancel: () => void;
  onSubmit: (draft: Omit<EntryType, "id">) => void;
}) {
  const t = useT();
  // Pre-fill with the category the user was browsing when they tapped
  // "New type" so the form lines up with intent. Falls back to the
  // catch-all "Other" preset when nothing was active.
  const [categoryId, setCategoryId] = useState<string>(() => {
    if (initialCategoryId && categories.some((c) => c.id === initialCategoryId))
      return initialCategoryId;
    if (categories.some((c) => c.id === DEFAULT_CATEGORY_ID))
      return DEFAULT_CATEGORY_ID;
    return categories[0]?.id ?? DEFAULT_CATEGORY_ID;
  });

  return (
    <EntityCreatorForm
      glyphs={TYPE_GLYPH_NAMES}
      title={t("type.newType")}
      labels={{
        name: t("type.name"),
        namePlaceholder: t("type.namePlaceholder"),
        color: t("type.color"),
        glyph: t("type.glyph"),
        create: t("type.create"),
      }}
      extras={
        <div className="flex flex-col gap-1 text-xs text-muted">
          <span>{t("type.category")}</span>
          <CategorySelector
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            onCreate={onCreateCategory}
          />
        </div>
      }
      onCancel={onCancel}
      onSubmit={({ name, color, glyph }) =>
        onSubmit({ name, color, glyph, categoryId })
      }
    />
  );
}

// Compact category dropdown used inside the type-creator. Categories
// own colour + glyph so the button surfaces a chip preview; the
// listbox is a plain button + ul to stay consistent with the rest of
// the project's custom dropdowns (no native `<select>`).
// Same-width-as-trigger dropdown anchored to the left edge. Routed
// through `FloatingPanel` (not an inline `absolute` div) because this
// selector lives inside the `EntityCreatorForm` Modal, whose z-50
// stacking context would otherwise cap the menu's z-index against the
// dismiss backdrop and swallow every tap on a category option.
const CATEGORY_SELECTOR_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 240 },
  anchor: "left",
  coordinateSpace: "viewport",
};

function CategorySelector({
  categories,
  value,
  onChange,
  onCreate,
}: {
  categories: readonly Category[];
  value: string;
  onChange: (id: string) => void;
  // Optional. When provided, the dropdown appends a "New category"
  // footer row that opens the shared category-creator modal; the new
  // category becomes the selected value once it lands in the store.
  onCreate?: (draft: Omit<Category, "id">) => Category;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const selected = categories.find((c) => c.id === value) ?? null;
  const initialIdx = Math.max(
    0,
    categories.findIndex((c) => c.id === value),
  );
  const { isCursorAt, registerItem, onKeyDown, typeaheadQuery } =
    useRovingTabindex({
      itemCount: categories.length,
      initialIndex: initialIdx,
      active: open,
      typeaheadLabels: categories.map((c) => c.name),
    });
  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface px-2 py-1 text-left text-sm hover:border-accent focus-visible:outline-none"
      >
        {selected ? (
          <CategoryChip category={selected} compact />
        ) : (
          <span className="text-muted">{t("type.pickCategoryEllipsis")}</span>
        )}
        <ChevronDown
          size={12}
          className="ml-auto shrink-0 text-muted"
          aria-hidden
          focusable={false}
        />
      </button>
      <FloatingPanel
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        placement={CATEGORY_SELECTOR_PLACEMENT}
      >
        <ul role="listbox" className="max-h-60 overflow-auto py-1">
          {categories.map((c, idx) => (
            <li key={c.id}>
              <button
                ref={registerItem(idx)}
                type="button"
                role="option"
                aria-selected={c.id === value}
                tabIndex={isCursorAt(idx) ? 0 : -1}
                onClick={() => {
                  onChange(c.id);
                  setOpen(false);
                }}
                onKeyDown={onKeyDown}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-2 py-1 text-left text-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <CategoryChip
                  category={c}
                  compact
                  query={isCursorAt(idx) ? typeaheadQuery : ""}
                />
                {c.id === value && (
                  <Check
                    size={14}
                    className="ml-auto text-accent"
                    aria-hidden
                    focusable={false}
                  />
                )}
              </button>
            </li>
          ))}
          {onCreate && (
            <li className="mt-1 border-t border-line">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setCreating(true);
                }}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-2 py-2 text-left text-sm text-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <Plus size={14} aria-hidden focusable={false} />
                {t("category.newCategory")}
              </button>
            </li>
          )}
        </ul>
      </FloatingPanel>
      {creating && onCreate && (
        <CategoryCreator
          onCancel={() => setCreating(false)}
          onSubmit={(draft) => {
            const created = onCreate(draft);
            onChange(created.id);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
