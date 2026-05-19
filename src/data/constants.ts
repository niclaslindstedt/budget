import { IS_PREVIEW } from "../utils/build-env";
import type {
  Category,
  CategoryIcon,
  DateFormat,
  EntryType,
  Settings,
  SheetGlyph,
  SheetType,
  ShortDateFormat,
  ThousandsSeparator,
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
};

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

// Pre-baked number-format combinations. Each entry pairs a thousands
// separator with a decimal separator so the settings UI can offer a
// single dropdown of valid combinations; the underlying settings store
// the two characters independently so a future custom combo doesn't
// require a schema bump.
export type NumberFormatPreset = {
  id: string;
  label: string;
  thousands: ThousandsSeparator;
  decimal: "." | ",";
};

export const NUMBER_FORMATS: readonly NumberFormatPreset[] = [
  { id: "space-comma", label: "1 234,56", thousands: " ", decimal: "," },
  { id: "space-dot", label: "1 234.56", thousands: " ", decimal: "." },
  { id: "comma-dot", label: "1,234.56", thousands: ",", decimal: "." },
  { id: "dot-comma", label: "1.234,56", thousands: ".", decimal: "," },
  { id: "plain-dot", label: "1234.56", thousands: "", decimal: "." },
  { id: "plain-comma", label: "1234,56", thousands: "", decimal: "," },
];

// Palette for new categories. The set is tuned to read well over both
// One Dark and One Light surfaces; users pick from these or override.
export const CATEGORY_COLORS: readonly string[] = [
  "#e06c75",
  "#d19a66",
  "#e5c07b",
  "#98c379",
  "#56b6c2",
  "#61afef",
  "#c678dd",
  "#be5046",
  "#5c6370",
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
// colliding.
export function createSeedEntryTypes(): EntryType[] {
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
    { name: "Insurance", color: C[8], glyph: "receipt" },
    { name: "Streaming", color: C[6], glyph: "music" },
    { name: "Healthcare", color: C[0], glyph: "stethoscope" },
    { name: "Gift", color: C[6], glyph: "gift" },
    { name: "Salary", color: C[3], glyph: "banknote" },
    { name: "Savings", color: C[5], glyph: "piggy-bank" },
    { name: "Subscription", color: C[8], glyph: "credit-card" },
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
  "shopping-cart",
  // Transport
  "car",
  "fuel",
  "bus",
  "train",
  "bike",
  "plane",
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
  const seeds: ReadonlyArray<{
    slug: string;
    name: string;
    color: string;
    glyph: CategoryIcon;
  }> = [
    // Housing
    { slug: "rent", name: "Rent", color: C[1], glyph: "home" },
    { slug: "mortgage", name: "Mortgage", color: C[0], glyph: "home" },
    {
      slug: "hoa-fee",
      name: "HOA fee",
      color: C[0],
      glyph: "building-2",
    },
    {
      slug: "home-insurance",
      name: "Home insurance",
      color: C[8],
      glyph: "receipt",
    },
    { slug: "electricity", name: "Electricity", color: C[2], glyph: "zap" },
    { slug: "heating", name: "Heating", color: C[1], glyph: "flame" },
    { slug: "water", name: "Water", color: C[5], glyph: "droplet" },
    { slug: "internet", name: "Internet", color: C[5], glyph: "wifi" },
    { slug: "phone", name: "Phone", color: C[4], glyph: "smartphone" },
    // Food
    {
      slug: "groceries",
      name: "Groceries",
      color: C[3],
      glyph: "shopping-cart",
    },
    {
      slug: "restaurant",
      name: "Restaurant",
      color: C[2],
      glyph: "utensils",
    },
    { slug: "lunch", name: "Lunch", color: C[2], glyph: "utensils" },
    { slug: "cafe", name: "Cafe", color: C[7], glyph: "coffee" },
    {
      slug: "systembolaget",
      name: "Systembolaget",
      color: C[0],
      glyph: "wine",
    },
    // Transport
    { slug: "fuel", name: "Fuel", color: C[1], glyph: "fuel" },
    {
      slug: "public-transport",
      name: "Public transport",
      color: C[4],
      glyph: "bus",
    },
    { slug: "parking", name: "Parking", color: C[8], glyph: "car" },
    {
      slug: "car-insurance",
      name: "Car insurance",
      color: C[8],
      glyph: "car",
    },
    {
      slug: "vehicle-tax",
      name: "Vehicle tax",
      color: C[8],
      glyph: "car",
    },
    {
      slug: "congestion-tax",
      name: "Congestion tax",
      color: C[7],
      glyph: "car",
    },
    // Health & personal
    { slug: "pharmacy", name: "Apoteket", color: C[0], glyph: "pill" },
    {
      slug: "healthcare",
      name: "Healthcare",
      color: C[0],
      glyph: "stethoscope",
    },
    { slug: "dentist", name: "Dentist", color: C[0], glyph: "heart-pulse" },
    { slug: "gym", name: "Gym", color: C[3], glyph: "dumbbell" },
    { slug: "haircut", name: "Haircut", color: C[6], glyph: "scissors" },
    // Family
    { slug: "childcare", name: "Förskola", color: C[6], glyph: "baby" },
    {
      slug: "child-allowance",
      name: "Barnbidrag",
      color: C[3],
      glyph: "baby",
    },
    {
      slug: "allowance",
      name: "Veckopeng",
      color: C[6],
      glyph: "hand-coins",
    },
    // Subscriptions / bills
    { slug: "spotify", name: "Spotify", color: C[3], glyph: "music" },
    { slug: "netflix", name: "Netflix", color: C[0], glyph: "film" },
    { slug: "streaming", name: "Streaming", color: C[6], glyph: "film" },
    {
      slug: "subscription",
      name: "Subscription",
      color: C[8],
      glyph: "credit-card",
    },
    {
      slug: "union-fee",
      name: "Fackavgift",
      color: C[8],
      glyph: "briefcase",
    },
    { slug: "a-kassa", name: "A-kassa", color: C[8], glyph: "briefcase" },
    { slug: "csn", name: "CSN", color: C[6], glyph: "graduation-cap" },
    // Income
    { slug: "salary", name: "Salary", color: C[3], glyph: "banknote" },
    { slug: "bonus", name: "Bonus", color: C[3], glyph: "hand-coins" },
    {
      slug: "tax-refund",
      name: "Tax refund",
      color: C[3],
      glyph: "landmark",
    },
    // Savings
    { slug: "savings", name: "Savings", color: C[5], glyph: "piggy-bank" },
    { slug: "isk", name: "ISK", color: C[5], glyph: "trending-up" },
    { slug: "pension", name: "Pension", color: C[5], glyph: "vault" },
    // Personal / misc
    { slug: "clothing", name: "Clothing", color: C[6], glyph: "shirt" },
    { slug: "gift", name: "Gift", color: C[6], glyph: "gift" },
    { slug: "hobby", name: "Hobby", color: C[2], glyph: "sparkles" },
    { slug: "travel", name: "Travel", color: C[4], glyph: "plane" },
  ];
  return seeds.map((s) => ({
    id: `preset-type-${s.slug}`,
    name: s.name,
    color: s.color,
    glyph: s.glyph,
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
    { slug: "bills", name: "Bills", color: C[8], icon: "receipt" },
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
