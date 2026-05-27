import { CATEGORY_GLYPH_NAMES } from "../data/constants/taxonomy";
import type { Category } from "../data/types";
import type { FloatingPlacement } from "../hooks";
import { useT } from "../i18n";
import { displayCategoryName } from "../i18n/preset-names";
import { EntityChip } from "./EntityChip";
import { EntityCreatorForm } from "./EntityCreatorForm";
import { EntityPickerShell } from "./EntityPickerShell";
import { CategoryIconGlyph } from "./icons";

// Right-aligned with the trigger so the dropdown opens "down and to the
// left" of narrow chip cells; the hook clamps to the viewport so it
// never goes off-screen.
const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 224 }, // matches min-w-[14rem]
  anchor: "right",
  coordinateSpace: "viewport",
};

type Props = {
  // When rendered inside a sheet row, the row's id wires the picker
  // into the active-row coordinator so outside clicks dismiss it
  // without also firing whatever was clicked. Modals (BulkEdit,
  // SheetModal, ComplexEntry) leave it undefined.
  rowId?: string;
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (draft: Omit<Category, "id">) => Category;
  // Render style. "chip" fills a table cell; "field" looks like a form field.
  variant?: "chip" | "field";
  placeholder?: string;
};

export function CategoryPicker({
  rowId,
  categories,
  selectedId,
  onSelect,
  onCreate,
  variant = "chip",
  placeholder,
}: Props) {
  const t = useT();
  const placeholderText = placeholder ?? t("category.addCategoryEllipsis");

  return (
    <EntityPickerShell
      items={categories}
      selectedId={selectedId}
      onSelect={onSelect}
      placement={PLACEMENT}
      variant={variant}
      rowId={rowId}
      labels={{
        addAriaLabel: t("category.addCategory"),
        fieldPlaceholder: placeholderText,
        empty: t("category.noCategoriesYet"),
        clear: t("category.clearCategory"),
        create: t("category.newCategory"),
      }}
      renderTrigger={(selected, isChip) => {
        if (!selected) return null;
        if (!isChip) return <CategoryChip category={selected} />;
        return (
          <>
            {/* Mobile: glyph only, in the category's colour, prominent.
               The cell is 40px wide on mobile — a chip with a tinted
               background fades into the row, so render the bare icon
               instead and let the colour carry the identity. */}
            <span
              className="inline-flex items-center justify-center md:hidden"
              style={{ color: selected.color }}
              aria-hidden
            >
              <CategoryIconGlyph name={selected.icon} size={18} />
            </span>
            {/* Desktop: full chip with glyph + name. */}
            <span className="hidden md:inline-flex">
              <CategoryChip category={selected} compact />
            </span>
          </>
        );
      }}
      renderOption={(cat) => <CategoryChip category={cat} compact />}
      renderCreator={(done) => (
        <CategoryCreator
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

export function CategoryChip({
  category,
  compact = false,
}: {
  category: Category;
  compact?: boolean;
}) {
  const t = useT();
  return (
    <EntityChip
      name={displayCategoryName(category, t)}
      color={category.color}
      icon={category.icon}
      compact={compact}
    />
  );
}

export function CategoryCreator({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (draft: Omit<Category, "id">) => void;
}) {
  const t = useT();
  return (
    <EntityCreatorForm
      glyphs={CATEGORY_GLYPH_NAMES}
      title={t("category.newCategory")}
      labels={{
        name: t("category.name"),
        namePlaceholder: t("category.namePlaceholder"),
        color: t("category.color"),
        glyph: t("category.icon"),
        create: t("category.create"),
      }}
      onCancel={onCancel}
      onSubmit={({ name, color, glyph }) =>
        onSubmit({ name, color, icon: glyph })
      }
    />
  );
}
