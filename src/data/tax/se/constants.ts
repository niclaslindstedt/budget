// Per-year Swedish tax parameters. Everything Sweden-specific is
// confined to this folder — `engine.ts` and `types.ts` never see a
// kronor figure. Each year carries the published prisbasbelopp (pbb),
// inkomstbasbelopp (ibb), the state-tax threshold (skiktgräns, measured
// on taxable income after grundavdrag), and the rates the calculator
// reads.
//
// Sources (Skatteverket "Belopp och procent" + SCB, one page per year):
//   - prisbasbelopp / inkomstbasbelopp: SCB fastställda basbelopp.
//   - skiktgräns: Skatteverket statlig inkomstskatt.
//   - municipal rates: see ./municipalities.ts.
// The grundavdrag and jobbskatteavdrag bracket coefficients are
// expressed in pbb multiples (stable across these years); only pbb
// itself moves them year to year. The kronor figures below are the
// fixed, published anchors per year.

export type SwedishYearConsts = {
  // Prisbasbelopp — scales grundavdrag and jobbskatteavdrag brackets.
  prisbasbelopp: number;
  // Inkomstbasbelopp — caps the pensionsavgift base (8.07 × ibb).
  inkomstbasbelopp: number;
  // State income tax: 20 % on taxable income above this threshold.
  stateTaxRate: number;
  skiktgrans: number;
  // Allmän pensionsavgift: 7 % of income up to the cap, fully credited
  // by a matching skattereduktion (so net effect on take-home ≈ 0).
  pensionFeeRate: number;
  // Default kyrkoavgift (church fee) applied on taxable income when the
  // profile flags church membership. Real parish rates vary ~0.8–1.5 %;
  // this is the editable default.
  churchRateDefault: number;
};

// The span the UI offers and the calculator supports. A paycheck dated
// outside this range is clamped to the nearest end (see `clampTaxYear`).
export const SUPPORTED_TAX_YEARS = [2022, 2023, 2024, 2025, 2026] as const;

export const DEFAULT_TAX_YEAR = 2026;

const STATE_TAX_RATE = 0.2;
const PENSION_FEE_RATE = 0.07;
const CHURCH_RATE_DEFAULT = 0.0103;

// Fixed published anchors per year. pbb / ibb from SCB; skiktgräns from
// Skatteverket (taxable-income basis). 2026 values are final per
// Skatteverket; earlier years are the historical fastställda figures.
export const SWEDISH_YEAR_CONSTS: Record<number, SwedishYearConsts> = {
  2022: {
    prisbasbelopp: 48300,
    inkomstbasbelopp: 71000,
    stateTaxRate: STATE_TAX_RATE,
    skiktgrans: 540700,
    pensionFeeRate: PENSION_FEE_RATE,
    churchRateDefault: CHURCH_RATE_DEFAULT,
  },
  2023: {
    prisbasbelopp: 52500,
    inkomstbasbelopp: 74300,
    stateTaxRate: STATE_TAX_RATE,
    skiktgrans: 598500,
    pensionFeeRate: PENSION_FEE_RATE,
    churchRateDefault: CHURCH_RATE_DEFAULT,
  },
  2024: {
    prisbasbelopp: 57300,
    inkomstbasbelopp: 76200,
    stateTaxRate: STATE_TAX_RATE,
    skiktgrans: 598500,
    pensionFeeRate: PENSION_FEE_RATE,
    churchRateDefault: CHURCH_RATE_DEFAULT,
  },
  2025: {
    prisbasbelopp: 58800,
    inkomstbasbelopp: 80600,
    stateTaxRate: STATE_TAX_RATE,
    skiktgrans: 625800,
    pensionFeeRate: PENSION_FEE_RATE,
    churchRateDefault: CHURCH_RATE_DEFAULT,
  },
  2026: {
    prisbasbelopp: 59200,
    inkomstbasbelopp: 83400,
    stateTaxRate: STATE_TAX_RATE,
    skiktgrans: 643000,
    pensionFeeRate: PENSION_FEE_RATE,
    churchRateDefault: CHURCH_RATE_DEFAULT,
  },
};

// Clamp an arbitrary year to the supported span: a pre-2022 paycheck is
// taxed under the earliest rules we have, a future one under the latest.
export function clampTaxYear(year: number): number {
  const min = SUPPORTED_TAX_YEARS[0];
  const max = SUPPORTED_TAX_YEARS[SUPPORTED_TAX_YEARS.length - 1];
  if (!Number.isFinite(year)) return DEFAULT_TAX_YEAR;
  if (year < min) return min;
  if (year > max) return max;
  return year;
}

// Resolve a year's constants, clamping out-of-range years first.
export function constsForYear(year: number): SwedishYearConsts {
  return SWEDISH_YEAR_CONSTS[clampTaxYear(year)];
}
