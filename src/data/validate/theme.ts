import {
  COLOR_KEYS,
  DEFAULT_CUSTOM_THEME,
  DEFAULT_CUSTOM_THEME_COLORS_DARK,
} from "../themes";
import type { CustomTheme, CustomThemeColors } from "../types";
import {
  BORDER_WIDTH_SET,
  DENSITY_SET,
  RADIUS_SET,
  TABLE_SPACING_SET,
  isHexColor,
  isObject,
  validateEnum,
} from "./helpers";

// Soft-recovering custom-theme colour validator. Each slot falls back
// to the Dark default when missing or malformed so a single bad hex
// in an export can't trap the user out of the file — custom themes
// are cosmetic.
export function validateCustomThemeColors(raw: unknown): CustomThemeColors {
  const out: CustomThemeColors = { ...DEFAULT_CUSTOM_THEME_COLORS_DARK };
  if (!isObject(raw)) return out;
  for (const k of COLOR_KEYS) {
    const v = raw[k];
    if (isHexColor(v)) out[k] = v;
  }
  return out;
}

export function validateCustomTheme(raw: unknown): CustomTheme {
  if (!isObject(raw)) return { ...DEFAULT_CUSTOM_THEME };
  const radius = validateEnum(
    raw.radius,
    RADIUS_SET,
    DEFAULT_CUSTOM_THEME.radius,
  );
  const density = validateEnum(
    raw.density,
    DENSITY_SET,
    DEFAULT_CUSTOM_THEME.density,
  );
  const tableSpacing = validateEnum(
    raw.tableSpacing,
    TABLE_SPACING_SET,
    DEFAULT_CUSTOM_THEME.tableSpacing,
  );
  const borderWidth = validateEnum(
    raw.borderWidth,
    BORDER_WIDTH_SET,
    DEFAULT_CUSTOM_THEME.borderWidth,
  );
  const reduceMotion =
    typeof raw.reduceMotion === "boolean"
      ? raw.reduceMotion
      : DEFAULT_CUSTOM_THEME.reduceMotion;
  return {
    colors: validateCustomThemeColors(raw.colors),
    radius,
    density,
    tableSpacing,
    borderWidth,
    reduceMotion,
  };
}
