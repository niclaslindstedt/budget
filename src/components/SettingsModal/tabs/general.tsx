import type { HeaderAction, Settings, Sheet } from "../../../data/types";
import { useDevMode } from "../../../hooks";
import { type Lang, useT } from "../../../i18n";
import { IS_PREVIEW } from "../../../utils/build-env";
import { type SelectOption, SelectPicker } from "../../form";
import { CategoryIconGlyph } from "../../icons";
import { LanguagePicker } from "../../LanguagePicker";
import {
  DeviceScopeHint,
  Field,
  Section,
  ToggleRow,
  type Update,
} from "./shared";

export function GeneralTab({
  draft,
  onUpdate,
  detectedPayday,
  sheets,
}: {
  draft: Settings;
  onUpdate: Update;
  // Auto-detected payday day-of-month from the user's salary
  // series, or null if no confident pick is available. Shown as a
  // one-click "Use detected" suggestion under the picker — never
  // applied automatically so the user keeps control.
  detectedPayday: number | null;
  // The user's sheets, in order, used to populate the per-sheet
  // entries of the header-action picker. Each sheet renders with
  // its own glyph + colour so the dropdown reads like the bottom
  // tab bar.
  sheets: readonly Sheet[];
}) {
  const t = useT();
  const { devMode, setDevMode } = useDevMode();
  return (
    <>
      <Section title={t("settings.languageSection.title")}>
        <Field label={t("language.pick")}>
          <LanguagePicker
            value={draft.language}
            onChange={(v) => onUpdate("language", v as Lang)}
          />
          <p className="text-xs text-muted">
            {t("settings.languageSection.hint")}
          </p>
        </Field>
      </Section>

      <Section title={t("settings.month.title")}>
        <Field label={t("settings.month.startOfMonth")}>
          <div className="w-24">
            <SelectPicker
              value={draft.startOfMonth}
              options={Array.from({ length: 28 }, (_, i) => ({
                value: i + 1,
                label: i + 1,
              }))}
              onChange={(v) => onUpdate("startOfMonth", v)}
              ariaLabel={t("settings.month.startOfMonth")}
              triggerClassName="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
              panelClassName="font-mono tabular-nums"
            />
          </div>
          <p className="text-xs text-muted">
            {t("settings.month.startOfMonthHint")}
          </p>
          {detectedPayday !== null && detectedPayday !== draft.startOfMonth && (
            <p className="text-xs text-muted">
              {t("settings.month.detectedFromSalary")}{" "}
              <button
                type="button"
                onClick={() => onUpdate("startOfMonth", detectedPayday)}
                className="text-accent underline-offset-2 hover:underline"
              >
                {t("settings.month.useDetected", { day: detectedPayday })}
              </button>
              .
            </p>
          )}
        </Field>
      </Section>

      <Section title={t("settings.display.title")}>
        <ToggleRow
          label={t("settings.display.hideTransfers")}
          hint={t("settings.display.hideTransfersHint")}
          checked={draft.hideTransfers}
          onChange={(v) => onUpdate("hideTransfers", v)}
        />
        <Field label={t("settings.display.sortOrder")}>
          <div className="inline-flex overflow-hidden rounded border border-line">
            {(["newestFirst", "oldestFirst"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onUpdate("transactionSortOrder", p)}
                aria-pressed={draft.transactionSortOrder === p}
                className={`cursor-pointer border-0 px-3 py-1.5 font-mono text-sm ${
                  draft.transactionSortOrder === p
                    ? "bg-accent/15 text-accent"
                    : "bg-surface-2 text-fg hover:bg-surface-3"
                }`}
              >
                {p === "newestFirst"
                  ? t("settings.display.sortNewestFirst")
                  : t("settings.display.sortOldestFirst")}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            {t("settings.display.sortOrderHint")}
          </p>
        </Field>
        <ToggleRow
          label={t("settings.display.showFutureEntries")}
          hint={t("settings.display.showFutureEntriesHint")}
          checked={draft.showFutureEntries}
          onChange={(v) => onUpdate("showFutureEntries", v)}
        />
        {draft.showFutureEntries && (
          <Field label={t("settings.display.futureEntryMonths")}>
            <div className="w-24">
              <SelectPicker
                value={draft.futureEntryMonths}
                options={Array.from({ length: 12 }, (_, i) => ({
                  value: i + 1,
                  label: i + 1,
                }))}
                onChange={(v) => onUpdate("futureEntryMonths", v)}
                ariaLabel={t("settings.display.futureEntryMonths")}
                triggerClassName="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
                panelClassName="font-mono tabular-nums"
              />
            </div>
            <p className="text-xs text-muted">
              {t("settings.display.futureEntryMonthsHint")}
            </p>
          </Field>
        )}
      </Section>

      <Section title={t("settings.headerAction.title")}>
        <DeviceScopeHint />
        <Field label={t("settings.headerAction.label")}>
          <HeaderActionPicker
            value={draft.headerAction}
            sheets={sheets}
            onChange={(v) => onUpdate("headerAction", v)}
          />
          <p className="text-xs text-muted">
            {t("settings.headerAction.hint")}
          </p>
        </Field>
      </Section>

      {IS_PREVIEW && (
        <Section title={t("settings.developer.section")}>
          <ToggleRow
            label={t("settings.developer.mode")}
            hint={t("settings.developer.modeHint")}
            checked={devMode}
            onChange={setDevMode}
          />
        </Section>
      )}
    </>
  );
}

// Sheets are encoded as `sheet:<id>` in the picker's flat string
// surface so SelectPicker's generic stays `string` (it doesn't
// support arbitrary keys). The encoding is local to this component:
// on commit we decode back into the discriminated `HeaderAction`
// union before persisting.
type BuiltinHeaderActionKind = Exclude<HeaderAction, { kind: "sheet" }>["kind"];
type HeaderActionKey = BuiltinHeaderActionKind | `sheet:${string}`;

function encodeHeaderAction(action: HeaderAction): HeaderActionKey {
  return action.kind === "sheet" ? `sheet:${action.sheetId}` : action.kind;
}

function decodeHeaderAction(key: HeaderActionKey): HeaderAction {
  if (key.startsWith("sheet:")) {
    return { kind: "sheet", sheetId: key.slice("sheet:".length) };
  }
  return { kind: key as BuiltinHeaderActionKind };
}

function HeaderActionPicker({
  value,
  sheets,
  onChange,
}: {
  value: HeaderAction;
  sheets: readonly Sheet[];
  onChange: (next: HeaderAction) => void;
}) {
  const t = useT();
  // Stable order: built-ins first, then one entry per sheet.
  // Sheet-target whose sheet no longer exists falls back to the
  // "Scroll to top" entry in the picker so the dropdown never shows
  // a blank selection — the AppShell click handler applies the
  // same fallback at runtime.
  const sheetExists = sheets.some(
    (s) => value.kind === "sheet" && s.id === value.sheetId,
  );
  const selectedKey: HeaderActionKey =
    value.kind === "sheet" && !sheetExists ? "top" : encodeHeaderAction(value);
  const options: SelectOption<HeaderActionKey>[] = [
    { value: "top", label: t("settings.headerAction.top") },
    { value: "currentMonth", label: t("settings.headerAction.currentMonth") },
    { value: "refresh", label: t("settings.headerAction.refresh") },
    ...sheets.map((s) => ({
      value: `sheet:${s.id}` as const,
      label: (
        <span className="inline-flex items-center gap-1.5">
          <CategoryIconGlyph
            name={s.glyph}
            size={14}
            style={{ color: s.color }}
          />
          <span>{t("settings.headerAction.sheet", { name: s.name })}</span>
        </span>
      ),
    })),
  ];
  return (
    <SelectPicker<HeaderActionKey>
      value={selectedKey}
      options={options}
      onChange={(v) => onChange(decodeHeaderAction(v))}
      ariaLabel={t("settings.headerAction.label")}
      triggerClassName="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
      panelClassName="max-h-64 overflow-y-auto"
    />
  );
}
