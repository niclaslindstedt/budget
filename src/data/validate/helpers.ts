import { CATEGORY_ICON_NAMES } from "../constants/taxonomy";
import { DATE_FORMATS, SHORT_DATE_FORMATS } from "../constants/format";
import { RECEIPT_NAME_PATTERNS } from "../items/receipt-name";
import {
  BORDER_WIDTH_PRESETS,
  DENSITY_PRESETS,
  FONT_FAMILIES,
  RADIUS_PRESETS,
  TABLE_SPACING_PRESETS,
  THEMES,
} from "../themes";
import type {
  BorderWidthPreset,
  CategoryIcon,
  CellValue,
  DateFormat,
  DecimalSeparator,
  DensityPreset,
  FontFamilyId,
  PropertySizeUnit,
  RadiusPreset,
  ReceiptNamePattern,
  ShortDateFormat,
  TableSpacingPreset,
  TaxLocation,
  ThemePreset,
  ThousandsSeparator,
} from "../types";

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const DATE_FORMAT_SET: ReadonlySet<DateFormat> = new Set(DATE_FORMATS);
export const SHORT_DATE_FORMAT_SET: ReadonlySet<ShortDateFormat> = new Set(
  SHORT_DATE_FORMATS,
);
export const DECIMAL_SEPARATORS: ReadonlySet<DecimalSeparator> =
  new Set<DecimalSeparator>([".", ","]);
export const THOUSANDS_SEPARATORS: ReadonlySet<ThousandsSeparator> =
  new Set<ThousandsSeparator>([" ", ".", ",", ""]);

export const THEME_SET: ReadonlySet<ThemePreset> = new Set(THEMES);
export const FONT_FAMILY_SET: ReadonlySet<FontFamilyId> = new Set(
  FONT_FAMILIES.map((f) => f.id),
);
export const RECEIPT_NAME_PATTERN_SET: ReadonlySet<ReceiptNamePattern> =
  new Set(RECEIPT_NAME_PATTERNS);
export const PROPERTY_SIZE_UNIT_SET: ReadonlySet<PropertySizeUnit> =
  new Set<PropertySizeUnit>(["kvm", "sqm"]);
export const LOCATION_SET: ReadonlySet<TaxLocation> = new Set<TaxLocation>([
  "SE",
]);
export const RADIUS_SET: ReadonlySet<RadiusPreset> = new Set(RADIUS_PRESETS);
export const DENSITY_SET: ReadonlySet<DensityPreset> = new Set(DENSITY_PRESETS);
export const TABLE_SPACING_SET: ReadonlySet<TableSpacingPreset> = new Set(
  TABLE_SPACING_PRESETS,
);
export const BORDER_WIDTH_SET: ReadonlySet<BorderWidthPreset> = new Set(
  BORDER_WIDTH_PRESETS,
);

// Derived from the canonical CATEGORY_ICON_NAMES so a glyph added to
// the picker grids (TYPE_GLYPH_NAMES, etc.) never falls out of the
// validator's accepted set. A drift here previously caused a parse
// failure on reload, which the surrounding fallback silently
// converted into a fresh-budget overwrite of cloud data.
export const CATEGORY_ICONS: ReadonlySet<CategoryIcon> = new Set<CategoryIcon>(
  CATEGORY_ICON_NAMES,
);

// Strict CSS hex matcher — `#rgb`, `#rrggbb`, `#rrggbbaa`. Named
// colours, `rgb()`, and `color()` are intentionally rejected: the
// custom-theme picker emits hex, so any value outside the regex is a
// signal of a hand-edited file gone wrong rather than a feature.
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX_COLOR_RE.test(v);
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isCellValue(v: unknown): v is CellValue {
  return (
    v === null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
}

export function fail(path: string, msg: string): Result<never> {
  return { ok: false, error: `${path}: ${msg}` };
}

// Soft-recovering string-enum validator. Collapses the recurring
// `typeof raw.x === "string" && SET.has(raw.x as T) ? raw.x : default`
// triple-check at every persisted-shape boundary. The fallback keeps
// reload paths working when an export carries a value the running
// build doesn't recognise (older release ↔ newer release, hand edit,
// future preset) — a previously-validated bucket reloads instead of
// silently overwriting cloud data with a fresh budget.
export function validateEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  fallback: T,
): T {
  if (typeof value === "string" && allowed.has(value as T)) {
    return value as T;
  }
  return fallback;
}

export function sanitizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string" || v === "") continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function validateBoolRecord(raw: unknown): Record<string, boolean> {
  if (!isObject(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}
