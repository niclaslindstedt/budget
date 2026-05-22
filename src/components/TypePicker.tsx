import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, Plus, Tag, X } from "lucide-react";

import { DEFAULT_CATEGORY_ID, TYPE_GLYPH_NAMES } from "../data/constants";
import type { Category, EntryType } from "../data/types";
import type { FloatingPlacement } from "../hooks";
import { useT } from "../i18n";
import { displayCategoryName, displayTypeName } from "../i18n/preset-names";
import { CategoryChip, CategoryCreator } from "./CategoryPicker";
import { EntityChip } from "./EntityChip";
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
  rowDate,
  rowDateColor,
  rowDescription,
  variant = "field",
  placeholder,
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
  // chip visible while the user reconsiders.
  const availableTypes = useMemo(() => {
    if (amountSign === "positive") {
      return types.filter(
        (ty) => ty.id === selectedId || ty.kind !== "expense",
      );
    }
    if (amountSign === "negative") {
      return types.filter((ty) => ty.id === selectedId || ty.kind !== "income");
    }
    return types;
  }, [types, amountSign, selectedId]);

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
            ? "flex h-full min-h-9 w-full cursor-pointer items-center justify-center gap-1.5 border-0 bg-transparent px-2 py-1 text-left font-mono text-xs hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
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
        <div className="relative overflow-hidden">
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
              <CategoryPane
                categories={visibleCategories}
                selectedCategoryId={selected?.categoryId ?? null}
                onPick={handlePickCategory}
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

function CategoryPane({
  categories,
  selectedCategoryId,
  onPick,
  emptyLabel,
}: {
  categories: readonly Category[];
  selectedCategoryId: string | null;
  onPick: (id: string) => void;
  emptyLabel: string;
}) {
  return (
    <ul role="listbox" className="max-h-72 overflow-auto py-1">
      {categories.length === 0 && (
        <li className="px-3 py-2 text-xs text-muted">{emptyLabel}</li>
      )}
      {categories.map((cat) => (
        <li key={cat.id}>
          <button
            type="button"
            role="option"
            aria-selected={cat.id === selectedCategoryId}
            onClick={() => onPick(cat.id)}
            className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          >
            <CategoryChip category={cat} compact />
            <ChevronDown
              size={12}
              className="ml-auto shrink-0 -rotate-90 text-muted"
              aria-hidden
              focusable={false}
            />
          </button>
        </li>
      ))}
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
      {types.map((ty) => (
        <Fragment key={ty.id}>
          <li>
            <button
              type="button"
              role="option"
              aria-selected={ty.id === selectedId}
              onClick={() => onPick(ty.id)}
              className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <TypeChip type={ty} compact />
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
}: {
  type: EntryType;
  compact?: boolean;
}) {
  const t = useT();
  return (
    <EntityChip
      name={displayTypeName(type, t)}
      color={type.color}
      icon={type.glyph}
      compact={compact}
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
          {categories.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={c.id === value}
                onClick={() => {
                  onChange(c.id);
                  setOpen(false);
                }}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-2 py-1 text-left text-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <CategoryChip category={c} compact />
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
