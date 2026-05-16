// Maximum visual width of a column before its content wraps. Used to cap
// auto-sizing in the CSS via a custom property. Will become a per-sheet
// setting once the UI exists for it.
export const MAX_COLUMN_CHARS = 60;

export const STORAGE_KEY = "budget.v1";

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
