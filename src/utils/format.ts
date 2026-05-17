import type { DateFormat, Settings, ShortDateFormat } from "../data/types";

// Shared formatting + parsing helpers driven by the user's settings.
// `formatAmount` / `formatBalance` handle display (thousands grouping,
// decimal char, optional currency suffix); `normalizeAmountInput` and
// `parseAmountInput` handle the input side — accepting both decimal
// characters and snapping the visible text to the configured one so
// "100,99" and "100.99" agree once the user picks a separator.

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Round to two decimals before formatting so floating-point drift
// doesn't print a 12-digit tail in the running balance.
function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

function groupThousands(intPart: string, sep: string): string {
  if (sep === "") return intPart;
  const sign = intPart.startsWith("-") ? "-" : "";
  const digits = sign ? intPart.slice(1) : intPart;
  if (digits.length <= 3) return intPart;
  const out: string[] = [];
  for (let i = digits.length; i > 0; i -= 3) {
    out.unshift(digits.slice(Math.max(0, i - 3), i));
  }
  return sign + out.join(sep);
}

export type FormatNumberOpts = {
  // Force at least two fraction digits — used for balances so the
  // running total reads as money even when the cents are zero. Amount
  // cells leave this off so whole-number entries don't grow trailing
  // ".00" the moment they leave focus.
  alwaysTwoFractionDigits?: boolean;
};

export function formatNumber(
  n: number,
  settings: Settings,
  opts: FormatNumberOpts = {},
): string {
  // `showDecimals` off wins over `alwaysTwoFractionDigits` — the user has
  // asked to hide the fractional portion everywhere, so balances drop
  // their cents too.
  if (!settings.showDecimals) {
    const intRounded = String(Math.round(n));
    return settings.formatNumbers
      ? groupThousands(intRounded, settings.thousandsSeparator)
      : intRounded;
  }
  const rounded = roundTo2(n);
  const fixed = opts.alwaysTwoFractionDigits
    ? rounded.toFixed(2)
    : String(rounded);
  const [intPartRaw, fracPartRaw = ""] = fixed.split(".");
  const intPart = settings.formatNumbers
    ? groupThousands(intPartRaw, settings.thousandsSeparator)
    : intPartRaw;
  if (fracPartRaw === "") return intPart;
  return `${intPart}${settings.decimalSeparator}${fracPartRaw}`;
}

// Wraps a pre-formatted numeric body with the user's currency symbol,
// honouring position + spacing. Returns the body unchanged when
// `showCurrency` is off so the same call site covers both states.
export function withCurrency(body: string, settings: Settings): string {
  if (!settings.showCurrency) return body;
  const sep = settings.currencySpace ? " " : "";
  return settings.currencyPosition === "before"
    ? `${settings.currency}${sep}${body}`
    : `${body}${sep}${settings.currency}`;
}

export function formatAmount(n: number, settings: Settings): string {
  return withCurrency(formatNumber(n, settings), settings);
}

export function formatBalance(n: number, settings: Settings): string {
  return withCurrency(
    formatNumber(n, settings, { alwaysTwoFractionDigits: true }),
    settings,
  );
}

// Strip the thousands separator from input and snap whichever decimal
// character the user typed to the one the settings configure. Returns
// the cleaned text; callers can then `Number()` it.
export function normalizeAmountInput(text: string, settings: Settings): string {
  let out = text;
  // Strip the configured thousands separator everywhere it appears so
  // pasted "1 234,56" or "1,234.56" parses straight through.
  if (settings.thousandsSeparator !== "") {
    out = out.split(settings.thousandsSeparator).join("");
  }
  // Whichever decimal char the user typed wins — replace the alternate
  // with the configured one so the display agrees with settings even
  // mid-entry.
  const altDecimal = settings.decimalSeparator === "." ? "," : ".";
  out = out.split(altDecimal).join(settings.decimalSeparator);
  return out;
}

// Parse an amount input into a JS number. Accepts either decimal char
// (so legacy data and freshly-typed values both work) and tolerates a
// trailing separator while the user is still typing.
export function parseAmount(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed === "-") return null;
  // Strip every kind of thousands separator (spaces, dots, commas) by
  // working on a normalised copy that uses "." as decimal. The decimal
  // is whatever the *last* "." or "," is — that matches how users
  // typically read mixed input.
  const lastDot = trimmed.lastIndexOf(".");
  const lastComma = trimmed.lastIndexOf(",");
  const lastDecimalIdx = Math.max(lastDot, lastComma);
  let cleaned: string;
  if (lastDecimalIdx === -1) {
    cleaned = trimmed.replace(/[ .,]/g, "");
  } else {
    const head = trimmed.slice(0, lastDecimalIdx).replace(/[ .,]/g, "");
    const tail = trimmed.slice(lastDecimalIdx + 1).replace(/[ .,]/g, "");
    cleaned = `${head}.${tail}`;
  }
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatAmountForInput(n: number, settings: Settings): string {
  // Used to seed an input field from a stored number. Use the configured
  // decimal char, no thousands grouping while editing (grouping during
  // typing fights cursor placement).
  const rounded = roundTo2(n);
  const fixed = String(rounded);
  const [intPart, fracPart] = fixed.split(".");
  if (fracPart === undefined) return intPart;
  return `${intPart}${settings.decimalSeparator}${fracPart}`;
}

// Date formatting from ISO `YYYY-MM-DD`. Empty / malformed input
// returns "" so callers can substitute a placeholder.
export function formatDate(iso: string, format: DateFormat): string {
  if (typeof iso !== "string" || iso.length < 10) return "";
  const y = iso.slice(0, 4);
  const m = iso.slice(5, 7);
  const d = iso.slice(8, 10);
  const monthNum = Number(m);
  const dayNum = Number(d);
  if (!Number.isFinite(monthNum) || !Number.isFinite(dayNum)) return "";
  switch (format) {
    case "YYYY-MM-DD":
      return `${y}-${m}-${d}`;
    case "DD/MM/YYYY":
      return `${d}/${m}/${y}`;
    case "MM/DD/YYYY":
      return `${m}/${d}/${y}`;
    case "DD.MM.YYYY":
      return `${d}.${m}.${y}`;
    case "D MMM YYYY":
      return `${dayNum} ${MONTH_SHORT[monthNum - 1]} ${y}`;
  }
}

// Day-only rendering for the mobile cell — month is conveyed by the
// per-month colour applied to the cell text, so the digits stay
// compact enough to share a row with description + amount + balance.
export function formatDayOnly(iso: string): string {
  if (typeof iso !== "string" || iso.length < 10) return "";
  const dayNum = Number(iso.slice(8, 10));
  if (!Number.isFinite(dayNum)) return "";
  return String(dayNum);
}

// Short date for in-row cells: day and month only, no year, with
// leading zeros stripped. Configured independently of `dateFormat`
// so users can read sheet cells as "16/5" while keeping a long-form
// like "YYYY-MM-DD" elsewhere.
export function formatShortDate(iso: string, format: ShortDateFormat): string {
  if (typeof iso !== "string" || iso.length < 10) return "";
  const monthNum = Number(iso.slice(5, 7));
  const dayNum = Number(iso.slice(8, 10));
  if (!Number.isFinite(monthNum) || !Number.isFinite(dayNum)) return "";
  switch (format) {
    case "DD/MM":
      return `${dayNum}/${monthNum}`;
    case "MM/DD":
      return `${monthNum}/${dayNum}`;
    case "DD.MM":
      return `${dayNum}.${monthNum}`;
    case "MM-DD":
      return `${monthNum}-${dayNum}`;
    case "D MMM":
      return `${dayNum} ${MONTH_SHORT[monthNum - 1]}`;
  }
}
