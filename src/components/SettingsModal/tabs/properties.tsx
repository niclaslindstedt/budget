import type { PropertySizeUnit, Settings } from "../../../data/types";
import { useT } from "../../../i18n";
import { SelectPicker } from "../../form";
import { Field, Preview, Section, type Update } from "./shared";

// Settings for the Properties page. Today this is just the unit a
// property's living area renders with — both options describe the same
// square-metre number stored on `Property.size`, so the choice is
// display-only. New property-wide preferences land here.
const SIZE_UNITS: readonly PropertySizeUnit[] = ["kvm", "sqm"];

export function PropertiesTab({
  draft,
  onUpdate,
}: {
  draft: Settings;
  onUpdate: Update;
}) {
  const t = useT();

  return (
    <Section title={t("settings.properties.sizeTitle")}>
      <p className="text-xs text-muted">{t("settings.properties.sizeHint")}</p>
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
          onChange={(v) => onUpdate("propertySizeUnit", v as PropertySizeUnit)}
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
  );
}
