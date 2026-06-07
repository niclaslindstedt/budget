// Theme presets, palettes, and Custom-theme defaults. Leaf module —
// imports only from `./types` so callers can pull theme data without
// dragging in the rest of `constants/`. The Appearance settings tab,
// `useTheme`, and the validator all read from here directly.
//
// The nine non-Custom presets (`dark`, `light`, `dracula`, `monokai`,
// `githubDark`, `githubLight`, `solarizedLight`, `quietLight`, `excel`)
// double as seed palettes for the Custom theme: switching from a preset
// into Custom pre-fills the editor from the preset that was active.

import type {
  BorderWidthPreset,
  CustomTheme,
  CustomThemeColors,
  DensityPreset,
  FontFamilyId,
  RadiusPreset,
  ThemeFamily,
  ThemePreset,
} from "./types";

// Allowed theme presets, in the order the Appearance picker shows
// them. Source of truth for the validator, the public JSON Schema,
// and the picker UI so all three agree on which values are valid.
// Dark variants are grouped together, then light variants, then the
// two non-coloured presets (`system` follows the OS, `custom` reads
// the user's overrides).
export const THEMES = [
  "dark",
  "light",
  "dracula",
  "monokai",
  "githubDark",
  "githubLight",
  "solarizedLight",
  "quietLight",
  "excel",
  "system",
  "custom",
] as const;

// Theme presets that belong to the Dark family — listed in the order
// the variant row renders them, with the One Dark original first. The
// Appearance picker's mode row uses these arrays to derive its
// selected family from the active preset, and the variant row reads
// the matching array to render its buttons.
export const DARK_THEMES = [
  "dark",
  "dracula",
  "monokai",
  "githubDark",
] as const;

// Theme presets in the Light family — One Light first, then the
// light VS Code variants, then the Excel-flavoured light theme.
export const LIGHT_THEMES = [
  "light",
  "githubLight",
  "solarizedLight",
  "quietLight",
  "excel",
] as const;

// Resolve a preset to its broad family. Dark / Light variants fold
// into their family bucket; `system` and `custom` are their own
// families (no variants underneath).
export function themeFamily(preset: ThemePreset): ThemeFamily {
  if ((DARK_THEMES as readonly string[]).includes(preset)) return "dark";
  if ((LIGHT_THEMES as readonly string[]).includes(preset)) return "light";
  return preset as "system" | "custom";
}

// Default preset for each family — what the mode row jumps to when
// the user picks a family they weren't already in (e.g. on Dracula,
// clicks Light → jumps to One Light, which the variant row then
// lets them swap to GitHub Light if desired).
export const FAMILY_DEFAULT_THEME: Record<ThemeFamily, ThemePreset> = {
  dark: "dark",
  light: "light",
  system: "system",
  custom: "custom",
};

// Bundled webfont families. `stack` is the full CSS `font-family`
// value written to `--app-font-family`; `label` is an i18n key path
// resolved at render time so the picker shows translated names.
// Loaded as side-effect `@fontsource/*` imports in `src/main.tsx` —
// the project bundles them rather than fetching from a CDN at
// runtime (local-first invariant).
export const FONT_FAMILIES: readonly {
  id: FontFamilyId;
  label: string;
  stack: string;
}[] = [
  {
    id: "mono",
    label: "settings.appearance.font.mono",
    stack:
      '"JetBrains Mono", "Fira Code", ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  },
  {
    id: "sans",
    label: "settings.appearance.font.sans",
    stack:
      '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  {
    id: "serif",
    label: "settings.appearance.font.serif",
    stack: '"Source Serif 4", ui-serif, Georgia, "Times New Roman", serif',
  },
  {
    id: "dyslexic",
    label: "settings.appearance.font.dyslexic",
    stack:
      '"OpenDyslexic", "Comic Sans MS", ui-sans-serif, system-ui, sans-serif',
  },
];

export const RADIUS_PRESETS: readonly RadiusPreset[] = [
  "none",
  "sm",
  "md",
  "lg",
];

export const DENSITY_PRESETS: readonly DensityPreset[] = [
  "compact",
  "comfortable",
  "spacious",
];

export const BORDER_WIDTH_PRESETS: readonly BorderWidthPreset[] = [
  "thin",
  "normal",
  "bold",
];

// One Dark palette mirrored from `src/styles.css`. Used as the Custom
// theme's pristine default and as the fallback the validator snaps
// back to when a hex value is missing or malformed.
export const DEFAULT_CUSTOM_THEME_COLORS_DARK: CustomThemeColors = {
  pageBg: "#1d2027",
  surface: "#282c34",
  surface2: "#2c313a",
  surface3: "#21252b",
  fg: "#abb2bf",
  fgBright: "#e6e6e6",
  muted: "#9097a8",
  line: "#3e4451",
  accent: "#98c379",
  meta: "#e5c07b",
  link: "#61afef",
  path: "#56b6c2",
  flag: "#d19a66",
  pipe: "#c678dd",
  danger: "#e06c75",
  success: "#98c379",
  positive: "#b5e3a0",
  negative: "#f0b4ba",
};

// One Light palette mirrored from `src/styles.css`. Source for the
// "pre-fill custom from active preset" flow when the user is on Light
// and switches to Custom for the first time.
export const DEFAULT_CUSTOM_THEME_COLORS_LIGHT: CustomThemeColors = {
  pageBg: "#eef0f2",
  surface: "#f8f9fa",
  surface2: "#f1f3f5",
  surface3: "#e4e7eb",
  fg: "#2f323a",
  fgBright: "#15171c",
  muted: "#6a6f7c",
  line: "#ccd0d6",
  accent: "#3f8c3e",
  meta: "#9c6a00",
  link: "#2960c2",
  path: "#0a6e92",
  flag: "#ad4c00",
  pipe: "#872187",
  danger: "#c9434c",
  success: "#3f8c3e",
  positive: "#5fa057",
  negative: "#d77a82",
};

// Dracula Official palette, remapped from the upstream theme JSON to
// the budget's slot vocabulary (accent=green, meta=yellow/numbers,
// link=blue, path=cyan/dates, flag=orange/amounts, pipe=purple/
// functions). Mirrored into `src/styles.css` under
// `:root[data-theme="dracula"]`.
export const DEFAULT_CUSTOM_THEME_COLORS_DRACULA: CustomThemeColors = {
  pageBg: "#21222c",
  surface: "#282a36",
  surface2: "#343746",
  surface3: "#191a21",
  fg: "#f8f8f2",
  fgBright: "#ffffff",
  muted: "#8b93c2",
  line: "#44475a",
  accent: "#50fa7b",
  meta: "#f1fa8c",
  link: "#8be9fd",
  path: "#bd93f9",
  flag: "#ffb86c",
  pipe: "#ff79c6",
  danger: "#ff5555",
  success: "#50fa7b",
  positive: "#a8ffb8",
  negative: "#ffb3c5",
};

// GitHub Dark Default palette. Mirrored into `src/styles.css` under
// `:root[data-theme="githubDark"]`.
export const DEFAULT_CUSTOM_THEME_COLORS_GITHUB_DARK: CustomThemeColors = {
  pageBg: "#010409",
  surface: "#0d1117",
  surface2: "#161b22",
  surface3: "#010409",
  fg: "#c9d1d9",
  fgBright: "#f0f6fc",
  muted: "#8b949e",
  line: "#30363d",
  accent: "#7ee787",
  meta: "#d29922",
  link: "#79c0ff",
  path: "#56d4dd",
  flag: "#ffa657",
  pipe: "#d2a8ff",
  danger: "#ff7b72",
  success: "#7ee787",
  positive: "#aff5b4",
  negative: "#ffb8b3",
};

// GitHub Light Default palette. Mirrored into `src/styles.css` under
// `:root[data-theme="githubLight"]`.
export const DEFAULT_CUSTOM_THEME_COLORS_GITHUB_LIGHT: CustomThemeColors = {
  pageBg: "#f6f8fa",
  surface: "#ffffff",
  surface2: "#eaeef2",
  surface3: "#d0d7de",
  fg: "#1f2328",
  fgBright: "#0d1117",
  muted: "#6e7781",
  line: "#d0d7de",
  accent: "#1a7f37",
  meta: "#9a6700",
  link: "#0969da",
  path: "#0550ae",
  flag: "#bc4c00",
  pipe: "#8250df",
  danger: "#cf222e",
  success: "#1a7f37",
  positive: "#4ac26b",
  negative: "#e5717f",
};

// Monokai palette — the classic TextMate / Sublime / VS Code dark
// theme. Strong yellow-green / pink / orange / purple syntax against
// the warm brown-black background. Mirrored into `src/styles.css`
// under `:root[data-theme="monokai"]`.
export const DEFAULT_CUSTOM_THEME_COLORS_MONOKAI: CustomThemeColors = {
  pageBg: "#1e1f1c",
  surface: "#272822",
  surface2: "#3e3d32",
  surface3: "#1b1c18",
  fg: "#f8f8f2",
  fgBright: "#ffffff",
  muted: "#9c9882",
  line: "#49483e",
  accent: "#a6e22e",
  meta: "#e6db74",
  link: "#66d9ef",
  path: "#66d9ef",
  flag: "#fd971f",
  pipe: "#ae81ff",
  danger: "#f92672",
  success: "#a6e22e",
  positive: "#b6e354",
  negative: "#f49ab1",
};

// Solarized Light palette — Ethan Schoonover's iconic warm light
// theme. Cream paper background with carefully balanced syntax hues
// designed for low-contrast readability. Mirrored into
// `src/styles.css` under `:root[data-theme="solarizedLight"]`.
export const DEFAULT_CUSTOM_THEME_COLORS_SOLARIZED_LIGHT: CustomThemeColors = {
  pageBg: "#eee8d5",
  surface: "#fdf6e3",
  surface2: "#f5efdc",
  surface3: "#e3ddc9",
  fg: "#586e75",
  fgBright: "#073642",
  muted: "#657b83",
  line: "#d6cfb8",
  accent: "#859900",
  meta: "#b58900",
  link: "#268bd2",
  path: "#2aa198",
  flag: "#cb4b16",
  pipe: "#6c71c4",
  danger: "#dc322f",
  success: "#859900",
  positive: "#719e00",
  negative: "#d33682",
};

// Quiet Light palette — a calm, low-contrast VS Code light theme
// with muted blue keywords, sage-green strings, and gentle plum
// functions. Mirrored into `src/styles.css` under
// `:root[data-theme="quietLight"]`.
export const DEFAULT_CUSTOM_THEME_COLORS_QUIET_LIGHT: CustomThemeColors = {
  pageBg: "#f5f5f5",
  surface: "#ffffff",
  surface2: "#ebebeb",
  surface3: "#e0e0e0",
  fg: "#333333",
  fgBright: "#1a1a1a",
  muted: "#767676",
  line: "#d4d4d4",
  accent: "#4f894c",
  meta: "#ae6e29",
  link: "#4b83cd",
  path: "#1d8696",
  flag: "#aa6624",
  pipe: "#7e54a5",
  danger: "#b73525",
  success: "#4f894c",
  positive: "#6c9d56",
  negative: "#cf6e6a",
};

// Excel Light palette — Microsoft Excel's light-mode look. Pure-white
// cell grid on a soft Office-neutral workspace, near-black text, the
// classic Excel gridline grey, and the Office accent set mapped onto
// the budget slots: accent/success = Excel green (#217346), link =
// Excel's hyperlink blue, flag = Office chart orange, meta = Office
// gold, path = Office teal, pipe = Office purple, danger = Excel's
// negative-number red. Mirrored into `src/styles.css` under
// `:root[data-theme="excel"]`.
export const DEFAULT_CUSTOM_THEME_COLORS_EXCEL: CustomThemeColors = {
  pageBg: "#e6e6e6",
  surface: "#ffffff",
  surface2: "#f3f2f1",
  surface3: "#e1dfdd",
  fg: "#252423",
  fgBright: "#171717",
  muted: "#605e5c",
  line: "#d4d4d4",
  accent: "#217346",
  meta: "#a6730a",
  link: "#0563c1",
  path: "#0e7490",
  flag: "#c55a11",
  pipe: "#7030a0",
  danger: "#c00000",
  success: "#217346",
  positive: "#3f7d3a",
  negative: "#c84031",
};

// Per-preset palette lookup. The Appearance picker reads this both to
// draw the variant-row swatches and to pre-fill the Custom-theme
// editor when the user switches into Custom — the seed comes from
// whichever preset was effective just before the switch.
export const PRESET_PALETTES: Record<
  Exclude<ThemePreset, "system" | "custom">,
  CustomThemeColors
> = {
  dark: DEFAULT_CUSTOM_THEME_COLORS_DARK,
  light: DEFAULT_CUSTOM_THEME_COLORS_LIGHT,
  dracula: DEFAULT_CUSTOM_THEME_COLORS_DRACULA,
  monokai: DEFAULT_CUSTOM_THEME_COLORS_MONOKAI,
  githubDark: DEFAULT_CUSTOM_THEME_COLORS_GITHUB_DARK,
  githubLight: DEFAULT_CUSTOM_THEME_COLORS_GITHUB_LIGHT,
  solarizedLight: DEFAULT_CUSTOM_THEME_COLORS_SOLARIZED_LIGHT,
  quietLight: DEFAULT_CUSTOM_THEME_COLORS_QUIET_LIGHT,
  excel: DEFAULT_CUSTOM_THEME_COLORS_EXCEL,
};

export const DEFAULT_CUSTOM_THEME: CustomTheme = {
  colors: DEFAULT_CUSTOM_THEME_COLORS_DARK,
  radius: "md",
  density: "comfortable",
  borderWidth: "normal",
  reduceMotion: false,
};

// Snapshot of the theme currently on screen, used to seed the Custom
// theme controls when the user switches into Custom so the editor opens
// as a copy of the current look and the first edit is a tweak. Colours
// come from the active preset; `system` resolves via the caller-supplied
// `prefersLight` (read from `prefers-color-scheme`) so the snapshot
// matches what the OS is actually rendering. Every non-custom preset
// paints at the baseline shape, so radius / density / border-width /
// reduce-motion seed from the canonical defaults to match. `custom` is
// not a meaningful input — you never switch into Custom from Custom — so
// it falls back to the Dark palette.
export function customThemeSeed(
  theme: ThemePreset,
  prefersLight: boolean,
): CustomTheme {
  const colors =
    theme === "system"
      ? prefersLight
        ? DEFAULT_CUSTOM_THEME_COLORS_LIGHT
        : DEFAULT_CUSTOM_THEME_COLORS_DARK
      : theme === "custom"
        ? DEFAULT_CUSTOM_THEME_COLORS_DARK
        : PRESET_PALETTES[theme];
  return {
    colors,
    radius: DEFAULT_CUSTOM_THEME.radius,
    density: DEFAULT_CUSTOM_THEME.density,
    borderWidth: DEFAULT_CUSTOM_THEME.borderWidth,
    reduceMotion: DEFAULT_CUSTOM_THEME.reduceMotion,
  };
}

// Ordered list of colour keys. The validator iterates this to walk
// every slot; the picker UI uses it via `COLOR_GROUPS` below for
// display order inside each group.
export const COLOR_KEYS: readonly (keyof CustomThemeColors)[] = [
  "pageBg",
  "surface",
  "surface2",
  "surface3",
  "fg",
  "fgBright",
  "muted",
  "line",
  "accent",
  "meta",
  "link",
  "path",
  "flag",
  "pipe",
  "danger",
  "success",
  "positive",
  "negative",
];

// Maps each `CustomThemeColors` key to the CSS-variable slug (the part
// after `--`) the runtime writes when Custom is active. Keeping the
// mapping explicit (rather than camelCase-to-kebab-case at runtime)
// makes the contract obvious to a reader and avoids surprises if a
// key gains an unusual capitalisation later.
export const COLOR_KEY_TO_CSS_VAR: Record<keyof CustomThemeColors, string> = {
  pageBg: "page-bg",
  surface: "surface",
  surface2: "surface-2",
  surface3: "surface-3",
  fg: "fg",
  fgBright: "fg-bright",
  muted: "muted",
  line: "line",
  accent: "accent",
  meta: "meta",
  link: "link",
  path: "path",
  flag: "flag",
  pipe: "pipe",
  danger: "danger",
  success: "success",
  positive: "positive",
  negative: "negative",
};

// How the Custom theme panel groups the 18 colour controls so the
// section stays scannable. Group ids are i18n keys
// (`settings.appearance.colorGroup.<id>`); the per-colour labels
// resolve through `settings.appearance.color.<key>`.
export const COLOR_GROUPS: readonly {
  id: "backgrounds" | "text" | "lines" | "accents" | "status";
  keys: readonly (keyof CustomThemeColors)[];
}[] = [
  { id: "backgrounds", keys: ["pageBg", "surface", "surface2", "surface3"] },
  { id: "text", keys: ["fg", "fgBright", "muted"] },
  { id: "lines", keys: ["line"] },
  { id: "accents", keys: ["accent", "meta", "link", "path", "flag", "pipe"] },
  { id: "status", keys: ["danger", "success", "positive", "negative"] },
];
