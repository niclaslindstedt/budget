// Helpers that translate between the app's two-letter language code
// (the persisted `Settings.language` field) and the BCP-47 tag the
// Intl APIs expect. Kept tiny and standalone so format helpers can
// import it without dragging React or the catalog modules in.

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
