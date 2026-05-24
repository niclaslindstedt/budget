import { IS_PREVIEW } from "../utils/build-env";
import type {
  BorderWidthPreset,
  Category,
  CategoryIcon,
  CustomTheme,
  CustomThemeColors,
  DateFormat,
  DensityPreset,
  EntryType,
  FontFamilyId,
  RadiusPreset,
  Settings,
  SheetGlyph,
  SheetType,
  ShortDateFormat,
  ThemeFamily,
  ThemePreset,
} from "./types";

// Maximum visual width of a column before its content wraps. Used to cap
// auto-sizing in the CSS via a custom property. Will become a per-sheet
// setting once the UI exists for it.
export const MAX_COLUMN_CHARS = 60;

// Build-time namespace segment inserted into every persistence key,
// cloud path, and IndexedDB DB name when the bundle is the `/preview/`
// build. Production = "" (untouched legacy keys); preview = "preview".
// The single flag drives `nsKey` / `nsCloudPath` / `nsIdbName` so
// adding a new persisted surface only requires routing it through
// these helpers — no further wiring.
//
// Why this matters: the `/` slot serves the latest released tag and
// the `/preview/` slot serves current `main`. Without isolation, a
// visit to `/preview/` would migrate the shared localStorage / cloud
// file to the (possibly newer) preview schema; reloading `/` would
// then fail to read its own data. Namespacing every key keeps the
// two builds in completely separate worlds on the same machine and
// the same cloud account.
const STORAGE_NS = IS_PREVIEW ? "preview" : "";

// Insert the namespace segment after the leading "budget." in any
// storage key, e.g. "budget.users.v1" → "budget.preview.users.v1".
// Keys without that prefix pass through unchanged.
export function nsKey(key: string): string {
  if (!STORAGE_NS) return key;
  return key.replace(/^budget\./, `budget.${STORAGE_NS}.`);
}

// Prepend the namespace segment to a cloud-storage path so the
// preview build writes to a sibling location inside the same Dropbox
// app folder or GDrive root. e.g. "/budget.json" →
// "/preview/budget.json"; "/backups" → "/preview/backups". Paths that
// don't start with "/" (GDrive bare filenames) get the namespace as a
// filename suffix instead: "budget.json" → "budget-preview.json",
// "budget-backups" → "budget-preview-backups". Returns the path
// unchanged for the production build.
export function nsCloudPath(path: string): string {
  if (!STORAGE_NS) return path;
  if (path.startsWith("/")) return `/${STORAGE_NS}${path}`;
  // Bare filename / folder name: splice "-preview" before the
  // extension (or at the end if there's no extension).
  const dotIdx = path.lastIndexOf(".");
  if (dotIdx === -1 || path.indexOf("/") !== -1) {
    return `${path}-${STORAGE_NS}`;
  }
  return `${path.slice(0, dotIdx)}-${STORAGE_NS}${path.slice(dotIdx)}`;
}

// Suffix an IndexedDB database name with the namespace so the
// preview build opens a completely separate DB.
export function nsIdbName(name: string): string {
  if (!STORAGE_NS) return name;
  return `${name}-${STORAGE_NS}`;
}

// Legacy single-user bucket. Read only on first launch so data from
// before user accounts existed can be migrated into the first account
// that gets created; otherwise unused. The string value keeps its
// historical "budget.v1" prefix so existing installs still find it
// (production); the preview build sees "budget.preview.v1" via the
// `nsKey` namespace and never touches the production bucket.
export const STORAGE_KEY = nsKey("budget.v1");

// Registry of all accounts on this device, plus the id of whichever
// one is currently active. Plain JSON — usernames and password hashes
// (PBKDF2) are not secrets in the cryptographic sense. The preview
// build has its own registry under "budget.preview.users.v1", which
// starts empty.
export const USERS_KEY = nsKey("budget.users.v1");

// Per-user data bytes live under their own key so a delete leaves
// other users untouched and a future "switch account" stays a pure
// pointer flip. The key value retains the "budget.user." prefix for
// backwards compatibility with installs created before the type was
// renamed from Budget to UserData. The preview build prefixes
// "budget.preview.user.<id>" so its accounts (created in its own
// registry) cannot collide with production accounts.
export function userDataKey(userId: string): string {
  return nsKey(`budget.user.${userId}`);
}

// Device-local flags driving the Developer settings tab and the Logs
// tab. Stored outside `Settings` so they don't ride along in an
// export / import cycle — debug capture is per device, not per
// budget. Plain "true" / absent semantics; any other value is treated
// as absent. The logs blob lives under its own key so clearing it
// doesn't touch any other state.
export const DEV_MODE_KEY = nsKey("budget.devMode");
export const CAPTURE_LOGS_KEY = nsKey("budget.captureLogs");
export const LOGS_KEY = nsKey("budget.logs");

// Device-local sticky flag that hides the install hint after the user
// dismisses (or completes) the install once. Stored outside `Settings`
// because the hint is per-device (a desktop browser should not inherit
// a dismissal the user made on their iPhone) and because it is pure
// UI state, not budget data — it must not ride along in an export /
// import cycle. Value semantics: "1" = dismissed; absent = not
// dismissed yet. The storage string keeps its historical
// "iosInstallHintDismissed" name — the hint shipped iOS-only first
// and renaming the key would orphan early dismissals.
export const INSTALL_HINT_DISMISSED_KEY = nsKey(
  "budget.iosInstallHintDismissed",
);

// Ring-buffer cap for captured log entries. localStorage has a ~5 MB
// quota shared with budget data; 500 entries averaging a few hundred
// bytes each stays well inside that ceiling while giving a long
// enough tail for a typical mobile debugging session.
export const MAX_LOG_ENTRIES = 500;

// Per-user, per-device mirror of the active cloud backend. Holds the
// last bytes the cloud returned plus any offline edits that haven't
// pushed yet, so `withCloudMirror` can serve a snapshot on a cold
// load when the network is down. Keyed alongside the user's bucket
// so deleting a user wipes the mirror too. Preview build sees the
// `budget.preview.cloud-mirror.<id>` namespace.
export function cloudMirrorKey(userId: string): string {
  return nsKey(`budget.cloud-mirror.${userId}`);
}

// PBKDF2 parameters for the login password hash. Matches the data
// encryption module's iterations so an attacker sees no cheaper
// attack path; the salt is per-user, the iteration count is
// persisted on each user so a future bump can coexist with old
// records.
export const PASSWORD_HASH_ITERATIONS = 600_000;
export const PASSWORD_HASH_BITS = 256;
export const PASSWORD_SALT_BYTES = 16;

// Display name of the no-password "guest" account behind the
// "Continue without account" flow. Reserved — real accounts can't
// be created under this name while a default user is around.
export const DEFAULT_USERNAME = "Guest";

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
  "githubDark",
  "githubLight",
  "system",
  "custom",
] as const;

// Theme presets that belong to the Dark family — listed in the order
// the variant row renders them, with the One Dark original first. The
// Appearance picker's mode row uses these arrays to derive its
// selected family from the active preset, and the variant row reads
// the matching array to render its buttons.
export const DARK_THEMES = ["dark", "dracula", "githubDark"] as const;

// Theme presets in the Light family — One Light first, then the
// light VS Code variants.
export const LIGHT_THEMES = ["light", "githubLight"] as const;

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
  muted: "#7a8090",
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
  muted: "#6272a4",
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
  githubDark: DEFAULT_CUSTOM_THEME_COLORS_GITHUB_DARK,
  githubLight: DEFAULT_CUSTOM_THEME_COLORS_GITHUB_LIGHT,
};

export const DEFAULT_CUSTOM_THEME: CustomTheme = {
  colors: DEFAULT_CUSTOM_THEME_COLORS_DARK,
  radius: "md",
  density: "comfortable",
  borderWidth: "normal",
  reduceMotion: false,
};

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

// Defaults are Sweden-leaning: salary on the 25th drives the fiscal
// month, "kr" is SEK, and the number format is the Swedish convention
// (space as thousands separator, comma as decimal).
export const DEFAULT_SETTINGS: Settings = {
  startOfMonth: 25,
  dateFormat: "YYYY-MM-DD",
  shortDateFormat: "DD/MM",
  currency: "kr",
  currencyPosition: "after",
  currencySpace: true,
  decimalSeparator: ",",
  thousandsSeparator: " ",
  formatNumbers: true,
  showCurrency: true,
  showDecimals: false,
  abbreviateNumbers: false,
  alwaysAbbreviateBalance: true,
  fontScale: 1,
  sessionTimeoutMinutes: 15,
  lastSeenChangelogVersion: null,
  // Fresh installs override this with `detectInitialLanguage()` so a
  // Swedish browser gets Swedish on first run. Existing buckets keep
  // whatever the v26 → v27 migration assigned (always "en") so a
  // returning user's UI doesn't suddenly flip language.
  language: "en",
  hideTransfers: false,
  // Default tracks the OS colour-scheme — matches the pre-picker
  // behaviour so existing users notice nothing until they open the
  // Appearance tab. Monospaced font keeps the One Dark aesthetic.
  theme: "system",
  fontFamily: "mono",
  customTheme: DEFAULT_CUSTOM_THEME,
  achievements: {},
  unseenAchievements: [],
  headerAction: { kind: "top" },
};

// Allowed UI languages, in the order the picker shows them. Used by
// the validator, the schema, and the LanguagePicker so all three
// agree on which codes are valid.
export const SUPPORTED_LANGUAGES = ["en", "sv"] as const;

// Bounds for the UI text-size multiplier. The floor matches the
// smallest preset the picker offers and the ceiling matches the
// largest, with a hair of slack on either side so a hand-edited file
// just inside the limit passes validation. Going below 0.8 makes the
// UI illegible on mobile; going above 1.5 starts breaking layout —
// sticky headers stop tracking and amount cells wrap awkwardly.
export const MIN_FONT_SCALE = 0.8;
export const MAX_FONT_SCALE = 1.5;

// Discrete presets exposed in the settings UI. Stored independently of
// the bounds so a future slider can keep working alongside the
// dropdown without re-deriving the steps.
export const FONT_SCALE_PRESETS: readonly {
  scale: number;
  label: string;
}[] = [
  { scale: 0.9, label: "Small (90%)" },
  { scale: 1, label: "Default (100%)" },
  { scale: 1.1, label: "Large (110%)" },
  { scale: 1.25, label: "Extra large (125%)" },
];

// Bounds for the session timeout setting. One minute is the floor so a
// fat-finger 0 doesn't lock the user out instantly; 1440 minutes is a
// full day, which is the longest a tab-scoped cache is meaningful.
export const MIN_SESSION_TIMEOUT_MINUTES = 1;
export const MAX_SESSION_TIMEOUT_MINUTES = 24 * 60;

// Presets exposed in the settings UI. Stored independently of the bound
// constants so a future custom-value input can keep working alongside.
export const SESSION_TIMEOUT_PRESETS: readonly {
  minutes: number;
  label: string;
}[] = [
  { minutes: 5, label: "5 minutes" },
  { minutes: 15, label: "15 minutes" },
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 4 * 60, label: "4 hours" },
  { minutes: 8 * 60, label: "8 hours" },
  { minutes: 24 * 60, label: "24 hours" },
];

// Allowed date formats, in the order the settings UI lists them.
export const DATE_FORMATS: readonly DateFormat[] = [
  "YYYY-MM-DD",
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "DD.MM.YYYY",
  "D MMM YYYY",
];

// Year-less formats used by in-cell date renderings inside month
// tables. Leading zeros are stripped at format time, so "DD/MM"
// renders 1 May as "1/5" and 31 December as "31/12".
export const SHORT_DATE_FORMATS: readonly ShortDateFormat[] = [
  "DD/MM",
  "MM/DD",
  "DD.MM",
  "MM-DD",
  "D MMM",
];

// Predefined currency presets shown in the Settings → Format picker.
// Each entry fills the three free-form fields (`currency`,
// `currencyPosition`, `currencySpace`) in one go. The picker also
// exposes a "Custom…" entry that reveals the original inputs for any
// currency not represented here. Ordered by region (Nordic, European,
// North American) — the SelectPicker has no group support so order is
// the only grouping cue.
//
// Currencies that render identically (same symbol, position, and
// spacing) are collapsed into a single preset whose label joins the
// ISO codes with "/" — e.g. SEK/NOK/DKK/ISK all print as "kr" after
// the amount, so picking any one would produce the same output. The
// merged form keeps the picker short and avoids the misleading
// impression that the choice affects exchange rates (it doesn't —
// this app stores raw numbers, not currency-typed amounts).
//
// `nameKey` is a dotted i18n path looked up at render time; the
// constants module deliberately doesn't import the i18n catalog so
// startup stays cheap.
export type CurrencyPreset = {
  id: string;
  // ISO codes the preset covers, joined with "/" for the picker label.
  // Single-code entries (EUR, GBP, CHF) still use a one-element array
  // so the picker code can treat every preset uniformly.
  codes: readonly string[];
  symbol: string;
  position: "before" | "after";
  space: boolean;
  nameKey: string;
};

export const CURRENCY_PRESETS: readonly CurrencyPreset[] = [
  // Nordic kronor — all four render as "kr" after the amount.
  {
    id: "nordic-kr",
    codes: ["SEK", "NOK", "DKK", "ISK"],
    symbol: "kr",
    position: "after",
    space: true,
    nameKey: "settings.format.currencyName.nordicKr",
  },
  // European
  {
    id: "EUR",
    codes: ["EUR"],
    symbol: "€",
    position: "before",
    space: false,
    nameKey: "settings.format.currencyName.EUR",
  },
  {
    id: "GBP",
    codes: ["GBP"],
    symbol: "£",
    position: "before",
    space: false,
    nameKey: "settings.format.currencyName.GBP",
  },
  {
    id: "CHF",
    codes: ["CHF"],
    symbol: "CHF",
    position: "before",
    space: true,
    nameKey: "settings.format.currencyName.CHF",
  },
  // North American dollars — both render as "$" before the amount.
  {
    id: "dollar",
    codes: ["USD", "CAD"],
    symbol: "$",
    position: "before",
    space: false,
    nameKey: "settings.format.currencyName.dollar",
  },
];

// Browser-region → preset id. Consulted only by `detectInitialCurrency`
// on fresh install — existing users are not retroactively re-detected,
// mirroring the language-detection contract.
export const REGION_TO_CURRENCY_ID: Readonly<Record<string, string>> = {
  SE: "nordic-kr",
  NO: "nordic-kr",
  DK: "nordic-kr",
  IS: "nordic-kr",
  // Eurozone members covered by the EUR preset.
  AT: "EUR",
  BE: "EUR",
  CY: "EUR",
  DE: "EUR",
  EE: "EUR",
  ES: "EUR",
  FI: "EUR",
  FR: "EUR",
  GR: "EUR",
  IE: "EUR",
  IT: "EUR",
  LT: "EUR",
  LU: "EUR",
  LV: "EUR",
  MT: "EUR",
  NL: "EUR",
  PT: "EUR",
  SI: "EUR",
  SK: "EUR",
  GB: "GBP",
  CH: "CHF",
  LI: "CHF",
  US: "dollar",
  CA: "dollar",
};

// Palette for new categories. The set is tuned to read well over both
// One Dark and One Light surfaces; users pick from these or override.
// Colorless swatches (black / white / gray) are deliberately excluded —
// categories and types should always carry a hue so they stay
// distinguishable in chips and pickers.
//
// Index stability: the first eight entries are the original Atom One
// Dark accents and are referenced by index from `PRESET_CATEGORIES`,
// `PRESET_ENTRY_TYPES`, and `createSeedEntryTypes()`. Never reorder
// 0..7; append-only beyond that.
export const CATEGORY_COLORS: readonly string[] = [
  "#e06c75",
  "#d19a66",
  "#e5c07b",
  "#98c379",
  "#56b6c2",
  "#61afef",
  "#c678dd",
  "#be5046",
  "#e88eb0",
  "#d97757",
  "#e8aa6c",
  "#a3d775",
  "#5cb39e",
  "#7b8cd4",
  "#b48ead",
  "#a07555",
];

// Sheets reuse the category palette. Keeping them aligned means a
// user's existing colour intuition carries over, and the visual style
// of the sheet tabs matches the chips inside the sheet.
export const SHEET_COLORS: readonly string[] = CATEGORY_COLORS;

// Defaults applied to migrated sheets and the very first sheet a
// fresh budget seeds. `wallet` is a generic money glyph that reads
// well even at the tiny size used in the bottom tab bar.
export const DEFAULT_SHEET_GLYPH: SheetGlyph = "wallet";
export const DEFAULT_SHEET_COLOR: string = SHEET_COLORS[5];

// Display metadata for each sheet flavour. Today only `budget` is
// implemented; planners (loan, savings, parental-leave, …) join the
// list as their UIs land.
export const SHEET_TYPES: readonly {
  id: SheetType;
  label: string;
  description: string;
  glyph: SheetGlyph;
}[] = [
  {
    id: "budget",
    label: "Budget",
    description: "Track money in and out, month by month.",
    glyph: "wallet",
  },
  {
    id: "accounts",
    label: "Accounts",
    description: "Manage accounts and transfers between them.",
    glyph: "piggy-bank",
  },
];

// Horizon used when a recurring entry has no explicit end date. Twelve
// months is enough to populate the next year's planning view without
// flooding storage; users can re-run the modal to extend further.
export const DEFAULT_RECURRENCE_MONTHS = 12;

// Historical seed for entry types — used only by the v12 → v13
// migration. The v13 → v20 path no longer seeds the per-user `types`
// array (`PRESET_ENTRY_TYPES` below replaces it as a built-in,
// hide-only list), but exports that landed at v12 must still upgrade
// to a non-empty seed so users who migrate forward see something in
// the picker on first promote. Each call returns a fresh array with
// newly minted ids so the seed is safe to invoke without ids
// colliding. The v24 → v25 migration assigns every seeded type a
// `categoryId` after the fact (matching the type's name against the
// preset-type mapping); the legacy seed shape here intentionally
// omits the field so this function stays a faithful reproduction of
// what v12 exports actually contained.
export function createSeedEntryTypes(): Omit<EntryType, "categoryId">[] {
  const C = CATEGORY_COLORS;
  const seeds: ReadonlyArray<{
    name: string;
    color: string;
    glyph: CategoryIcon;
  }> = [
    { name: "Mortgage", color: C[0], glyph: "home" },
    { name: "Rent", color: C[1], glyph: "home" },
    { name: "Groceries", color: C[3], glyph: "shopping-cart" },
    { name: "Restaurant", color: C[2], glyph: "utensils" },
    { name: "Coffee", color: C[7], glyph: "coffee" },
    { name: "Transport", color: C[4], glyph: "car" },
    { name: "Electricity", color: C[2], glyph: "zap" },
    { name: "Insurance", color: C[7], glyph: "receipt" },
    { name: "Streaming", color: C[6], glyph: "music" },
    { name: "Healthcare", color: C[0], glyph: "stethoscope" },
    { name: "Gift", color: C[6], glyph: "gift" },
    { name: "Salary", color: C[3], glyph: "banknote" },
    { name: "Savings", color: C[5], glyph: "piggy-bank" },
    { name: "Subscription", color: C[7], glyph: "credit-card" },
  ];
  return seeds.map((s) => ({
    id: seedEntryTypeId(),
    name: s.name,
    color: s.color,
    glyph: s.glyph,
  }));
}

// Local id generator for seed types. Mirrors `newId()` in
// `src/data/sheet.ts` but the constants module shouldn't import from
// `data/sheet` (which itself imports from constants). Twelve random
// base-36 chars is plenty of entropy for a per-user array of a few
// dozen entries.
function seedEntryTypeId(): string {
  return `t-${Math.random().toString(36).slice(2, 10)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

// Master allowlist of glyph names. Used by the validator (rejects
// values outside this set) and as the source of truth that mirrors
// the `CategoryIcon` union in `types.ts`. Adding a glyph means
// touching this array, the union, and the `CATEGORY_ICONS` map in
// `components/icons.tsx`.
//
// The picker grids do NOT iterate this directly — each context picks
// from a curated subset (`SHEET_GLYPH_NAMES`, `ACCOUNT_GLYPH_NAMES`,
// `CATEGORY_GLYPH_NAMES`, `TYPE_GLYPH_NAMES`) so the user sees
// relevant choices for what they're labelling. Cross-context values
// still validate (a category tagged `wallet` is fine; the picker just
// won't offer it in the category grid).
export const CATEGORY_ICON_NAMES = [
  "tag",
  "home",
  "car",
  "shopping-bag",
  "shopping-cart",
  "utensils",
  "coffee",
  "pizza",
  "heart",
  "gift",
  "music",
  "film",
  "plane",
  "hotel",
  "package",
  "hand-heart",
  "briefcase",
  "graduation-cap",
  "stethoscope",
  "pill",
  "receipt",
  "banknote",
  "credit-card",
  "piggy-bank",
  "wallet",
  "zap",
  "sparkles",
  "star",
  "cookie",
  "cake",
  "ice-cream",
  "beer",
  "wine",
  "hand-platter",
  "cooking-pot",
  "bus",
  "train",
  "bike",
  "fuel",
  "bed",
  "sofa",
  "lightbulb",
  "droplet",
  "flame",
  "wifi",
  "key",
  "wrench",
  "hammer",
  "brush-cleaning",
  "trash-2",
  "sprout",
  "umbrella",
  "smartphone",
  "laptop",
  "headphones",
  "camera",
  "shirt",
  "scissors",
  "ticket",
  "gamepad-2",
  "book-open",
  "dumbbell",
  "dog",
  "cat",
  "paw-print",
  "tree-pine",
  "baby",
  "heart-pulse",
  "coins",
  "hand-coins",
  "landmark",
  "building-2",
  "vault",
  "gem",
  "bitcoin",
  "scale",
  "trending-up",
  "line-chart",
  "pie-chart",
  "calendar-days",
  "globe",
  "arrow-down-circle",
  "arrow-up-circle",
] as const;

// Sheets are workspace containers and planners — what's being tracked.
// The palette leans toward money, planning, and high-level financial
// concepts; fine-grained entries (gasoline, restaurant visits) belong
// on EntryTypes, not on the sheet tab.
export const SHEET_GLYPH_NAMES: readonly CategoryIcon[] = [
  "wallet",
  "piggy-bank",
  "banknote",
  "credit-card",
  "coins",
  "landmark",
  "vault",
  "calendar-days",
  "pie-chart",
  "line-chart",
  "trending-up",
  "scale",
  "home",
  "car",
  "plane",
  "briefcase",
  "graduation-cap",
  "baby",
  "heart-pulse",
  "gift",
  "receipt",
  "star",
] as const;

// Accounts are real-world money stores — bank accounts, cards, cash,
// brokerage, crypto, loans. The palette covers the spectrum so users
// can express checking vs. mortgage vs. mobile-pay app at a glance.
export const ACCOUNT_GLYPH_NAMES: readonly CategoryIcon[] = [
  "wallet",
  "coins",
  "banknote",
  "credit-card",
  "landmark",
  "building-2",
  "vault",
  "piggy-bank",
  "gift",
  "baby",
  "trending-up",
  "line-chart",
  "gem",
  "bitcoin",
  "scale",
  "home",
  "car",
  "graduation-cap",
  "smartphone",
  "globe",
  "briefcase",
] as const;

// Categories are broad buckets used for cross-row analysis: Home,
// Food, Car, Travel, Health, Bills. The palette stays high-level so
// fine-grained icons (gasoline vs. bus vs. train) don't pollute what
// is meant to be a summary axis.
export const CATEGORY_GLYPH_NAMES: readonly CategoryIcon[] = [
  "home",
  "utensils",
  "shopping-bag",
  "shopping-cart",
  "shirt",
  "car",
  "plane",
  "heart-pulse",
  "pill",
  "receipt",
  "banknote",
  "piggy-bank",
  "credit-card",
  "graduation-cap",
  "book-open",
  "baby",
  "heart",
  "gift",
  "zap",
  "wifi",
  "film",
  "music",
  "gamepad-2",
  "dumbbell",
  "paw-print",
  "tree-pine",
  "briefcase",
  "wrench",
  "landmark",
  "sparkles",
  "star",
  "tag",
] as const;

// EntryTypes are concrete, frequently-repeating entries: Rent,
// Gasoline, Restaurant visit, Coffee, Streaming, Salary. The palette
// is the widest of the four so users have a glyph for almost any
// real-world line item they want to label.
export const TYPE_GLYPH_NAMES: readonly CategoryIcon[] = [
  // Food & drink
  "utensils",
  "coffee",
  "pizza",
  "cookie",
  "cake",
  "ice-cream",
  "beer",
  "wine",
  "hand-platter",
  "cooking-pot",
  "shopping-cart",
  // Transport
  "car",
  "fuel",
  "bus",
  "train",
  "bike",
  "plane",
  "hotel",
  "package",
  // Home & utilities
  "home",
  "key",
  "bed",
  "sofa",
  "lightbulb",
  "droplet",
  "flame",
  "zap",
  "wifi",
  "wrench",
  "hammer",
  "brush-cleaning",
  "trash-2",
  "sprout",
  "umbrella",
  // Tech & gadgets
  "smartphone",
  "laptop",
  "headphones",
  "camera",
  // Lifestyle
  "shopping-bag",
  "shirt",
  "scissors",
  "ticket",
  "film",
  "music",
  "gamepad-2",
  "book-open",
  "dumbbell",
  "dog",
  "cat",
  "paw-print",
  "tree-pine",
  "baby",
  "gift",
  "heart",
  "hand-heart",
  // Health
  "stethoscope",
  "pill",
  "heart-pulse",
  // Work & education
  "briefcase",
  "graduation-cap",
  // Money
  "banknote",
  "coins",
  "credit-card",
  "wallet",
  "piggy-bank",
  "hand-coins",
  "receipt",
  "arrow-down-circle",
  "arrow-up-circle",
  "trending-up",
  "scale",
  "landmark",
  "bitcoin",
  // Misc
  "calendar-days",
  "sparkles",
  "star",
  "tag",
] as const;

// Built-in entry types aimed at a typical Swedish household — bolån,
// hyra, el, SL/kollektivtrafik, A-kassa, Systembolaget, CSN. Presets
// live in code rather than in `UserData.types` so they survive an
// export/import cycle and stay consistent across devices. The user
// can hide individual presets via `UserData.hiddenPresetTypeIds`
// (managed from Settings → Types), but cannot edit or delete them —
// custom labels go through "Add type" instead, which writes a normal
// `EntryType` into `UserData.types`.
//
// Preset ids use the `preset-type-<slug>` prefix so they're trivially
// distinguishable from user-minted ids (`t-…`) in stored data and in
// the validator. Once shipped, an id must never be reassigned — a
// rename keeps the id; a removed preset stays in this list (the
// hidden flag is the user-facing equivalent) so existing references
// continue to resolve.
export const PRESET_ENTRY_TYPES: ReadonlyArray<EntryType> = (() => {
  const C = CATEGORY_COLORS;
  // Every preset type belongs to exactly one preset category. The
  // `category` field is a preset-category slug (without the `preset-cat-`
  // prefix) — the `id` minted below is `preset-cat-<slug>` so a type's
  // resolved `categoryId` matches a real `PRESET_CATEGORIES[].id`.
  const seeds: ReadonlyArray<{
    slug: string;
    name: string;
    color: string;
    glyph: CategoryIcon;
    category: string;
    // Income / expense filter direction. `undefined` (the default)
    // means the preset works for either direction; readers translate
    // that to `kind: "any"` when projecting.
    kind?: "income" | "expense";
  }> = [
    // Housing
    {
      slug: "rent",
      name: "Rent",
      color: C[1],
      glyph: "home",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "mortgage",
      name: "Mortgage",
      color: C[0],
      glyph: "home",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "home-insurance",
      name: "Home insurance",
      color: C[7],
      glyph: "umbrella",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "cleaning",
      name: "Cleaning",
      color: C[5],
      glyph: "brush-cleaning",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "gas",
      name: "Gas",
      color: C[1],
      glyph: "cooking-pot",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "electricity",
      name: "Electricity",
      color: C[2],
      glyph: "zap",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "heating",
      name: "Heating",
      color: C[1],
      glyph: "flame",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "water",
      name: "Water",
      color: C[5],
      glyph: "droplet",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "internet",
      name: "Internet",
      color: C[5],
      glyph: "wifi",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "phone",
      name: "Phone",
      color: C[4],
      glyph: "smartphone",
      category: "bills",
      kind: "expense",
    },
    // Food
    {
      slug: "groceries",
      name: "Groceries",
      color: C[3],
      glyph: "shopping-cart",
      category: "food",
      kind: "expense",
    },
    {
      slug: "restaurant",
      name: "Restaurant",
      color: C[2],
      glyph: "utensils",
      category: "food",
      kind: "expense",
    },
    {
      slug: "lunch",
      name: "Lunch",
      color: C[2],
      glyph: "utensils",
      category: "food",
      kind: "expense",
    },
    {
      slug: "cafe",
      name: "Cafe",
      color: C[7],
      glyph: "coffee",
      category: "food",
      kind: "expense",
    },
    {
      slug: "systembolaget",
      name: "Systembolaget",
      color: C[0],
      glyph: "wine",
      category: "food",
      kind: "expense",
    },
    {
      slug: "takeaway",
      name: "Takeaway",
      color: C[2],
      glyph: "hand-platter",
      category: "food",
      kind: "expense",
    },
    // Transport
    {
      slug: "fuel",
      name: "Fuel",
      color: C[1],
      glyph: "fuel",
      category: "transport",
      kind: "expense",
    },
    {
      slug: "public-transport",
      name: "Public transport",
      color: C[4],
      glyph: "bus",
      category: "transport",
      kind: "expense",
    },
    {
      slug: "parking",
      name: "Parking",
      color: C[7],
      glyph: "car",
      category: "transport",
      kind: "expense",
    },
    {
      slug: "car-insurance",
      name: "Car insurance",
      color: C[7],
      glyph: "car",
      category: "transport",
      kind: "expense",
    },
    {
      slug: "vehicle-tax",
      name: "Vehicle tax",
      color: C[7],
      glyph: "car",
      category: "transport",
      kind: "expense",
    },
    {
      slug: "congestion-tax",
      name: "Congestion tax",
      color: C[7],
      glyph: "car",
      category: "transport",
      kind: "expense",
    },
    {
      slug: "leasing",
      name: "Leasing",
      color: C[4],
      glyph: "car",
      category: "transport",
      kind: "expense",
    },
    // Health & personal
    {
      slug: "pharmacy",
      name: "Apoteket",
      color: C[0],
      glyph: "pill",
      category: "health",
      kind: "expense",
    },
    {
      slug: "healthcare",
      name: "Healthcare",
      color: C[0],
      glyph: "stethoscope",
      category: "health",
      kind: "expense",
    },
    {
      slug: "dentist",
      name: "Dentist",
      color: C[0],
      glyph: "heart-pulse",
      category: "health",
      kind: "expense",
    },
    {
      slug: "gym",
      name: "Gym",
      color: C[3],
      glyph: "dumbbell",
      category: "health",
      kind: "expense",
    },
    {
      slug: "haircut",
      name: "Haircut",
      color: C[6],
      glyph: "scissors",
      category: "personal",
      kind: "expense",
    },
    // Family
    {
      slug: "childcare",
      name: "Förskola",
      color: C[6],
      glyph: "baby",
      category: "family",
      kind: "expense",
    },
    {
      slug: "child-allowance",
      name: "Barnbidrag",
      color: C[3],
      glyph: "baby",
      category: "family",
      kind: "income",
    },
    {
      slug: "allowance",
      name: "Veckopeng",
      color: C[6],
      glyph: "hand-coins",
      category: "family",
      kind: "expense",
    },
    // Subscriptions / bills
    {
      slug: "spotify",
      name: "Spotify",
      color: C[3],
      glyph: "music",
      category: "entertainment",
      kind: "expense",
    },
    {
      slug: "netflix",
      name: "Netflix",
      color: C[0],
      glyph: "film",
      category: "entertainment",
      kind: "expense",
    },
    {
      slug: "streaming",
      name: "Streaming",
      color: C[6],
      glyph: "film",
      category: "entertainment",
      kind: "expense",
    },
    {
      slug: "subscription",
      name: "Subscription",
      color: C[7],
      glyph: "credit-card",
      category: "bills",
      kind: "expense",
    },
    {
      slug: "union-fee",
      name: "Fackavgift",
      color: C[7],
      glyph: "briefcase",
      category: "bills",
      kind: "expense",
    },
    {
      slug: "a-kassa",
      name: "A-kassa",
      color: C[7],
      glyph: "briefcase",
      category: "bills",
      kind: "expense",
    },
    {
      slug: "csn",
      name: "CSN",
      color: C[6],
      glyph: "graduation-cap",
      category: "bills",
      kind: "expense",
    },
    // Income
    {
      slug: "salary",
      name: "Salary",
      color: C[3],
      glyph: "banknote",
      category: "income",
      kind: "income",
    },
    {
      slug: "bonus",
      name: "Bonus",
      color: C[3],
      glyph: "hand-coins",
      category: "income",
      kind: "income",
    },
    {
      slug: "tax-refund",
      name: "Tax refund",
      color: C[3],
      glyph: "landmark",
      category: "income",
      kind: "income",
    },
    // Savings — left as "any" because some households model savings
    // both ways (a deposit out of checking on one sheet, the matching
    // arrival on the savings sheet).
    {
      slug: "savings",
      name: "Savings",
      color: C[5],
      glyph: "piggy-bank",
      category: "savings",
    },
    {
      slug: "isk",
      name: "ISK",
      color: C[5],
      glyph: "trending-up",
      category: "savings",
    },
    {
      slug: "pension",
      name: "Pension",
      color: C[5],
      glyph: "vault",
      category: "savings",
    },
    // Personal / misc
    {
      slug: "clothing",
      name: "Clothing",
      color: C[6],
      glyph: "shirt",
      category: "personal",
      kind: "expense",
    },
    {
      slug: "gift",
      name: "Gift",
      color: C[6],
      glyph: "gift",
      category: "personal",
      kind: "expense",
    },
    {
      slug: "hobby",
      name: "Hobby",
      color: C[2],
      glyph: "sparkles",
      category: "personal",
      kind: "expense",
    },
    {
      slug: "travel",
      name: "Travel",
      color: C[4],
      glyph: "plane",
      category: "travel",
      kind: "expense",
    },
    {
      slug: "hotel",
      name: "Hotel",
      color: C[4],
      glyph: "hotel",
      category: "travel",
      kind: "expense",
    },
  ];
  return seeds.map((s) => ({
    id: `preset-type-${s.slug}`,
    name: s.name,
    color: s.color,
    glyph: s.glyph,
    categoryId: `preset-cat-${s.category}`,
    ...(s.kind === undefined ? {} : { kind: s.kind }),
  }));
})();

// Lookup for the validator (cheap membership test against the preset
// id list). Built once at module load — `PRESET_ENTRY_TYPES` is a
// frozen literal so the set never needs to be rebuilt.
export const PRESET_ENTRY_TYPE_IDS: ReadonlySet<string> = new Set(
  PRESET_ENTRY_TYPES.map((t) => t.id),
);

// Built-in categories. Categories are broader buckets than types —
// a household typically has under a dozen, used for cross-row analysis
// (Housing vs. Food vs. Transport). The picker also shows any
// user-added categories from `UserData.categories`. The user can hide
// individual presets via `UserData.hiddenPresetCategoryIds`. Same
// id-stability contract as `PRESET_ENTRY_TYPES`.
export const PRESET_CATEGORIES: ReadonlyArray<Category> = (() => {
  const C = CATEGORY_COLORS;
  const seeds: ReadonlyArray<{
    slug: string;
    name: string;
    color: string;
    icon: CategoryIcon;
  }> = [
    { slug: "housing", name: "Housing", color: C[1], icon: "home" },
    { slug: "food", name: "Food", color: C[3], icon: "utensils" },
    { slug: "transport", name: "Transport", color: C[4], icon: "car" },
    { slug: "health", name: "Health", color: C[0], icon: "heart-pulse" },
    { slug: "bills", name: "Bills", color: C[7], icon: "receipt" },
    {
      slug: "entertainment",
      name: "Entertainment",
      color: C[6],
      icon: "film",
    },
    { slug: "savings", name: "Savings", color: C[5], icon: "piggy-bank" },
    { slug: "income", name: "Income", color: C[3], icon: "banknote" },
    { slug: "family", name: "Family", color: C[6], icon: "baby" },
    { slug: "personal", name: "Personal", color: C[2], icon: "shirt" },
    { slug: "travel", name: "Travel", color: C[4], icon: "plane" },
    { slug: "other", name: "Other", color: C[5], icon: "tag" },
  ];
  return seeds.map((s) => ({
    id: `preset-cat-${s.slug}`,
    name: s.name,
    color: s.color,
    icon: s.icon,
  }));
})();

export const PRESET_CATEGORY_IDS: ReadonlySet<string> = new Set(
  PRESET_CATEGORIES.map((c) => c.id),
);

// Catch-all preset category used when a type doesn't fit any specific
// bucket. The v24 → v25 migration falls back to this id for user
// types whose name doesn't match any known preset, and the picker /
// settings UI lean on it when a type is being created without an
// explicit category. Always present — `PRESET_CATEGORIES` includes the
// "other" slug — so consumers can hardcode the id with confidence.
export const DEFAULT_CATEGORY_ID = "preset-cat-other";
