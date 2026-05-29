import {
  SEARCH_FIELD_WEIGHT_MAX,
  SEARCH_FIELD_WEIGHT_MIN,
  SEARCH_MAX_RESULTS_OPTIONS,
} from "../../../data/constants/defaults";
import type {
  SearchFieldWeights,
  SearchRankingSettings,
  Settings,
} from "../../../data/types";
import { useT } from "../../../i18n";
import { type SelectOption, SelectPicker, Slider } from "../../form";
import { Field, Section, type Update } from "./shared";

// Display order of the importance sliders — mirrors the default weight
// ordering (description > tag > company > type > category > bank text)
// so the tab reads top-to-bottom as "most important first" on a fresh
// install. `key` is the `SearchFieldWeights` field; `labelKey` resolves
// to the i18n label.
const WEIGHT_FIELDS: {
  key: keyof SearchFieldWeights;
  labelKey:
    | "fieldDescription"
    | "fieldTag"
    | "fieldCompany"
    | "fieldType"
    | "fieldCategory"
    | "fieldBank";
}[] = [
  { key: "description", labelKey: "fieldDescription" },
  { key: "tag", labelKey: "fieldTag" },
  { key: "company", labelKey: "fieldCompany" },
  { key: "type", labelKey: "fieldType" },
  { key: "category", labelKey: "fieldCategory" },
  { key: "bankDescription", labelKey: "fieldBank" },
];

const TRIGGER_CLASS =
  "field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none";

export function SearchTab({
  draft,
  onUpdate,
}: {
  draft: Settings;
  onUpdate: Update;
}) {
  const t = useT();
  const ranking = draft.searchRanking;

  function patch(next: Partial<SearchRankingSettings>): void {
    onUpdate("searchRanking", { ...ranking, ...next });
  }
  function setWeight(key: keyof SearchFieldWeights, value: number): void {
    patch({ fieldWeights: { ...ranking.fieldWeights, [key]: value } });
  }

  const priorityOptions: SelectOption<SearchRankingSettings["priority"]>[] = [
    { value: "quality", label: t("settings.search.priorityQuality") },
    { value: "field", label: t("settings.search.priorityField") },
  ];
  const recencyOptions: SelectOption<SearchRankingSettings["recency"]>[] = [
    { value: "off", label: t("settings.search.recencyOff") },
    { value: "tiebreak", label: t("settings.search.recencyTiebreak") },
    { value: "boost", label: t("settings.search.recencyBoost") },
  ];

  return (
    <>
      <Section title={t("settings.search.rankingSection")}>
        <Field label={t("settings.search.priority")}>
          <SelectPicker
            value={ranking.priority}
            options={priorityOptions}
            onChange={(v) => patch({ priority: v })}
            ariaLabel={t("settings.search.priority")}
            triggerClassName={TRIGGER_CLASS}
          />
          <p className="text-xs text-muted">
            {t("settings.search.priorityHint")}
          </p>
        </Field>
        <Field label={t("settings.search.recency")}>
          <SelectPicker
            value={ranking.recency}
            options={recencyOptions}
            onChange={(v) => patch({ recency: v })}
            ariaLabel={t("settings.search.recency")}
            triggerClassName={TRIGGER_CLASS}
          />
          <p className="text-xs text-muted">
            {t("settings.search.recencyHint")}
          </p>
        </Field>
      </Section>

      <Section title={t("settings.search.weightsSection")}>
        <p className="text-xs text-muted">{t("settings.search.weightsHint")}</p>
        {WEIGHT_FIELDS.map((f) => (
          <Field key={f.key} label={t(`settings.search.${f.labelKey}`)}>
            <div className="flex w-full items-center gap-3">
              <div className="min-w-0 flex-1">
                <Slider
                  min={SEARCH_FIELD_WEIGHT_MIN}
                  max={SEARCH_FIELD_WEIGHT_MAX}
                  value={ranking.fieldWeights[f.key]}
                  onChange={(v) => setWeight(f.key, v)}
                  ariaLabel={t(`settings.search.${f.labelKey}`)}
                />
              </div>
              <span className="w-6 text-right font-mono text-sm tabular-nums text-fg-bright">
                {ranking.fieldWeights[f.key]}
              </span>
            </div>
          </Field>
        ))}
      </Section>

      <Section title={t("settings.search.matchingSection")}>
        <Field label={t("settings.search.amountTolerance")}>
          <div className="flex w-full items-center gap-3">
            <div className="min-w-0 flex-1">
              <Slider
                min={0}
                max={100}
                value={ranking.amountTolerancePct}
                onChange={(v) => patch({ amountTolerancePct: v })}
                ariaLabel={t("settings.search.amountTolerance")}
                formatValueText={(v) => `${v}%`}
              />
            </div>
            <span className="w-10 text-right font-mono text-sm tabular-nums text-fg-bright">
              {ranking.amountTolerancePct}%
            </span>
          </div>
          <p className="text-xs text-muted">
            {t("settings.search.amountToleranceHint")}
          </p>
        </Field>
        <Field label={t("settings.search.maxResults")}>
          <div className="w-24">
            <SelectPicker
              value={ranking.maxResults}
              options={SEARCH_MAX_RESULTS_OPTIONS.map((n) => ({
                value: n,
                label: n,
              }))}
              onChange={(v) => patch({ maxResults: v })}
              ariaLabel={t("settings.search.maxResults")}
              triggerClassName={`${TRIGGER_CLASS} font-mono tabular-nums`}
              panelClassName="font-mono tabular-nums"
            />
          </div>
          <p className="text-xs text-muted">
            {t("settings.search.maxResultsHint")}
          </p>
        </Field>
      </Section>
    </>
  );
}
