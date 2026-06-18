import { COMPANY_CATEGORY_GLYPH_NAMES } from "../data/constants/taxonomy";
import type { CompanyCategory } from "../data/types";
import type { FloatingPlacement } from "../hooks";
import { useT } from "../i18n";
import { displayCompanyCategoryName } from "../i18n/preset-names";
import { EntityChip } from "./EntityChip";
import { EntityCreatorForm } from "./EntityCreatorForm";
import { EntityPickerShell } from "./EntityPickerShell";
import { CategoryIconGlyph } from "./icons";

// Single-tier picker for `CompanyCategory`. Mirrors `CategoryPicker`:
// the same `EntityPickerShell` + `EntityChip` + `EntityCreatorForm`
// scaffolding, only the labels, glyph subset, and preset-name resolver
// differ. Used in the company editor (Settings → Companies) to classify
// a merchant.
const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 224 },
  anchor: "right",
  coordinateSpace: "viewport",
};

type Props = {
  rowId?: string;
  companyCategories: readonly CompanyCategory[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (draft: Omit<CompanyCategory, "id">) => CompanyCategory;
  variant?: "chip" | "field";
  placeholder?: string;
};

export function CompanyCategoryPicker({
  rowId,
  companyCategories,
  selectedId,
  onSelect,
  onCreate,
  variant = "field",
  placeholder,
}: Props) {
  const t = useT();
  const placeholderText =
    placeholder ?? t("companyCategory.addCompanyCategoryEllipsis");

  return (
    <EntityPickerShell
      items={companyCategories}
      selectedId={selectedId}
      onSelect={onSelect}
      placement={PLACEMENT}
      variant={variant}
      rowId={rowId}
      labels={{
        addAriaLabel: t("companyCategory.addCompanyCategory"),
        fieldPlaceholder: placeholderText,
        empty: t("companyCategory.noCompanyCategoriesYet"),
        clear: t("companyCategory.clearCompanyCategory"),
        create: t("companyCategory.newCompanyCategory"),
      }}
      renderTrigger={(selected, isChip) => {
        if (!selected) return null;
        if (!isChip) return <CompanyCategoryChip companyCategory={selected} />;
        return (
          <>
            <span
              className="inline-flex items-center justify-center md:hidden"
              style={{ color: selected.color }}
              aria-hidden
            >
              <CategoryIconGlyph name={selected.icon} size={18} />
            </span>
            <span className="hidden md:inline-flex">
              <CompanyCategoryChip companyCategory={selected} compact />
            </span>
          </>
        );
      }}
      renderOption={(cat) => (
        <CompanyCategoryChip companyCategory={cat} compact />
      )}
      getLabel={(cat) => cat.name}
      renderCreator={(done) => (
        <CompanyCategoryCreator
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

export function CompanyCategoryChip({
  companyCategory,
  compact = false,
}: {
  companyCategory: CompanyCategory;
  compact?: boolean;
}) {
  const t = useT();
  return (
    <EntityChip
      name={displayCompanyCategoryName(companyCategory, t)}
      color={companyCategory.color}
      icon={companyCategory.icon}
      compact={compact}
    />
  );
}

export function CompanyCategoryCreator({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (draft: Omit<CompanyCategory, "id">) => void;
}) {
  const t = useT();
  return (
    <EntityCreatorForm
      glyphs={COMPANY_CATEGORY_GLYPH_NAMES}
      title={t("companyCategory.newCompanyCategory")}
      labels={{
        name: t("companyCategory.name"),
        namePlaceholder: t("companyCategory.namePlaceholder"),
        color: t("companyCategory.color"),
        glyph: t("companyCategory.icon"),
        create: t("companyCategory.create"),
      }}
      onCancel={onCancel}
      onSubmit={({ name, color, glyph }) =>
        onSubmit({ name, color, icon: glyph })
      }
    />
  );
}
