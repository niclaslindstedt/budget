import { useEffect } from "react";

import { FONT_SCALE_PRESETS } from "../../../data/constants/format";
import {
  BORDER_WIDTH_PRESETS,
  COLOR_GROUPS,
  customThemeSeed,
  DARK_THEMES,
  DEFAULT_CUSTOM_THEME_COLORS_DARK,
  DENSITY_PRESETS,
  FAMILY_DEFAULT_THEME,
  FONT_FAMILIES,
  LIGHT_THEMES,
  PRESET_PALETTES,
  RADIUS_PRESETS,
  TABLE_SPACING_PRESETS,
  themeFamily,
} from "../../../data/themes";
import type {
  CustomTheme,
  CustomThemeColors,
  FontFamilyId,
  Settings,
  ThemeFamily,
  ThemePreset,
} from "../../../data/types";
import { useT } from "../../../i18n";
import { loadAllFontFamilies } from "../../../utils/fonts";
import { SelectPicker } from "../../form";
import {
  DeviceScopeHint,
  Field,
  Section,
  ToggleRow,
  type Update,
} from "./shared";

function capitalise<S extends string>(s: S): Capitalize<S> {
  return (s.charAt(0).toUpperCase() + s.slice(1)) as Capitalize<S>;
}

export function AppearanceTab({
  draft,
  onUpdate,
}: {
  draft: Settings;
  onUpdate: Update;
}) {
  const t = useT();
  const isCustom = draft.theme === "custom";

  // The non-default font families load on demand (see
  // `src/utils/fonts.ts`); pull them all in when this tab opens so the
  // font picker's per-option previews render in their real face rather
  // than the fallback stack.
  useEffect(() => {
    loadAllFontFamilies();
  }, []);

  function handleThemeChange(next: ThemePreset) {
    if (next === "custom" && draft.theme !== "custom") {
      // Snapshot the theme that's currently on screen into the Custom
      // controls so the editor opens as a copy of what the user is
      // looking at and the first edit is a tweak, not a reset. Colours
      // come from the active preset (System resolves to the OS scheme);
      // every non-custom preset renders at the baseline shape, so radius
      // / density / border-width / reduce-motion seed from the canonical
      // defaults to match. This overwrites any earlier Custom tweaks —
      // entering Custom always tracks the current look rather than
      // resurrecting a stale palette.
      const prefersLight =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: light)").matches;
      onUpdate("customTheme", customThemeSeed(draft.theme, prefersLight));
    }
    onUpdate("theme", next);
  }

  function updateCustom<K extends keyof CustomTheme>(
    key: K,
    value: CustomTheme[K],
  ): void {
    onUpdate("customTheme", { ...draft.customTheme, [key]: value });
  }

  function updateColor(key: keyof CustomThemeColors, value: string): void {
    onUpdate("customTheme", {
      ...draft.customTheme,
      colors: { ...draft.customTheme.colors, [key]: value },
    });
  }

  return (
    <>
      <Section title={t("settings.appearance.themeSection")}>
        <Field label={t("settings.appearance.modeLabel")}>
          <ThemeModeRow
            value={draft.theme}
            onChange={handleThemeChange}
            customColors={draft.customTheme.colors}
          />
          {draft.theme === "system" && (
            <p className="text-xs text-muted">
              {t("settings.appearance.themeSystemHint")}
            </p>
          )}
        </Field>
        {(themeFamily(draft.theme) === "dark" ||
          themeFamily(draft.theme) === "light") && (
          <Field label={t("settings.appearance.variantLabel")}>
            <ThemeVariantRow value={draft.theme} onChange={handleThemeChange} />
          </Field>
        )}
      </Section>

      <Section title={t("settings.appearance.fontSection")}>
        <Field label={t("settings.appearance.fontFamily")}>
          <SelectPicker
            value={draft.fontFamily}
            options={FONT_FAMILIES.map((f) => ({
              value: f.id,
              label: (
                <span style={{ fontFamily: f.stack }}>
                  {t(f.label as Parameters<typeof t>[0])}
                </span>
              ),
            }))}
            onChange={(v) => onUpdate("fontFamily", v as FontFamilyId)}
            ariaLabel={t("settings.appearance.fontFamily")}
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
          />
          <p className="text-xs text-muted">
            {t("settings.appearance.fontHint")}
          </p>
        </Field>
        <Field label={t("settings.appearance.textSize")}>
          <SelectPicker
            value={draft.fontScale}
            options={FONT_SCALE_PRESETS.map((p) => ({
              value: p.scale,
              label: p.label,
            }))}
            onChange={(v) => onUpdate("fontScale", v)}
            ariaLabel={t("settings.appearance.textSize")}
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
            panelClassName="font-mono tabular-nums"
          />
          <p className="text-xs text-muted">
            {t("settings.appearance.textSizeHint")}
          </p>
          <DeviceScopeHint />
        </Field>
      </Section>

      {isCustom && (
        <>
          <Section title={t("settings.appearance.colorsSection")}>
            {COLOR_GROUPS.map((group) => (
              <Field
                key={group.id}
                label={t(
                  `settings.appearance.colorGroup.${group.id}` as Parameters<
                    typeof t
                  >[0],
                )}
              >
                <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-x-2 gap-y-2.5">
                  {group.keys.map((k) => (
                    <ColorSwatchInput
                      key={k}
                      label={t(
                        `settings.appearance.color.${k}` as Parameters<
                          typeof t
                        >[0],
                      )}
                      value={draft.customTheme.colors[k]}
                      onChange={(c) => updateColor(k, c)}
                    />
                  ))}
                </div>
              </Field>
            ))}
          </Section>

          <Section title={t("settings.appearance.shapeSection")}>
            <Field label={t("settings.appearance.radius")}>
              <SegmentedRow
                value={draft.customTheme.radius}
                options={RADIUS_PRESETS.map((p) => ({
                  value: p,
                  label: t(
                    `settings.appearance.radius${capitalise(p)}` as Parameters<
                      typeof t
                    >[0],
                  ),
                }))}
                onChange={(v) => updateCustom("radius", v)}
              />
            </Field>
            <Field label={t("settings.appearance.density")}>
              <SegmentedRow
                value={draft.customTheme.density}
                options={DENSITY_PRESETS.map((p) => ({
                  value: p,
                  label: t(
                    `settings.appearance.density${capitalise(p)}` as Parameters<
                      typeof t
                    >[0],
                  ),
                }))}
                onChange={(v) => updateCustom("density", v)}
              />
            </Field>
            <Field label={t("settings.appearance.tableSpacing")}>
              <SegmentedRow
                value={draft.customTheme.tableSpacing}
                options={TABLE_SPACING_PRESETS.map((p) => ({
                  value: p,
                  label: t(
                    `settings.appearance.tableSpacing${capitalise(p)}` as Parameters<
                      typeof t
                    >[0],
                  ),
                }))}
                onChange={(v) => updateCustom("tableSpacing", v)}
              />
            </Field>
            <Field label={t("settings.appearance.borderWidth")}>
              <SegmentedRow
                value={draft.customTheme.borderWidth}
                options={BORDER_WIDTH_PRESETS.map((p) => ({
                  value: p,
                  label: t(
                    `settings.appearance.borderWidth${capitalise(p)}` as Parameters<
                      typeof t
                    >[0],
                  ),
                }))}
                onChange={(v) => updateCustom("borderWidth", v)}
              />
            </Field>
            <ToggleRow
              label={t("settings.appearance.reduceMotion")}
              hint={t("settings.appearance.reduceMotionHint")}
              checked={draft.customTheme.reduceMotion}
              onChange={(v) => updateCustom("reduceMotion", v)}
            />
          </Section>
        </>
      )}
    </>
  );
}

// Per-preset display swatches for the theme picker buttons. Drawn
// from the same hex values the styles.css palette uses so a glance
// at the swatch row tells the user what they're picking. `system`
// renders the dark+light combo as a diagonal split so it reads as
// "either" without copying one of the preset's swatches verbatim;
// `custom` reads the user's palette so the swatch tracks edits live.
function ThemeSwatches({
  theme,
  customColors,
}: {
  theme: ThemePreset;
  customColors?: CustomThemeColors;
}) {
  if (theme === "system") {
    return (
      <span
        aria-hidden
        className="inline-block h-4 w-4 shrink-0 rounded-sm border border-line"
        style={{
          background:
            "linear-gradient(135deg, #1d2027 0 50%, #eef0f2 50% 100%)",
        }}
      />
    );
  }
  const palette =
    theme === "custom"
      ? (customColors ?? DEFAULT_CUSTOM_THEME_COLORS_DARK)
      : PRESET_PALETTES[theme];
  const tones =
    theme === "custom"
      ? [palette.pageBg, palette.surface, palette.accent, palette.flag]
      : [palette.pageBg, palette.surface, palette.fg, palette.accent];
  return (
    <span
      aria-hidden
      className="inline-flex h-4 gap-px overflow-hidden rounded-sm border border-line"
    >
      {tones.map((c, i) => (
        <span
          key={i}
          className="block h-full w-1.5"
          style={{ background: c }}
        />
      ))}
    </span>
  );
}

// Family-level swatch used by the mode row. Dark / Light show the
// family's default palette (One Dark / One Light); System keeps its
// diagonal split; Custom samples the user's current palette.
function ModeSwatches({
  family,
  customColors,
}: {
  family: ThemeFamily;
  customColors?: CustomThemeColors;
}) {
  return (
    <ThemeSwatches
      theme={FAMILY_DEFAULT_THEME[family]}
      customColors={customColors}
    />
  );
}

// Mode row — the broad family pick. Selecting a family the user is
// already in is a no-op (keeps the active variant); selecting a new
// family jumps to that family's default preset, which the variant
// row then lets the user fine-tune.
const MODE_ORDER: readonly ThemeFamily[] = [
  "dark",
  "light",
  "system",
  "custom",
];

function ThemeModeRow({
  value,
  onChange,
  customColors,
}: {
  value: ThemePreset;
  onChange: (next: ThemePreset) => void;
  customColors: CustomThemeColors;
}) {
  const t = useT();
  const activeFamily = themeFamily(value);
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {MODE_ORDER.map((family) => {
        const active = activeFamily === family;
        const base =
          "flex items-center gap-2 rounded border px-2 py-1.5 text-sm transition-opacity focus-visible:outline-none";
        const activeCls = "border-accent bg-surface-2 text-fg-bright";
        const inactiveCls =
          "border-line bg-transparent text-muted opacity-60 hover:opacity-100 hover:border-accent";
        const label = t(
          `settings.appearance.mode${capitalise(family)}` as Parameters<
            typeof t
          >[0],
        );
        return (
          <button
            key={family}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => {
              if (active) return;
              onChange(FAMILY_DEFAULT_THEME[family]);
            }}
            className={`${base} ${active ? activeCls : inactiveCls}`}
          >
            <ModeSwatches family={family} customColors={customColors} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Variant row — appears only when the active family has more than one
// theme to choose from (Dark or Light). Lists every preset in that
// family using the same swatch + label pattern as the mode row.
function ThemeVariantRow({
  value,
  onChange,
}: {
  value: ThemePreset;
  onChange: (next: ThemePreset) => void;
}) {
  const t = useT();
  const family = themeFamily(value);
  const variants =
    family === "dark" ? DARK_THEMES : family === "light" ? LIGHT_THEMES : null;
  if (!variants) return null;
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {variants.map((theme) => {
        const active = value === theme;
        const base =
          "flex items-center gap-2 rounded border px-2 py-1.5 text-sm transition-opacity focus-visible:outline-none";
        const activeCls = "border-accent bg-surface-2 text-fg-bright";
        const inactiveCls =
          "border-line bg-transparent text-muted opacity-60 hover:opacity-100 hover:border-accent";
        const label = t(
          `settings.appearance.theme${capitalise(theme)}` as Parameters<
            typeof t
          >[0],
        );
        return (
          <button
            key={theme}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => onChange(theme)}
            className={`${base} ${active ? activeCls : inactiveCls}`}
          >
            <ThemeSwatches theme={theme} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Generic three / four-button segmented control used by radius,
// density, and border-width pickers. Pattern mirrors the
// currency-position / decimal-separator rows in `FormatTab`.
function SegmentedRow<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      className="inline-flex overflow-hidden rounded border border-line"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`cursor-pointer border-0 px-3 py-1.5 text-sm ${
              active
                ? "bg-accent/15 text-accent"
                : "bg-surface-2 text-fg hover:bg-surface-3"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Native `<input type="color">` captioned beneath the swatch. Native
// is the right call here: 18 colour controls × an 8-swatch palette
// grid would be overwhelming, and a user customising "exactly my shade
// of green" wants hex entry the OS already provides. The swatch itself
// doubles as the trigger — clicking opens the system colour picker.
//
// The swatch sits *above* the caption (not below) so it pins to the
// top of its grid cell: every swatch in a row then aligns regardless
// of whether its label wraps to one line or two. The swatch fills the
// column so the groups read as one tidy tiled grid.
function ColorSwatchInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <label className="flex cursor-pointer flex-col gap-1 text-xs text-muted">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-7 w-full cursor-pointer rounded border border-line bg-transparent p-0"
      />
      <span className="leading-tight">{label}</span>
    </label>
  );
}
