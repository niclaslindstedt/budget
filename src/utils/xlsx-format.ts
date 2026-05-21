// Helpers for translating the user's `Settings` into Excel cell-format
// strings, and for converting ISO dates into Excel's serial-number
// representation. Lives apart from `xlsx.ts` to keep that file
// focused on ZIP / XML emission.

import type { DateFormat, Settings } from "../data/types";

// Excel's date epoch is 1899-12-30. The +2 day offset versus a naive
// "days since 1900-01-01" accounts for Excel's well-known 1900-leap-
// year bug — Excel treats 1900-02-29 as a valid date, so picking
// 1899-12-30 as zero makes serials line up correctly for any date from
// 1900-03-01 onward. Dates in January / February 1900 aren't realistic
// for a personal budget so the bug doesn't bite us.
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

// Convert a `YYYY-MM-DD` string into an Excel date serial. Returns
// `null` for empty / malformed input so callers can emit an empty cell.
export function isoToExcelSerial(iso: string): number | null {
  if (typeof iso !== "string" || iso.length < 10) return null;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, m - 1, d);
  if (!Number.isFinite(ms)) return null;
  return Math.floor((ms - EXCEL_EPOCH_UTC) / MS_PER_DAY);
}

// Excel format code for the user's chosen `dateFormat`. "D MMM YYYY"
// falls back to `yyyy-mm-dd` because Excel's `mmm` token renders
// month names in the viewer's system locale, not the file's — so a
// Swedish "maj" would silently become "May" when opened on an
// English machine. Falling back to ISO keeps the export honest.
export function dateFormatCode(format: DateFormat): string {
  switch (format) {
    case "YYYY-MM-DD":
      return "yyyy-mm-dd";
    case "DD/MM/YYYY":
      return "dd/mm/yyyy";
    case "MM/DD/YYYY":
      return "mm/dd/yyyy";
    case "DD.MM.YYYY":
      return "dd.mm.yyyy";
    case "D MMM YYYY":
      return "yyyy-mm-dd";
  }
}

// Escape a literal segment for inclusion inside an Excel format code.
// Excel reserves `0 # ? . , ; @ * _ \ "` and a handful of letters; the
// safest path is to wrap arbitrary user input in double quotes and
// escape inner quotes by doubling them up. The currency symbol is the
// only user-supplied piece this module quotes.
function quoteLiteral(text: string): string {
  return `"${text.replace(/"/g, '""')}"`;
}

// Pick a `[$-locale]` prefix forcing Excel to render specific decimal
// and thousands separators. Without a prefix Excel uses the viewer's
// system locale, which can flip the meaning of `,` and `.` inside the
// format code. The two locales below cover the project's two shipped
// languages; combinations outside these fall through to `null` and
// the format renders in the viewer's locale.
function localePrefix(settings: Settings): string | null {
  const dec = settings.decimalSeparator;
  const thou = settings.thousandsSeparator;
  // English: `,` group, `.` decimal.
  if (dec === "." && (thou === "," || thou === "")) return "[$-409]";
  // Swedish: ` ` (space) group, `,` decimal. Many European locales
  // share these conventions; sv-SE is a fine canonical pick.
  if (dec === "," && (thou === " " || thou === "")) return "[$-41D]";
  // German-ish: `.` group, `,` decimal.
  if (dec === "," && thou === ".") return "[$-407]";
  // Other combinations (e.g. `.` group + `,` decimal — unusual but
  // reachable through the picker) get no prefix.
  return null;
}

// Build the numeric portion of a format code (without currency wrap).
// Honours `formatNumbers` (thousands grouping) and `showDecimals`
// (fractional portion). `alwaysTwoDecimals` overrides `showDecimals=true`
// to force two-digit fractions even when the user hasn't pinned them.
function numericBody(settings: Settings, alwaysTwoDecimals: boolean): string {
  const grouped = settings.formatNumbers;
  const decimals = alwaysTwoDecimals || settings.showDecimals;
  if (grouped && decimals) return "#,##0.00";
  if (grouped && !decimals) return "#,##0";
  if (!grouped && decimals) return "0.00";
  return "0";
}

// Wrap a numeric format code with the user's currency symbol. `before`
// + `currencySpace` reproduces `$ 10.00`; `after` + `currencySpace`
// reproduces `10.00 kr`; `currencySpace=false` collapses the space.
// When the symbol is empty after trimming we skip the wrap entirely
// rather than emit a bare set of quotes.
function wrapCurrency(body: string, settings: Settings): string {
  if (!settings.showCurrency) return body;
  const symbol = settings.currency.trim();
  if (symbol === "") return body;
  const sep = settings.currencySpace ? " " : "";
  const literal = quoteLiteral(symbol);
  return settings.currencyPosition === "before"
    ? `${literal}${sep}${body}`
    : `${body}${sep}${literal}`;
}

// Full Excel format code for the Amount column. Combines locale
// prefix, numeric body, and currency wrap.
export function amountFormatCode(settings: Settings): string {
  const prefix = localePrefix(settings);
  const body = numericBody(settings, false);
  const wrapped = wrapCurrency(body, settings);
  return prefix ? `${prefix}${wrapped}` : wrapped;
}

// Full Excel format code for the Balance column. Same recipe as the
// amount but with a forced two-decimal fraction so a ledger column
// reads uniformly.
export function balanceFormatCode(settings: Settings): string {
  const prefix = localePrefix(settings);
  const body = numericBody(settings, true);
  const wrapped = wrapCurrency(body, settings);
  return prefix ? `${prefix}${wrapped}` : wrapped;
}

// Bundle the three format codes used by the budget export. Convenience
// helper so the call site doesn't have to know the recipe.
export type BudgetExportFormats = {
  date: string;
  amount: string;
  balance: string;
};

export function budgetExportFormats(settings: Settings): BudgetExportFormats {
  return {
    date: dateFormatCode(settings.dateFormat),
    amount: amountFormatCode(settings),
    balance: balanceFormatCode(settings),
  };
}
