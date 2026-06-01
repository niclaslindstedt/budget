import { useMemo } from "react";

import { getDefaultItemFindThreshold } from "../../../data/constants/currency";
import { allTypes } from "../../../data/presets/merge";
import type { Settings, UserData } from "../../../data/types";
import { useT } from "../../../i18n";
import { withCurrency } from "../../../utils/format";
import { TypeChip } from "../../TypePicker";
import { Field, Section, type Update } from "./shared";

export function ItemsTab({
  draft,
  data,
  ignoredItemEntryCount,
  onUpdate,
  onClearIgnoredItemEntries,
}: {
  draft: Settings;
  // Whole workspace — the optional scan allow-list lists preset +
  // user-added entry types via `allTypes`.
  data: UserData;
  ignoredItemEntryCount: number;
  onUpdate: Update;
  onClearIgnoredItemEntries: () => void;
}) {
  const t = useT();
  const types = useMemo(() => allTypes(data), [data]);
  const selected = new Set(draft.itemFindTypeIds);
  const currencyDefault = getDefaultItemFindThreshold(draft.currency);

  function toggleType(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onUpdate("itemFindTypeIds", [...next]);
  }

  return (
    <>
      <Section title={t("settings.items.scanTitle")}>
        <Field label={t("settings.items.threshold")}>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              inputMode="decimal"
              value={
                Number.isFinite(draft.itemFindThreshold)
                  ? draft.itemFindThreshold
                  : 0
              }
              onChange={(e) => {
                const n = Number(e.target.value);
                onUpdate(
                  "itemFindThreshold",
                  Number.isFinite(n) && n >= 0 ? n : 0,
                );
              }}
              aria-label={t("settings.items.threshold")}
              className="field-input w-32 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm tabular-nums text-fg-bright"
            />
            <span className="text-xs text-muted">
              {withCurrency("", draft).trim() || draft.currency}
            </span>
            {draft.itemFindThreshold !== currencyDefault && (
              <button
                type="button"
                onClick={() => onUpdate("itemFindThreshold", currencyDefault)}
                className="cursor-pointer rounded border border-line px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
              >
                {t("settings.items.resetThreshold")}
              </button>
            )}
          </div>
        </Field>
        <p className="text-xs text-muted">
          {t("settings.items.thresholdHint")}
        </p>
      </Section>

      <Section title={t("settings.items.typeFilterTitle")}>
        <p className="text-xs text-muted">
          {t("settings.items.typeFilterHint")}
        </p>
        {types.length === 0 ? (
          <p className="text-xs text-muted">{t("settings.items.noTypes")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {types.map((type) => {
              const on = selected.has(type.id);
              return (
                <button
                  key={type.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleType(type.id)}
                  className={`cursor-pointer rounded border px-1.5 py-1 ${
                    on
                      ? "border-accent bg-accent/10"
                      : "border-line bg-surface-2 opacity-60 hover:opacity-100"
                  }`}
                >
                  <TypeChip type={type} compact />
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section title={t("settings.items.ignoredTitle")}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-fg">
            {t("settings.items.ignoredLabel")}
          </span>
          <button
            type="button"
            onClick={onClearIgnoredItemEntries}
            disabled={ignoredItemEntryCount === 0}
            className="cursor-pointer rounded border border-line px-2.5 py-1 text-xs text-muted hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("settings.items.clearIgnored")}
          </button>
        </div>
        <p className="text-xs text-muted">
          {ignoredItemEntryCount === 0
            ? t("settings.items.ignoredNone")
            : t("settings.items.ignoredHint", { n: ignoredItemEntryCount })}
        </p>
      </Section>
    </>
  );
}
