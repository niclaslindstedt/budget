import type { DateFormat, Settings, ThousandsSeparator } from "./types";

// Maximum visual width of a column before its content wraps. Used to cap
// auto-sizing in the CSS via a custom property. Will become a per-sheet
// setting once the UI exists for it.
export const MAX_COLUMN_CHARS = 60;

export const STORAGE_KEY = "budget.v1";

// Defaults are Sweden-leaning: salary on the 25th drives the fiscal
// month, "kr" is SEK, and the number format is the Swedish convention
// (space as thousands separator, comma as decimal).
export const DEFAULT_SETTINGS: Settings = {
  startOfMonth: 25,
  dateFormat: "YYYY-MM-DD",
  currency: "kr",
  decimalSeparator: ",",
  thousandsSeparator: " ",
  formatNumbers: true,
  showCurrency: true,
};

// Allowed date formats, in the order the settings UI lists them.
export const DATE_FORMATS: readonly DateFormat[] = [
  "YYYY-MM-DD",
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "DD.MM.YYYY",
  "D MMM YYYY",
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
