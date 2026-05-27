// Allowed UI languages, in the order the picker shows them. Used by
// the validator, the schema, and the LanguagePicker so all three
// agree on which codes are valid.
export const SUPPORTED_LANGUAGES = ["en", "sv"] as const;

// Predefined currency presets shown in the Settings → Format picker.
// Each entry fills the three free-form fields (`currency`,
// `currencyPosition`, `currencySpace`) in one go. The picker also
// exposes a "Custom…" entry that reveals the original inputs for any
// currency not represented here. Ordered by region (Nordic, European,
// North American) — the SelectPicker has no group support so order is
// the only grouping cue.
//
// Currencies that render identically (same symbol, position, and
// spacing) are collapsed into a single preset whose label joins the
// ISO codes with "/" — e.g. SEK/NOK/DKK/ISK all print as "kr" after
// the amount, so picking any one would produce the same output. The
// merged form keeps the picker short and avoids the misleading
// impression that the choice affects exchange rates (it doesn't —
// this app stores raw numbers, not currency-typed amounts).
//
// `nameKey` is a dotted i18n path looked up at render time; the
// constants module deliberately doesn't import the i18n catalog so
// startup stays cheap.
export type CurrencyPreset = {
  id: string;
  // ISO codes the preset covers, joined with "/" for the picker label.
  // Single-code entries (EUR, GBP, CHF) still use a one-element array
  // so the picker code can treat every preset uniformly.
  codes: readonly string[];
  symbol: string;
  position: "before" | "after";
  space: boolean;
  nameKey: string;
};

export const CURRENCY_PRESETS: readonly CurrencyPreset[] = [
  // Nordic kronor — all four render as "kr" after the amount.
  {
    id: "nordic-kr",
    codes: ["SEK", "NOK", "DKK", "ISK"],
    symbol: "kr",
    position: "after",
    space: true,
    nameKey: "settings.format.currencyName.nordicKr",
  },
  // European
  {
    id: "EUR",
    codes: ["EUR"],
    symbol: "€",
    position: "before",
    space: false,
    nameKey: "settings.format.currencyName.EUR",
  },
  {
    id: "GBP",
    codes: ["GBP"],
    symbol: "£",
    position: "before",
    space: false,
    nameKey: "settings.format.currencyName.GBP",
  },
  {
    id: "CHF",
    codes: ["CHF"],
    symbol: "CHF",
    position: "before",
    space: true,
    nameKey: "settings.format.currencyName.CHF",
  },
  // North American dollars — both render as "$" before the amount.
  {
    id: "dollar",
    codes: ["USD", "CAD"],
    symbol: "$",
    position: "before",
    space: false,
    nameKey: "settings.format.currencyName.dollar",
  },
];

// Browser-region → preset id. Consulted only by `detectInitialCurrency`
// on fresh install — existing users are not retroactively re-detected,
// mirroring the language-detection contract.
export const REGION_TO_CURRENCY_ID: Readonly<Record<string, string>> = {
  SE: "nordic-kr",
  NO: "nordic-kr",
  DK: "nordic-kr",
  IS: "nordic-kr",
  // Eurozone members covered by the EUR preset.
  AT: "EUR",
  BE: "EUR",
  CY: "EUR",
  DE: "EUR",
  EE: "EUR",
  ES: "EUR",
  FI: "EUR",
  FR: "EUR",
  GR: "EUR",
  IE: "EUR",
  IT: "EUR",
  LT: "EUR",
  LU: "EUR",
  LV: "EUR",
  MT: "EUR",
  NL: "EUR",
  PT: "EUR",
  SI: "EUR",
  SK: "EUR",
  GB: "GBP",
  CH: "CHF",
  LI: "CHF",
  US: "dollar",
  CA: "dollar",
};
