import { GripVertical } from "lucide-react";

import { unlock } from "../../../data/achievements";
import { SUPPORTED_LOCATIONS } from "../../../data/tax/engine";
import type {
  HeaderAction,
  Settings,
  Sheet,
  TaxLocation,
} from "../../../data/types";
import { useDevMode, useDragReorder } from "../../../hooks";
import { type Lang, useT } from "../../../i18n";
import { REPO_URL } from "../../../seo/siteConfig";
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
  onReorderSheets,
}: {
  draft: Settings;
  onUpdate: Update;
  // Auto-detected payday day-of-month from the user's salary
  // series, or null if no confident pick is available. Shown as a
  // one-click "Use detected" suggestion under the picker — never
  // applied automatically so the user keeps control.
  detectedPayday: number | null;
  // The user's sheets, in order, used both to populate the per-sheet
  // entries of the header-action picker and the drag-to-reorder list.
  // Each sheet renders with its own glyph + colour so the rows read
  // like the bottom tab bar.
  sheets: readonly Sheet[];
  // Drop the `fromId` sheet in front of the `toId` sheet — wired to a
  // `reorderSheets` dispatch by the host. The new order drives the
  // bottom-bar tab strip.
  onReorderSheets: (fromId: string, toId: string) => void;
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

      <Section title={t("settings.location.title")}>
        <Field label={t("settings.location.label")}>
          <LocationPicker
            value={draft.location}
            onChange={(v) => onUpdate("location", v)}
          />
          <p className="text-xs text-muted">{t("settings.location.hint")}</p>
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

      <Section title={t("settings.sheets.title")}>
        <SheetReorderList sheets={sheets} onReorder={onReorderSheets} />
        <p className="text-xs text-muted">{t("settings.sheets.hint")}</p>
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
            onChange={(v) => {
              setDevMode(v);
              if (v) unlock("underTheHood");
            }}
          />
        </Section>
      )}
    </>
  );
}

// Drag-to-reorder list of every sheet, mirroring the bottom-bar tab
// order. Built on the shared `useDragReorder` HTML5 primitive — drop
// the dragged sheet in front of the hovered one — same pattern as the
// company-type priority list under the Companies tab.
function SheetReorderList({
  sheets,
  onReorder,
}: {
  sheets: readonly Sheet[];
  onReorder: (fromId: string, toId: string) => void;
}) {
  const t = useT();
  const reorder = useDragReorder({
    onReorder: (fromId, toId) => {
      onReorder(fromId, toId);
      unlock("tabShuffler");
    },
  });
  if (sheets.length === 0) {
    return <p className="text-xs text-muted">{t("settings.sheets.empty")}</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {sheets.map((sheet) => (
        <li
          key={sheet.id}
          {...reorder.getItemProps(sheet.id)}
          aria-label={t("settings.sheets.reorderAria", { name: sheet.name })}
          className={`flex cursor-grab items-center gap-2 rounded border bg-surface-2 px-2 py-1.5 text-sm select-none active:cursor-grabbing ${
            reorder.overId === sheet.id ? "border-accent" : "border-line"
          } ${reorder.draggingId === sheet.id ? "opacity-50" : ""}`}
        >
          <GripVertical
            size={14}
            className="shrink-0 text-muted"
            aria-hidden
            focusable={false}
          />
          <CategoryIconGlyph
            name={sheet.glyph}
            size={16}
            style={{ color: sheet.color }}
          />
          <span
            className="truncate text-fg-bright"
            style={{ color: sheet.color }}
          >
            {sheet.name}
          </span>
        </li>
      ))}
    </ul>
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

// Sentinel for the "Request a new location…" entry — it's a link to the
// repo's new-issue page, not a selectable value, so the change handler
// intercepts it instead of writing settings.
const REQUEST_LOCATION = "__request__";

function LocationPicker({
  value,
  onChange,
}: {
  value: TaxLocation;
  onChange: (next: TaxLocation) => void;
}) {
  const t = useT();
  const options: SelectOption<string>[] = [
    ...SUPPORTED_LOCATIONS.map((loc) => ({
      value: loc as string,
      label: t(`settings.location.name.${loc}`),
    })),
    {
      value: REQUEST_LOCATION,
      label: t("settings.location.request"),
      hint: t("settings.location.requestHint"),
    },
  ];
  return (
    <SelectPicker<string>
      value={value}
      options={options}
      onChange={(v) => {
        if (v === REQUEST_LOCATION) {
          window.open(`${REPO_URL}/issues/new`, "_blank", "noopener");
          return;
        }
        onChange(v as TaxLocation);
      }}
      ariaLabel={t("settings.location.label")}
      triggerClassName="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
    />
  );
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
