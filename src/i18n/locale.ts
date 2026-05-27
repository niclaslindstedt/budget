// Helpers that translate between the app's two-letter language code
// (the persisted `Settings.language` field) and the BCP-47 tag the
// Intl APIs expect. Kept tiny and standalone so format helpers can
// import it without dragging React or the catalog modules in.

import {
  CURRENCY_PRESETS,
  REGION_TO_CURRENCY_ID,
} from "../data/constants/currency";
import type { Settings } from "../data/types";

export type Lang = "en" | "sv";

export const SUPPORTED_LANGS: readonly Lang[] = ["en", "sv"];

// Map "en" → "en-GB" and "sv" → "sv-SE" so date / month formatters
// pick a concrete locale rather than guessing from the browser.
// en-GB gives sensible day-first defaults that match the rest of the
// app's Sweden-leaning conventions; the actual date format is still
// driven by Settings.dateFormat, not by the locale.
export function bcp47(lang: Lang): string {
  return lang === "sv" ? "sv-SE" : "en-GB";
}

// Only consulted on a brand-new install (the migration leaves
// existing buckets at "en" so a returning user's UI doesn't suddenly
// flip language). Anything starting with `sv-` → Swedish; everything
// else → English.
export function detectInitialLanguage(): Lang {
  if (typeof navigator === "undefined") return "en";
  const raw = navigator.language ?? "";
  return raw.toLowerCase().startsWith("sv") ? "sv" : "en";
}

export type DetectedCurrency = Pick<
  Settings,
  "currency" | "currencyPosition" | "currencySpace"
>;

// Only consulted on a brand-new install (mirrors `detectInitialLanguage`:
// existing buckets keep whatever they had so a returning user's currency
// doesn't flip on upgrade). Parses the region subtag of
// `navigator.language` — e.g. "sv-SE" → "SE" → nordic-kr, "en-US" →
// "US" → dollar. Falls back to the dollar preset when the region is
// missing or unmapped.
export function detectInitialCurrency(): DetectedCurrency {
  const raw =
    typeof navigator === "undefined" ? "" : (navigator.language ?? "");
  const region = raw.split(/[-_]/)[1]?.toUpperCase() ?? "";
  const id = REGION_TO_CURRENCY_ID[region] ?? "dollar";
  const preset =
    CURRENCY_PRESETS.find((p) => p.id === id) ??
    CURRENCY_PRESETS.find((p) => p.id === "dollar")!;
  return {
    currency: preset.symbol,
    currencyPosition: preset.position,
    currencySpace: preset.space,
  };
}
