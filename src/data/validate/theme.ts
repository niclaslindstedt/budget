import {
  COLOR_KEYS,
  DEFAULT_CUSTOM_THEME,
  DEFAULT_CUSTOM_THEME_COLORS_DARK,
} from "../constants";
import type {
  BorderWidthPreset,
  CustomTheme,
  CustomThemeColors,
  DensityPreset,
  RadiusPreset,
} from "../types";
import {
  BORDER_WIDTH_SET,
  DENSITY_SET,
  RADIUS_SET,
  isHexColor,
  isObject,
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
  const radius: RadiusPreset =
    typeof raw.radius === "string" && RADIUS_SET.has(raw.radius as RadiusPreset)
      ? (raw.radius as RadiusPreset)
      : DEFAULT_CUSTOM_THEME.radius;
  const density: DensityPreset =
    typeof raw.density === "string" &&
    DENSITY_SET.has(raw.density as DensityPreset)
      ? (raw.density as DensityPreset)
      : DEFAULT_CUSTOM_THEME.density;
  const borderWidth: BorderWidthPreset =
    typeof raw.borderWidth === "string" &&
    BORDER_WIDTH_SET.has(raw.borderWidth as BorderWidthPreset)
      ? (raw.borderWidth as BorderWidthPreset)
      : DEFAULT_CUSTOM_THEME.borderWidth;
  const reduceMotion =
    typeof raw.reduceMotion === "boolean"
      ? raw.reduceMotion
      : DEFAULT_CUSTOM_THEME.reduceMotion;
  return {
    colors: validateCustomThemeColors(raw.colors),
    radius,
    density,
    borderWidth,
    reduceMotion,
  };
}
