import { IS_PREVIEW } from "../utils/build-env";
import { DEFAULT_CUSTOM_THEME } from "./themes";
import type {
  AccountsDownloadPrefs,
  BudgetDownloadPrefs,
  CategoryIcon,
  DateFormat,
  DeviceSettings,
  PersistedSettings,
  Settings,
  SheetGlyph,
  SheetType,
  ShortDateFormat,
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

// Default download-modal preferences. Lifted from the legacy
// `src/storage/download-preferences.ts` (deleted in v35) so the
// migration and the validator can seed them without re-importing
// from a place they no longer live.
export const DEFAULT_DOWNLOAD_BUDGET: BudgetDownloadPrefs = {
  format: "csv",
  includeHistory: true,
};

export const DEFAULT_DOWNLOAD_ACCOUNTS: AccountsDownloadPrefs = {
  accountInfo: {},
  accountTransactions: {},
  accountSelected: {},
  includeTransactions: true,
  includeUnconfirmed: false,
  includeFutureEntries: false,
};

// Effective-shape baseline used by tests, the SettingsModal "Reset to
// defaults" handler, and the validator's soft-recovery fallbacks. The
// shape is flat so existing reads (`DEFAULT_SETTINGS.fontScale`,
// `DEFAULT_SETTINGS.currency`) keep working — `DEFAULT_PERSISTED_SETTINGS`
// below splits this into the common + device buckets the runtime stores.
//
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
  downloadBudget: DEFAULT_DOWNLOAD_BUDGET,
  downloadAccounts: DEFAULT_DOWNLOAD_ACCOUNTS,
  cloudReauthAutoOpen: true,
  transactionSortOrder: "newestFirst",
  showFutureEntries: false,
  futureEntryMonths: 1,
};

// Default values for the device-scoped slice of settings. Today mobile
// and desktop share the same defaults so a fresh install on either
// viewport behaves like pre-v35; the structure is here so future
// per-viewport defaults (e.g. mobile-friendly `headerAction`) can land
// without another migration.
export const DEFAULT_DEVICE_SETTINGS_MOBILE: DeviceSettings = {
  formatNumbers: DEFAULT_SETTINGS.formatNumbers,
  showCurrency: DEFAULT_SETTINGS.showCurrency,
  showDecimals: DEFAULT_SETTINGS.showDecimals,
  abbreviateNumbers: DEFAULT_SETTINGS.abbreviateNumbers,
  alwaysAbbreviateBalance: DEFAULT_SETTINGS.alwaysAbbreviateBalance,
  fontScale: DEFAULT_SETTINGS.fontScale,
  headerAction: DEFAULT_SETTINGS.headerAction,
  downloadBudget: { ...DEFAULT_DOWNLOAD_BUDGET },
  downloadAccounts: cloneAccountsDownloadPrefs(DEFAULT_DOWNLOAD_ACCOUNTS),
};

export const DEFAULT_DEVICE_SETTINGS_DESKTOP: DeviceSettings = {
  formatNumbers: DEFAULT_SETTINGS.formatNumbers,
  showCurrency: DEFAULT_SETTINGS.showCurrency,
  showDecimals: DEFAULT_SETTINGS.showDecimals,
  abbreviateNumbers: DEFAULT_SETTINGS.abbreviateNumbers,
  alwaysAbbreviateBalance: DEFAULT_SETTINGS.alwaysAbbreviateBalance,
  fontScale: DEFAULT_SETTINGS.fontScale,
  headerAction: DEFAULT_SETTINGS.headerAction,
  downloadBudget: { ...DEFAULT_DOWNLOAD_BUDGET },
  downloadAccounts: cloneAccountsDownloadPrefs(DEFAULT_DOWNLOAD_ACCOUNTS),
};

// Persisted-shape baseline. The runtime stores this; reads go through
// `useEffectiveSettings()` which resolves the active scope.
export const DEFAULT_PERSISTED_SETTINGS: PersistedSettings = {
  startOfMonth: DEFAULT_SETTINGS.startOfMonth,
  dateFormat: DEFAULT_SETTINGS.dateFormat,
  shortDateFormat: DEFAULT_SETTINGS.shortDateFormat,
  currency: DEFAULT_SETTINGS.currency,
  currencyPosition: DEFAULT_SETTINGS.currencyPosition,
  currencySpace: DEFAULT_SETTINGS.currencySpace,
  decimalSeparator: DEFAULT_SETTINGS.decimalSeparator,
  thousandsSeparator: DEFAULT_SETTINGS.thousandsSeparator,
  sessionTimeoutMinutes: DEFAULT_SETTINGS.sessionTimeoutMinutes,
  lastSeenChangelogVersion: DEFAULT_SETTINGS.lastSeenChangelogVersion,
  language: DEFAULT_SETTINGS.language,
  hideTransfers: DEFAULT_SETTINGS.hideTransfers,
  theme: DEFAULT_SETTINGS.theme,
  fontFamily: DEFAULT_SETTINGS.fontFamily,
  customTheme: DEFAULT_SETTINGS.customTheme,
  achievements: DEFAULT_SETTINGS.achievements,
  unseenAchievements: DEFAULT_SETTINGS.unseenAchievements,
  cloudReauthAutoOpen: DEFAULT_SETTINGS.cloudReauthAutoOpen,
  transactionSortOrder: DEFAULT_SETTINGS.transactionSortOrder,
  showFutureEntries: DEFAULT_SETTINGS.showFutureEntries,
  futureEntryMonths: DEFAULT_SETTINGS.futureEntryMonths,
  device: {
    mobile: DEFAULT_DEVICE_SETTINGS_MOBILE,
    desktop: DEFAULT_DEVICE_SETTINGS_DESKTOP,
  },
};

function cloneAccountsDownloadPrefs(
  p: AccountsDownloadPrefs,
): AccountsDownloadPrefs {
  return {
    accountInfo: { ...p.accountInfo },
    accountTransactions: { ...p.accountTransactions },
    accountSelected: { ...p.accountSelected },
    includeTransactions: p.includeTransactions,
    includeUnconfirmed: p.includeUnconfirmed,
    includeFutureEntries: p.includeFutureEntries,
  };
}

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
  "car-front",
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
  "paint-roller",
  "washing-machine",
  "smartphone",
  "laptop",
  "headphones",
  "camera",
  "tv",
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
  "toy-brick",
  "school",
  "trophy",
  "pencil",
  "dice-5",
  "book-headphones",
  "hourglass",
  "heart-pulse",
  "shield-plus",
  "glasses",
  "brain",
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
  "percent",
  "newspaper",
  "book-marked",
  "clapperboard",
  "palette",
  "lamp",
  "bath",
  "compass",
  "circle-help",
  "repeat",
  "banknote-arrow-down",
  "flag",
  "shield-alert",
  "cloud",
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
  "palette",
  "sparkles",
  "star",
  "tag",
  "circle-help",
  "repeat",
  "cloud",
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
  "car-front",
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
  "paint-roller",
  "washing-machine",
  "lamp",
  "bath",
  // Tech & gadgets
  "smartphone",
  "laptop",
  "headphones",
  "camera",
  "tv",
  // Lifestyle
  "shopping-bag",
  "shirt",
  "scissors",
  "ticket",
  "film",
  "clapperboard",
  "music",
  "gamepad-2",
  "book-open",
  "book-marked",
  "newspaper",
  "palette",
  "dumbbell",
  "dog",
  "cat",
  "paw-print",
  "tree-pine",
  "baby",
  "toy-brick",
  "school",
  "trophy",
  "pencil",
  "dice-5",
  "book-headphones",
  "gift",
  "heart",
  "hand-heart",
  "hourglass",
  // Health
  "stethoscope",
  "pill",
  "heart-pulse",
  "shield-plus",
  "glasses",
  "brain",
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
  "percent",
  // Misc
  "calendar-days",
  "compass",
  "sparkles",
  "star",
  "tag",
  // Status & flags
  "circle-help",
  "repeat",
  "banknote-arrow-down",
  "flag",
  "shield-alert",
  "cloud",
] as const;
