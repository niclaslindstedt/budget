import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { DEFAULT_CATEGORY_ID, TYPE_GLYPH_NAMES } from "../data/constants";
import type { Category, EntryType } from "../data/types";
import type { FloatingPlacement } from "../hooks";
import { useT } from "../i18n";
import { displayTypeName } from "../i18n/preset-names";
import { CategoryChip } from "./CategoryPicker";
import { EntityChip } from "./EntityChip";
import { EntityCreatorForm } from "./EntityCreatorForm";
import { EntityPickerShell } from "./EntityPickerShell";
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
  // Full set of selectable categories — used to group the dropdown
  // listing and to populate the category picker inside the inline
  // type creator. Required because every type belongs to a category.
  categories: readonly Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (draft: Omit<EntryType, "id">) => EntryType;
  // Usage map (typeId → count) used to sort the dropdown so the most-
  // used entries float to the top, like a country picker's "common"
  // section. Optional — pickers without a known usage map fall back
  // to insertion order.
  usageById?: ReadonlyMap<string, number>;
  // Sign of the row's amount: "positive" hides expense-only types,
  // "negative" hides income-only types, "any"/undefined shows
  // everything. The currently selected type is always shown — once
  // a row has been labelled "Salary" we don't drop it from the
  // picker just because the user is reconsidering the sign.
  amountSign?: "positive" | "negative" | "any";
  // Render style. "chip" fills a table cell; "field" looks like a form field.
  variant?: "chip" | "field";
  placeholder?: string;
};

export function TypePicker({
  rowId,
  types,
  categories,
  selectedId,
  onSelect,
  onCreate,
  usageById,
  amountSign,
  variant = "field",
  placeholder,
}: Props) {
  const t = useT();
  const placeholderText = placeholder ?? t("type.pickTypeEllipsis");

  // Pre-sort the list: most-used first (descending count), then
  // alphabetical by display name as a stable tiebreaker. Sorting by
  // the translated name keeps the order natural for the active
  // language (preset "Bolån" sorts under B, not M from "Mortgage").
  // When `usageById` is absent we fall back to insertion order so
  // callers without usage data still render predictably.
  //
  // Filter pass before sort: when the row's amount sign is known
  // (positive → income context, negative → expense context), drop
  // types whose `kind` points the wrong way. The currently-selected
  // type bypasses the filter so an already-labelled row keeps its
  // chip visible while the user reconsiders.
  const sortedTypes = useMemo(() => {
    const filtered =
      amountSign === "positive"
        ? types.filter((tt) => tt.id === selectedId || tt.kind !== "expense")
        : amountSign === "negative"
          ? types.filter((tt) => tt.id === selectedId || tt.kind !== "income")
          : types;
    if (!usageById) return [...filtered];
    return [...filtered].sort((a, b) => {
      const ua = usageById.get(a.id) ?? 0;
      const ub = usageById.get(b.id) ?? 0;
      if (ua !== ub) return ub - ua;
      return displayTypeName(a, t).localeCompare(displayTypeName(b, t));
    });
  }, [types, usageById, amountSign, selectedId, t]);

  return (
    <EntityPickerShell
      items={sortedTypes}
      selectedId={selectedId}
      onSelect={onSelect}
      placement={PLACEMENT}
      variant={variant}
      rowId={rowId}
      labels={{
        addAriaLabel: t("type.addType"),
        fieldPlaceholder: placeholderText,
        empty: t("type.noTypesYet"),
        clear: t("type.clearType"),
        create: t("type.newType"),
      }}
      renderTrigger={(selected, isChip) => {
        if (!selected) return null;
        if (!isChip) return <TypeChip type={selected} compact={false} />;
        // Inside a sheet row, the column is narrow on mobile — show
        // the glyph alone in the type's colour so it's legible at
        // glance, and only promote to the full pill on desktop where
        // there's room for the name. Mirrors ReadonlyTypeCell.
        return (
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
        );
      }}
      renderOption={(ty) => <TypeChip type={ty} compact />}
      renderCreator={(done) => (
        <TypeCreator
          categories={categories}
          onCancel={done}
          onSubmit={(draft) => {
            const created = onCreate(draft);
            onSelect(created.id);
            done();
          }}
        />
      )}
    />
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
  onCancel,
  onSubmit,
}: {
  categories: readonly Category[];
  onCancel: () => void;
  onSubmit: (draft: Omit<EntryType, "id">) => void;
}) {
  const t = useT();
  // Default to the catch-all "Other" preset so the create form always
  // has a valid selection — the user can change it before submitting.
  const [categoryId, setCategoryId] = useState<string>(
    categories.some((c) => c.id === DEFAULT_CATEGORY_ID)
      ? DEFAULT_CATEGORY_ID
      : (categories[0]?.id ?? DEFAULT_CATEGORY_ID),
  );

  return (
    <EntityCreatorForm
      glyphs={TYPE_GLYPH_NAMES}
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
function CategorySelector({
  categories,
  value,
  onChange,
}: {
  categories: readonly Category[];
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const selected = categories.find((c) => c.id === value) ?? null;
  return (
    <div className="relative">
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
      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded border border-line bg-surface-2 py-1 shadow-lg"
        >
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
        </ul>
      )}
    </div>
  );
}
