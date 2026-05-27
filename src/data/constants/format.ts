import type { DateFormat, ShortDateFormat } from "../types";

// Maximum visual width of a column before its content wraps. Used to cap
// auto-sizing in the CSS via a custom property. Will become a per-sheet
// setting once the UI exists for it.
export const MAX_COLUMN_CHARS = 60;

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
