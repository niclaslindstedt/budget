import { allTypes } from "../../../data/presets/merge";
import type {
  FileCategory,
  PropertySizeUnit,
  Settings,
  Subtype,
  UserData,
} from "../../../data/types";
import { useT } from "../../../i18n";
import { SelectPicker } from "../../form";
import { FileCategoriesAdmin } from "../FileCategoriesAdmin";
import { SubtypesAdmin } from "../SubtypesAdmin";
import { Field, Preview, Section, type Update } from "./shared";

// Settings for the Properties page: the unit a property's living area renders
// with (display-only), the Repairs / Renovations subtype admin, and the file
// categories that subfolder a property's uploaded files.
const SIZE_UNITS: readonly PropertySizeUnit[] = ["kvm", "sqm"];

export function PropertiesTab({
  draft,
  data,
  onUpdate,
  onUpdateSubtype,
  onDeleteSubtype,
  onCreateFileCategory,
  onUpdateFileCategory,
  onDeleteFileCategory,
}: {
  draft: Settings;
  data: UserData;
  onUpdate: Update;
  // Repairs / Renovations subtype admin — minted from the property repairs
  // editor; this tab renames / deletes the existing ones.
  onUpdateSubtype: (
    subtypeId: string,
    patch: Partial<Omit<Subtype, "id">>,
  ) => void;
  onDeleteSubtype: (subtypeId: string) => void;
  // File-category admin — the subfolders uploaded property files are filed
  // under. Created here (or inline while uploading), renamed / deleted here.
  onCreateFileCategory: (name: string) => FileCategory;
  onUpdateFileCategory: (
    categoryId: string,
    patch: Partial<Omit<FileCategory, "id">>,
  ) => void;
  onDeleteFileCategory: (categoryId: string) => void;
}) {
  const t = useT();

  return (
    <>
      <Section title={t("settings.properties.sizeTitle")}>
        <p className="text-xs text-muted">
          {t("settings.properties.sizeHint")}
        </p>
        <Field label={t("settings.properties.sizeUnit")}>
          <SelectPicker
            value={draft.propertySizeUnit}
            options={SIZE_UNITS.map((unit) => ({
              value: unit,
              label: t(
                unit === "kvm"
                  ? "settings.properties.unitKvm"
                  : "settings.properties.unitSqm",
              ),
            }))}
            onChange={(v) =>
              onUpdate("propertySizeUnit", v as PropertySizeUnit)
            }
            ariaLabel={t("settings.properties.sizeUnit")}
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
          />
          <Preview>
            {t("settings.properties.sizeExample", {
              unit: draft.propertySizeUnit,
            })}
          </Preview>
        </Field>
      </Section>

      <Section title={t("settings.properties.subtypesTitle")}>
        <SubtypesAdmin
          bucket="repairs"
          subtypes={data.subtypes}
          types={allTypes(data)}
          onUpdateSubtype={onUpdateSubtype}
          onDeleteSubtype={onDeleteSubtype}
        />
      </Section>

      <Section title={t("settings.properties.fileCategoriesTitle")}>
        <FileCategoriesAdmin
          categories={data.fileCategories}
          onCreate={onCreateFileCategory}
          onUpdate={onUpdateFileCategory}
          onDelete={onDeleteFileCategory}
        />
      </Section>
    </>
  );
}
