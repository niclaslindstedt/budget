import type {
  Category,
  Company,
  EntryType,
  Subtype,
  Tag,
} from "../../data/types";
import { useT } from "../../i18n";
import { CompanyPicker } from "../CompanyPicker";
import { SubtypePicker } from "../SubtypePicker";
import { TagsPicker } from "../TagsPicker";

// The shared subtype / company / tags field stack rendered by both repair
// editors — `RepairsEditModal` (transaction-backed) and `ManualRepairModal`
// (free-standing). Presentational only: each owner keeps its own divergent
// commit handler and reset logic; this component just renders the three
// pickers against the passed value/onChange pairs so the field trio doesn't
// drift between the two editors.
//
// `subtypes` arrives already scoped to the chosen Repairs / Renovations type;
// `fixedParentTypeId` files a freshly-created subtype under that parent.
// `showEntryHints` is set only by the transaction-backed editor, where the
// company and tags live on the underlying bank transaction (not the repair),
// so the hint spans explain that editing them enriches the budget / search
// view too.

type Props = {
  subtypes: readonly Subtype[];
  types: readonly EntryType[];
  categories: readonly Category[];
  companies: readonly Company[];
  tags: readonly Tag[];
  subtypeId: string | null;
  onSubtypeChange: (id: string | null) => void;
  fixedParentTypeId: string | undefined;
  companyId: string | null;
  onCompanyChange: (id: string | null) => void;
  tagIds: string[];
  onTagsChange: (ids: string[]) => void;
  showEntryHints?: boolean;
  onCreateSubtype: (draft: Omit<Subtype, "id">) => Subtype;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
  onCreateTag: (draft: Omit<Tag, "id">) => Tag;
};

export function RepairFields({
  subtypes,
  types,
  categories,
  companies,
  tags,
  subtypeId,
  onSubtypeChange,
  fixedParentTypeId,
  companyId,
  onCompanyChange,
  tagIds,
  onTagsChange,
  showEntryHints = false,
  onCreateSubtype,
  onCreateType,
  onCreateCategory,
  onCreateCompany,
  onCreateTag,
}: Props) {
  const t = useT();
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">
          {t("properties.repairSubtypeLabel")}
        </span>
        <SubtypePicker
          subtypes={subtypes}
          types={types}
          categories={categories}
          selectedId={subtypeId}
          onSelect={onSubtypeChange}
          onCreate={onCreateSubtype}
          onCreateType={onCreateType}
          onCreateCategory={onCreateCategory}
          fixedParentTypeId={fixedParentTypeId}
          placeholder={t("properties.repairSubtypePlaceholder")}
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">
          {t("properties.repairCompanyLabel")}
        </span>
        <CompanyPicker
          variant="field"
          companies={companies}
          selectedId={companyId}
          onSelect={onCompanyChange}
          onCreate={onCreateCompany}
        />
        {showEntryHints && (
          <span className="text-xs text-muted">
            {t("properties.repairCompanyHint")}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">
          {t("properties.repairTagsLabel")}
        </span>
        <TagsPicker
          tags={tags}
          selectedIds={tagIds}
          onChange={onTagsChange}
          onCreate={onCreateTag}
        />
        {showEntryHints && (
          <span className="text-xs text-muted">
            {t("properties.repairTagsHint")}
          </span>
        )}
      </div>
    </>
  );
}
