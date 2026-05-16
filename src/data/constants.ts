import type {
  DateFormat,
  Settings,
  ShortDateFormat,
  ThousandsSeparator,
} from "./types";

// Maximum visual width of a column before its content wraps. Used to cap
// auto-sizing in the CSS via a custom property. Will become a per-sheet
// setting once the UI exists for it.
export const MAX_COLUMN_CHARS = 60;

// Legacy single-user bucket. Read only on first launch so data from
// before user accounts existed can be migrated into the first account
// that gets created; otherwise unused. The string value keeps its
// historical "budget.v1" prefix so existing installs still find it.
export const STORAGE_KEY = "budget.v1";

// Registry of all accounts on this device, plus the id of whichever
// one is currently active. Plain JSON — usernames and password hashes
// (PBKDF2) are not secrets in the cryptographic sense.
export const USERS_KEY = "budget.users.v1";

// Per-user data bytes live under their own key so a delete leaves
// other users untouched and a future "switch account" stays a pure
// pointer flip. The key value retains the "budget.user." prefix for
// backwards compatibility with installs created before the type was
// renamed from Budget to UserData.
export function userDataKey(userId: string): string {
  return `budget.user.${userId}`;
}

// PBKDF2 parameters for the login password hash. Matches the data
// encryption module's iterations so an attacker sees no cheaper
// attack path; the salt is per-user, the iteration count is
// persisted on each user so a future bump can coexist with old
// records.
export const PASSWORD_HASH_ITERATIONS = 600_000;
export const PASSWORD_HASH_BITS = 256;
export const PASSWORD_SALT_BYTES = 16;

// Defaults are Sweden-leaning: salary on the 25th drives the fiscal
// month, "kr" is SEK, and the number format is the Swedish convention
// (space as thousands separator, comma as decimal).
export const DEFAULT_SETTINGS: Settings = {
  startOfMonth: 25,
  dateFormat: "YYYY-MM-DD",
  shortDateFormat: "DD/MM",
  currency: "kr",
  decimalSeparator: ",",
  thousandsSeparator: " ",
  formatNumbers: true,
  showCurrency: true,
  showDecimals: false,
};

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

// Horizon used when a recurring entry has no explicit end date. Twelve
// months is enough to populate the next year's planning view without
// flooding storage; users can re-run the modal to extend further.
export const DEFAULT_RECURRENCE_MONTHS = 12;

// Display order for the category icon picker. Kept in sync with the
// `CategoryIcon` union in `types.ts` and the validator's allowlist —
// adding an icon means touching all three.
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
] as const;
