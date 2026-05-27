import { CURRENCY_PRESETS } from "../../../data/constants/currency";
import {
  DATE_FORMATS,
  SHORT_DATE_FORMATS,
} from "../../../data/constants/format";
import type {
  DateFormat,
  DecimalSeparator,
  Settings,
  ShortDateFormat,
  ThousandsSeparator,
} from "../../../data/types";
import { type Lang, useT } from "../../../i18n";
import { formatAmount } from "../../../utils/format";
import { ClearableInput, SelectPicker } from "../../form";
import {
  DeviceScopeHint,
  Field,
  Preview,
  Section,
  ToggleRow,
  type Update,
} from "./shared";

export function FormatTab({
  draft,
  currencyPresetId,
  onUpdate,
  onApplyCurrencyPreset,
  onApplyDecimal,
}: {
  draft: Settings;
  // Authoritative selection for the currency preset picker. Owned by
  // SettingsModal so a click on NOK/DKK/ISK/CAD doesn't snap back to
  // SEK/USD (they share the same display triplet).
  currencyPresetId: string;
  onUpdate: Update;
  onApplyCurrencyPreset: (id: string) => void;
  onApplyDecimal: (d: DecimalSeparator) => void;
}) {
  const t = useT();
  // Three samples so each Numbers setting stays previewable regardless of
  // the others: 12.34 always shows decimal/decimal-separator behaviour
  // (below the abbreviate threshold), 1234.56 adds thousands grouping,
  // and 1234567.89 exercises the abbreviator when that toggle is on.
  const numberPreviewSamples = [12.34, 1234.56, 1234567.89];
  const datePreviewIso = "2026-05-16";
  const showCustomCurrency = currencyPresetId === "custom";

  return (
    <>
      <Section title={t("settings.format.dateTitle")}>
        <Field label={t("settings.format.dateFormat")}>
          <SelectPicker
            value={draft.dateFormat}
            options={DATE_FORMATS.map((f) => ({ value: f, label: f }))}
            onChange={(v) => onUpdate("dateFormat", v as DateFormat)}
            ariaLabel={t("settings.format.dateFormat")}
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
            panelClassName="font-mono tabular-nums"
          />
          <Preview>
            {formatDatePreview(
              datePreviewIso,
              draft.dateFormat,
              draft.language,
            )}
          </Preview>
        </Field>

        <Field label={t("settings.format.shortDateFormat")}>
          <SelectPicker
            value={draft.shortDateFormat}
            options={SHORT_DATE_FORMATS.map((f) => ({ value: f, label: f }))}
            onChange={(v) => onUpdate("shortDateFormat", v as ShortDateFormat)}
            ariaLabel={t("settings.format.shortDateFormat")}
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
            panelClassName="font-mono tabular-nums"
          />
          <Preview>
            {formatShortDatePreview(
              datePreviewIso,
              draft.shortDateFormat,
              draft.language,
            )}
          </Preview>
          <p className="text-xs text-muted">
            {t("settings.format.shortDateFormatHint")}
          </p>
        </Field>
      </Section>

      <Section title={t("settings.format.numberTitle")}>
        <Field label={t("settings.format.numberPreview")}>
          {numberPreviewSamples.map((sample) => (
            <Preview key={sample}>{formatAmount(sample, draft)}</Preview>
          ))}
        </Field>

        <Field label={t("settings.format.currencyPreset")}>
          <SelectPicker
            value={currencyPresetId}
            options={[
              ...CURRENCY_PRESETS.map((p) => ({
                value: p.id,
                label: p.codes.join("/"),
                hint: t(p.nameKey as Parameters<typeof t>[0]),
              })),
              {
                value: "custom",
                label: t("settings.format.currencyCustom"),
              },
            ]}
            onChange={onApplyCurrencyPreset}
            ariaLabel={t("settings.format.currencyPreset")}
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
          />
        </Field>

        {showCustomCurrency && (
          <>
            <Field label={t("settings.format.currencyToken")}>
              <ClearableInput
                value={draft.currency}
                onValueChange={(v) => onUpdate("currency", v)}
                maxLength={6}
                wrapperClassName="w-24"
                className="field-input w-24 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
              />
            </Field>

            <Field label={t("settings.format.currencyPosition")}>
              <div className="inline-flex overflow-hidden rounded border border-line">
                {(["before", "after"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onUpdate("currencyPosition", p)}
                    aria-pressed={draft.currencyPosition === p}
                    className={`cursor-pointer border-0 px-3 py-1.5 font-mono text-sm ${
                      draft.currencyPosition === p
                        ? "bg-accent/15 text-accent"
                        : "bg-surface-2 text-fg hover:bg-surface-3"
                    }`}
                  >
                    {p === "before"
                      ? t("settings.format.currencyBefore")
                      : t("settings.format.currencyAfter")}
                  </button>
                ))}
              </div>
            </Field>

            <ToggleRow
              label={t("settings.format.currencySpace")}
              checked={draft.currencySpace}
              onChange={(v) => onUpdate("currencySpace", v)}
            />
          </>
        )}

        <Field label={t("settings.format.decimalSeparator")}>
          <div className="inline-flex overflow-hidden rounded border border-line">
            {([".", ","] as DecimalSeparator[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onApplyDecimal(d)}
                aria-pressed={draft.decimalSeparator === d}
                className={`cursor-pointer border-0 px-3 py-1.5 font-mono text-sm ${
                  draft.decimalSeparator === d
                    ? "bg-accent/15 text-accent"
                    : "bg-surface-2 text-fg hover:bg-surface-3"
                }`}
              >
                {d === "." ? "." : ","}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t("settings.format.thousandsSeparator")}>
          <div className="inline-flex overflow-hidden rounded border border-line">
            {(
              [
                { value: " " as ThousandsSeparator, label: " " },
                { value: "." as ThousandsSeparator, label: "." },
                { value: "," as ThousandsSeparator, label: "," },
              ] as const
            ).map((opt) => {
              const selected =
                draft.thousandsSeparator === opt.value ||
                (draft.thousandsSeparator === "" && opt.value === " ");
              const disabled = !draft.formatNumbers;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onUpdate("thousandsSeparator", opt.value)}
                  aria-pressed={selected}
                  disabled={disabled}
                  className={`border-0 px-3 py-1.5 font-mono text-sm ${
                    disabled
                      ? "cursor-not-allowed bg-surface-2 text-muted opacity-50"
                      : selected
                        ? "cursor-pointer bg-accent/15 text-accent"
                        : "cursor-pointer bg-surface-2 text-fg hover:bg-surface-3"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </Field>
      </Section>

      <Section title={t("settings.format.displayTitle")}>
        <DeviceScopeHint />
        <ToggleRow
          label={t("settings.format.formatNumbers")}
          checked={draft.formatNumbers}
          onChange={(v) => onUpdate("formatNumbers", v)}
        />
        <ToggleRow
          label={t("settings.format.showCurrency")}
          checked={draft.showCurrency}
          onChange={(v) => onUpdate("showCurrency", v)}
        />
        <ToggleRow
          label={t("settings.format.showDecimals")}
          checked={draft.showDecimals}
          onChange={(v) => onUpdate("showDecimals", v)}
        />
        <ToggleRow
          label={t("settings.format.abbreviate")}
          checked={draft.abbreviateNumbers}
          onChange={(v) => onUpdate("abbreviateNumbers", v)}
        />
        {draft.abbreviateNumbers && (
          <ToggleRow
            label={t("settings.format.alwaysAbbreviateBalance")}
            checked={draft.alwaysAbbreviateBalance}
            onChange={(v) => onUpdate("alwaysAbbreviateBalance", v)}
          />
        )}
      </Section>
    </>
  );
}

const MONTH_PREVIEW: Record<Lang, readonly string[]> = {
  en: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ],
  sv: [
    "jan",
    "feb",
    "mar",
    "apr",
    "maj",
    "jun",
    "jul",
    "aug",
    "sep",
    "okt",
    "nov",
    "dec",
  ],
};

function formatDatePreview(
  iso: string,
  format: DateFormat,
  lang: Lang,
): string {
  const y = iso.slice(0, 4);
  const m = iso.slice(5, 7);
  const d = iso.slice(8, 10);
  const months = MONTH_PREVIEW[lang];
  switch (format) {
    case "YYYY-MM-DD":
      return `${y}-${m}-${d}`;
    case "DD/MM/YYYY":
      return `${d}/${m}/${y}`;
    case "MM/DD/YYYY":
      return `${m}/${d}/${y}`;
    case "DD.MM.YYYY":
      return `${d}.${m}.${y}`;
    case "D MMM YYYY":
      return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
  }
}

function formatShortDatePreview(
  iso: string,
  format: ShortDateFormat,
  lang: Lang,
): string {
  const monthNum = Number(iso.slice(5, 7));
  const dayNum = Number(iso.slice(8, 10));
  const months = MONTH_PREVIEW[lang];
  switch (format) {
    case "DD/MM":
      return `${dayNum}/${monthNum}`;
    case "MM/DD":
      return `${monthNum}/${dayNum}`;
    case "DD.MM":
      return `${dayNum}.${monthNum}`;
    case "MM-DD":
      return `${monthNum}-${dayNum}`;
    case "D MMM":
      return `${dayNum} ${months[monthNum - 1]}`;
  }
}
