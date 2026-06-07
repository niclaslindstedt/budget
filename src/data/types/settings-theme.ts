// User-facing display and entry preferences. Persisted as part of the
// budget so an export carries the user's chosen formats and a re-import
// on a different device restores them.
export type DecimalSeparator = "." | ",";
// Empty string represents "no thousands separator" — easier to serialise
// than a literal `"none"` and lets the formatter join straight.
export type ThousandsSeparator = " " | "." | "," | "";

// Tokens accepted by `formatDate` / parsed by the date-format picker.
// Limiting to a small allowlist keeps validation tight and the UI
// (a dropdown) tractable.
export type DateFormat =
  | "YYYY-MM-DD"
  | "DD/MM/YYYY"
  | "MM/DD/YYYY"
  | "DD.MM.YYYY"
  | "D MMM YYYY";

// Year-less variant used by in-cell date renderings. Decoupled from
// `DateFormat` so the user can read sheet cells as a compact "16/5"
// while keeping a long-form like "YYYY-MM-DD" elsewhere.
export type ShortDateFormat = "DD/MM" | "MM/DD" | "DD.MM" | "MM-DD" | "D MMM";

// Theme preset. The two original variants — `dark` / `light` — lock
// to the One Dark / One Light palettes; `dracula`, `githubDark`, and
// `githubLight` are the popular VS Code themes adapted for the budget
// slot vocabulary; `excel` mirrors Microsoft Excel's light-mode look
// (white grid, Excel green, Office chart accents) so spreadsheet users
// feel at home; `system` follows `prefers-color-scheme`; `custom`
// applies the colour and density overrides held under `customTheme`.
// The runtime writes the active value to `data-theme` on `<html>`.
export type ThemePreset =
  | "dark"
  | "light"
  | "dracula"
  | "monokai"
  | "githubDark"
  | "githubLight"
  | "solarizedLight"
  | "quietLight"
  | "excel"
  | "system"
  | "custom";

// Broad colour-scheme family a theme preset belongs to. The Appearance
// picker uses this to drive its two-row UI — the mode row selects the
// family (Dark / Light / System / Custom) and a variant row appears
// underneath whenever the family is `dark` or `light`, listing the
// specific theme presets within it. Derived from `theme`; not
// persisted separately.
export type ThemeFamily = "dark" | "light" | "system" | "custom";

// Bundled webfont family the body reads through `--app-font-family`.
// Four options — one mono, one sans, one serif, plus OpenDyslexic for
// readers with dyslexia — bundled via `@fontsource/*` so they ship
// with the build instead of being fetched from a CDN at runtime.
// Applies across every theme preset.
export type FontFamilyId = "mono" | "sans" | "serif" | "dyslexic";

// Corner-radius preset consumed by the Custom theme. Only a handful
// of "big-impact" surfaces (modal/picker/input chrome via
// `.field-input`, the formula pill) read through `--radius-*`; the
// rest of the UI keeps its Tailwind `rounded-*` utilities so a wider
// rollout doesn't ride on this single feature.
export type RadiusPreset = "none" | "sm" | "md" | "lg";

// UI density preset. Scales the row padding the `--density-row-*` vars
// expose to the chrome that opts in.
export type DensityPreset = "compact" | "comfortable" | "spacious";

// Border thickness preset consumed by chrome that reads
// `var(--border-width)`. `thin` is sub-pixel friendly on hi-DPI
// screens; `bold` makes the dividers more emphatic.
export type BorderWidthPreset = "thin" | "normal" | "bold";

// Per-slot custom colours. One field per CSS variable the chrome reads,
// minus the 12 month-wheel colours (those are hand-tuned for legibility
// on both One Dark and One Light and aren't user-customisable). The
// runtime maps each key to its `--<slug>` CSS var on `<html>` when the
// active theme is `custom`.
export type CustomThemeColors = {
  pageBg: string;
  surface: string;
  surface2: string;
  surface3: string;
  fg: string;
  fgBright: string;
  muted: string;
  line: string;
  accent: string;
  meta: string;
  link: string;
  path: string;
  flag: string;
  pipe: string;
  danger: string;
  success: string;
  positive: string;
  negative: string;
};

// User-authored theme applied when `Settings.theme === "custom"`. The
// picker re-seeds it from whichever theme is on screen each time the
// user switches into Custom — colours from the active preset (System
// resolves to the OS scheme) plus the baseline shape every preset
// renders at — so the editor always opens as a copy of the current
// look. Subsequent edits move on from there until the next switch
// into Custom snapshots afresh.
export type CustomTheme = {
  colors: CustomThemeColors;
  radius: RadiusPreset;
  density: DensityPreset;
  borderWidth: BorderWidthPreset;
  // Globally short-circuits `transition-duration` and
  // `animation-duration` via a high-specificity rule keyed off
  // `[data-reduce-motion="true"]` on `<html>`.
  reduceMotion: boolean;
};
