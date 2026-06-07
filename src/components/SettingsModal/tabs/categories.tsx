import type {
  Category,
  EntryType,
  Subtype,
  UserData,
} from "../../../data/types";
import { allTypes } from "../../../data/presets/merge";
import { useT } from "../../../i18n";
import { CategoriesAndTypesAdmin } from "../admin";
import { SubtypesAdmin } from "../SubtypesAdmin";
import { Section } from "./shared";

export function CategoriesTab({
  data,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onSetPresetCategoryHidden,
  onCreateType,
  onUpdateType,
  onDeleteType,
  onSetPresetTypeHidden,
  onSetPresetTypeKind,
  onUpdateSubtype,
  onDeleteSubtype,
}: {
  data: UserData;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onUpdateCategory: (
    categoryId: string,
    patch: Partial<Omit<Category, "id">>,
  ) => void;
  onDeleteCategory: (categoryId: string) => void;
  onSetPresetCategoryHidden: (presetId: string, hidden: boolean) => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onUpdateType: (typeId: string, patch: Partial<Omit<EntryType, "id">>) => void;
  onDeleteType: (typeId: string) => void;
  onSetPresetTypeHidden: (presetId: string, hidden: boolean) => void;
  onSetPresetTypeKind: (
    presetId: string,
    kind: "income" | "expense" | "any",
  ) => void;
  onUpdateSubtype: (
    subtypeId: string,
    patch: Partial<Omit<Subtype, "id">>,
  ) => void;
  onDeleteSubtype: (subtypeId: string) => void;
}) {
  const t = useT();
  return (
    <>
      <Section title={t("settings.categoriesTab.title")}>
        <CategoriesAndTypesAdmin
          userCategories={data.categories}
          userTypes={data.types}
          hiddenPresetCategoryIds={data.hiddenPresetCategoryIds}
          hiddenPresetTypeIds={data.hiddenPresetTypeIds}
          presetTypeKindOverrides={data.presetTypeKindOverrides}
          onCreateCategory={onCreateCategory}
          onUpdateCategory={onUpdateCategory}
          onDeleteCategory={onDeleteCategory}
          onSetPresetCategoryHidden={onSetPresetCategoryHidden}
          onCreateType={onCreateType}
          onUpdateType={onUpdateType}
          onDeleteType={onDeleteType}
          onSetPresetTypeHidden={onSetPresetTypeHidden}
          onSetPresetTypeKind={onSetPresetTypeKind}
        />
      </Section>
      <Section title={t("settings.categoriesTab.subtypesTitle")}>
        <SubtypesAdmin
          subtypes={data.subtypes}
          types={allTypes(data)}
          onUpdateSubtype={onUpdateSubtype}
          onDeleteSubtype={onDeleteSubtype}
        />
      </Section>
    </>
  );
}
