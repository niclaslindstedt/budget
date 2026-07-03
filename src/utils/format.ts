import type { DateFormat, Settings, ShortDateFormat } from "../data/types";
import { bcp47, type Lang } from "../i18n/locale";

// Shared formatting + parsing helpers driven by the user's settings.
// `formatAmount` / `formatBalance` handle display (thousands grouping,
// decimal char, optional currency suffix); `normalizeAmountInput` and
// `parseAmountInput` handle the input side — accepting both decimal
// characters and snapping the visible text to the configured one so
// "100,99" and "100.99" agree once the user picks a separator.

// Per-language short month names. The "D MMM" / "D MMM YYYY" formats
// pull from here so the rendered month follows the language picker
// rather than the browser's default locale. Lowercase Swedish forms
// match the Språkrådet convention.
const MONTH_SHORT_BY_LANG: Record<Lang, readonly string[]> = {
  en: [
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
  ],
  sv: [
    "jan",
    "feb",
    "mar",
    "apr",
    "maj",
    "jun",
    "jul",
    "aug",
    "sep",
    "okt",
    "nov",
    "dec",
  ],
};

function monthShort(lang: Lang | undefined, monthNum: number): string {
  const arr = MONTH_SHORT_BY_LANG[lang ?? "en"];
  return arr[monthNum - 1] ?? "";
}

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
  // Bypass the `ABBREVIATE_THRESHOLD` so even small values render as
  // "0K" / "8K" when `abbreviateNumbers` is on. Set by the running-
  // balance column on the main sheet so the column reads as a uniform
  // stack of compact figures; amount cells leave this off so a small
  // amount keeps its precision.
  alwaysAbbreviate?: boolean;
  // Suppress abbreviation regardless of the `abbreviateNumbers` setting,
  // so the exact figure always shows. Set by surfaces where the precise
  // amount matters and there's room for it — the item-finder candidate
  // list and the line-items allocation modal, where a "-13K" stand-in
  // would hide which transaction the user is reconciling.
  neverAbbreviate?: boolean;
  // Force abbreviation regardless of the `abbreviateNumbers` setting and
  // the `ABBREVIATE_THRESHOLD`, so the value always renders compact
  // ("99K"). Set by space-constrained pills where the exact figure would
  // overflow and the magnitude is what matters — the property card's
  // per-area value pill ("99K/kvm") and the property value chart's Y axis
  // on mobile. `neverAbbreviate` still wins.
  forceAbbreviate?: boolean;
};

// Threshold at which `abbreviateNumbers` kicks in. Below this the
// regular formatter runs, so small amounts keep their precision and
// the K-suffix isn't applied to "9000" → "9K" (which would round in a
// way users find surprising).
const ABBREVIATE_THRESHOLD = 10_000;

function abbreviateValue(n: number, settings: Settings): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  // Round to thousands first so we can detect the K → M boundary by
  // value rather than by raw magnitude — 999 500 rounds up to 1000K,
  // which reads better as "1M".
  const roundedK = Math.round(abs / 1_000);
  if (abs >= 1_000_000 || roundedK >= 1_000) {
    const m = abs / 1_000_000;
    // Single-digit millions keep one fractional digit when decimals
    // are enabled, so "1.2M" survives. Larger values drop to integer
    // because "12.3M" rarely tells the user more than "12M".
    if (!settings.showDecimals || m >= 10) {
      return `${sign}${Math.round(m)}M`;
    }
    const oneDec = Math.round(m * 10) / 10;
    const [intPart, fracPart] = oneDec.toFixed(1).split(".");
    return fracPart === "0"
      ? `${sign}${intPart}M`
      : `${sign}${intPart}${settings.decimalSeparator}${fracPart}M`;
  }
  return `${sign}${roundedK}K`;
}

export function formatNumber(
  n: number,
  settings: Settings,
  opts: FormatNumberOpts = {},
): string {
  // Abbreviation wins over the standard grouping/decimal pipeline —
  // the user opted into a compact form, and threading thousands
  // separators or trailing zeros through "12K" makes no sense. The
  // `alwaysAbbreviate` opt bypasses the threshold so the balance
  // column can keep every row compact when its dedicated setting is on;
  // `forceAbbreviate` bypasses the `abbreviateNumbers` setting entirely
  // for surfaces too narrow to fit the grouped figure.
  if (
    !opts.neverAbbreviate &&
    (opts.forceAbbreviate ||
      (settings.abbreviateNumbers &&
        (opts.alwaysAbbreviate || Math.abs(n) >= ABBREVIATE_THRESHOLD)))
  ) {
    return abbreviateValue(n, settings);
  }
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

// Short label for the user's chosen car-distance unit — "km" or "mi".
// The stored odometer numbers are never converted; the unit is a display
// label only (see `Settings.distanceUnit`).
export function distanceUnitLabel(settings: Settings): string {
  return settings.distanceUnit === "mi" ? "mi" : "km";
}

// A car range / distance figure with its unit suffix, e.g. "42 000 km".
// Grouping and abbreviation follow the same `formatNumber` opts every
// other figure uses.
export function formatDistance(
  n: number,
  settings: Settings,
  opts: FormatNumberOpts = {},
): string {
  return `${formatNumber(n, settings, opts)} ${distanceUnitLabel(settings)}`;
}

// An annual interest rate, always rendered with two fractional digits so
// "2.00%" never collapses to a bare "2%". Unlike `formatNumber` this
// deliberately ignores `showDecimals` and `abbreviateNumbers`: those
// govern money, where hiding the öre is a tidiness choice, but a rate
// stripped of its decimals is a different number, not a tidier one. The
// percent sign is the caller's to append. Honours the user's decimal and
// thousands separators.
export function formatRate(n: number, settings: Settings): string {
  const [intPartRaw, fracPart] = roundTo2(n).toFixed(2).split(".");
  const intPart = settings.formatNumbers
    ? groupThousands(intPartRaw, settings.thousandsSeparator)
    : intPartRaw;
  return `${intPart}${settings.decimalSeparator}${fracPart}`;
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

export function formatAmount(
  n: number,
  settings: Settings,
  opts: FormatNumberOpts = {},
): string {
  return withCurrency(formatNumber(n, settings, opts), settings);
}

// Widest `formatNumber + withCurrency` length across `values`, computed
// with at most three `formatNumber` calls instead of one per value.
//
// `formatNumber`'s output length is monotonic in `|v|` within each
// branch of its own internal switch — the non-abbreviated path grows
// in lockstep with magnitude, and the abbreviation path stays
// monotonic inside each "K" / "M" tier (the K → M boundary at 1_000_000
// is where length can shrink, so we keep the two tiers as separate
// buckets). Bucketing every value into {below-threshold, K-tier,
// M-tier} and then formatting only each bucket's max-abs is enough to
// find the widest string — and the savings dominate for the column-
// width pass `BudgetPage` runs on every render, where N can reach the
// thousands.
export function widestFormattedAmount(
  values: Iterable<number>,
  settings: Settings,
  opts: FormatNumberOpts = {},
): number {
  let maxBelowThreshold = -Infinity;
  let maxKTier = -Infinity;
  let maxMTier = -Infinity;
  for (const v of values) {
    const abs = Math.abs(v);
    if (!Number.isFinite(abs)) continue;
    if (abs >= 1_000_000) {
      if (abs > maxMTier) maxMTier = abs;
    } else if (abs >= ABBREVIATE_THRESHOLD) {
      if (abs > maxKTier) maxKTier = abs;
    } else if (abs > maxBelowThreshold) {
      maxBelowThreshold = abs;
    }
  }
  let widest = 0;
  const consider = (candidate: number) => {
    if (candidate === -Infinity) return;
    const length = withCurrency(
      formatNumber(candidate, settings, opts),
      settings,
    ).length;
    if (length > widest) widest = length;
  };
  consider(maxBelowThreshold);
  consider(maxKTier);
  consider(maxMTier);
  return widest;
}

// Plain integer with the user's thousands separator. Used for counts
// (history entries, transaction tallies) so they group consistently
// with the balance column instead of falling back to the browser's
// locale via `toLocaleString()`.
export function formatCount(n: number, settings: Settings): string {
  const s = String(Math.trunc(n));
  return settings.formatNumbers
    ? groupThousands(s, settings.thousandsSeparator)
    : s;
}

export function formatBalance(
  n: number,
  settings: Settings,
  opts: FormatNumberOpts = {},
): string {
  return withCurrency(
    formatNumber(n, settings, { alwaysTwoFractionDigits: true, ...opts }),
    settings,
  );
}

// Variant for the running-balance column on the main sheet view, which
// honours `alwaysAbbreviateBalance` so the column reads uniformly when
// the user opted into compact rendering. Other "balance"-like surfaces
// (account snapshots, history) keep using `formatBalance` so their
// values stay precise unless they crossed the abbreviate threshold.
export function formatRunningBalance(n: number, settings: Settings): string {
  return withCurrency(
    formatNumber(n, settings, {
      alwaysTwoFractionDigits: true,
      alwaysAbbreviate: settings.alwaysAbbreviateBalance,
    }),
    settings,
  );
}

// Remove every character that isn't a digit, a decimal / thousands
// separator ("." or ","), or a leading minus sign. Pasted currency
// symbols, unit suffixes, and stray letters ("1 234,56 kr", "$100",
// "abc") drop away so only parseable numeric text survives. A minus is
// kept only in the leading position — the sign of the number — so an
// interior stray "-" is discarded rather than corrupting the value.
export function stripNonNumeric(text: string): string {
  const negative = text.trimStart().startsWith("-");
  const digits = text.replace(/[^0-9.,]/g, "");
  return negative ? `-${digits}` : digits;
}

// Strip non-numeric characters from input, drop the configured thousands
// separator, and snap whichever decimal character the user typed to the
// one the settings configure. Returns the cleaned text; callers can then
// `Number()` it.
export function normalizeAmountInput(text: string, settings: Settings): string {
  // Keep only digits, separators, and a leading sign — everything else a
  // paste or fat-finger introduces (currency symbols, letters, spaces) is
  // dropped as the user types.
  let out = stripNonNumeric(text);
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
  // Drop any non-numeric noise first (currency symbols, letters, stray
  // spaces) so a field that stores raw text and only parses on commit is
  // just as forgiving of a pasted "1 234,56 kr" as the amount cells that
  // normalise on every keystroke.
  const trimmed = stripNonNumeric(text);
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
// returns "" so callers can substitute a placeholder. `lang` only
// matters for the `"D MMM YYYY"` format that contains a month name;
// the numeric formats render identically in every language.
export function formatDate(
  iso: string,
  format: DateFormat,
  lang?: Lang,
): string {
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
      return `${dayNum} ${monthShort(lang, monthNum)} ${y}`;
  }
}

// Month-key (`YYYY-MM`) rendered as "MMMM YYYY" via `Intl.DateTimeFormat`
// in the active language — the long-form header used by every page that
// groups rows or history entries by month (BudgetMonthTable, BudgetViewerModal,
// BudgetMetadataModal, BudgetMoveCopyModal, HistoryModal, AccountsPage).
// Returns the input unchanged for non-parsable keys so callers can drop
// the result in unconditionally.
const yearMonthFormatCache = new Map<Lang, Intl.DateTimeFormat>();
export function formatYearMonth(monthKey: string, lang: Lang): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  let fmt = yearMonthFormatCache.get(lang);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(bcp47(lang), {
      month: "long",
      year: "numeric",
    });
    yearMonthFormatCache.set(lang, fmt);
  }
  return fmt.format(new Date(y, m - 1, 1));
}

// Month-group key as a header label: the synthetic `"undated"` bucket
// renders the caller-supplied label (already resolved through `t()`),
// every real `YYYY-MM` key falls through to `formatYearMonth`. Shared
// by the live budget table and the read-only viewer.
export function formatMonthKey(
  key: string,
  lang: Lang,
  undatedLabel: string,
): string {
  if (key === "undated") return undatedLabel;
  return formatYearMonth(key, lang);
}

// Month-key (`YYYY-MM`) rendered as "MMM YYYY" in the active language
// — used as the header for orphan groups in the reconciliation modal.
export function formatMonthLabel(monthKey: string, lang?: Lang): string {
  if (typeof monthKey !== "string" || monthKey.length < 7) return "";
  const y = monthKey.slice(0, 4);
  const monthNum = Number(monthKey.slice(5, 7));
  if (!Number.isFinite(monthNum)) return "";
  return `${monthShort(lang, monthNum)} ${y}`;
}

// ISO date (`YYYY-MM-DD`, or any string whose first seven chars are
// `YYYY-MM`) rendered as "MMM YY" ("May 25"), language-aware. The
// compact x-axis tick for charts that span months — keeps the label
// from overflowing while still disambiguating the year.
export function formatMonthYearShort(iso: string, lang?: Lang): string {
  if (typeof iso !== "string" || iso.length < 7) return "";
  const monthNum = Number(iso.slice(5, 7));
  if (!Number.isFinite(monthNum)) return "";
  const yy = iso.slice(2, 4);
  return `${monthShort(lang, monthNum)} ${yy}`;
}

// Month-key (`YYYY-MM`) rendered as the short month name alone, no
// year — for tables already grouped under a year header (the salary
// year table's month column), where repeating the year on every row
// is redundant. Language-aware, mirroring `formatMonthLabel`.
export function formatMonthName(monthKey: string, lang?: Lang): string {
  if (typeof monthKey !== "string" || monthKey.length < 7) return "";
  const monthNum = Number(monthKey.slice(5, 7));
  if (!Number.isFinite(monthNum)) return "";
  return monthShort(lang, monthNum);
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
// like "YYYY-MM-DD" elsewhere. `lang` only matters for the `"D MMM"`
// format that contains a month name.
export function formatShortDate(
  iso: string,
  format: ShortDateFormat,
  lang?: Lang,
): string {
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
      return `${dayNum} ${monthShort(lang, monthNum)}`;
  }
}
