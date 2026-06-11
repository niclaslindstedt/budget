// Country-agnostic dispatch + the net → gross inversion every country
// shares. The registry maps a `TaxCountry` to its forward calculator;
// the bisection below turns any monotonic forward calculator into the
// net → gross direction the salary page needs without each country
// hand-rolling an inverse.

import {
  swedishCalculator,
  swedishInvestmentCalculator,
  swedishPropertySaleCalculator,
} from "./se";
import type {
  InvestmentTaxInputs,
  InvestmentTaxResult,
  LocationCalculators,
  PropertySaleInputs,
  PropertySaleResult,
  TaxCalculator,
  TaxCountry,
  TaxLocation,
  TaxParams,
  TaxResult,
} from "./types";

// The single place that knows every country's calculator. A new
// country adds one entry here (and its folder under `src/data/tax/`).
const CALCULATORS: Record<TaxCountry, TaxCalculator> = {
  SE: swedishCalculator,
};

export function getTaxCalculator(country: TaxCountry): TaxCalculator {
  return CALCULATORS[country];
}

// Resolve the calculator for a params bundle by its `country`
// discriminant. Returns null for an unknown country so callers degrade
// to "no estimate" rather than throwing.
export function calculatorForParams(params: TaxParams): TaxCalculator | null {
  return CALCULATORS[params.country] ?? null;
}

// Forward pass — thin pass-through so callers can import one module.
export function netFromGrossMonthly(
  grossMonthly: number,
  params: TaxParams,
  year: number,
): TaxResult {
  return getTaxCalculator(params.country).netFromGrossMonthly(
    grossMonthly,
    params,
    year,
  );
}

// Inverse pass. `net(gross)` is monotonically increasing, so we bisect
// for the gross whose net matches `netMonthly`. The upper bound starts
// at 2× net and doubles until its net exceeds the target (handles any
// marginal rate below 100%). ~60 iterations converges well under 1 öre;
// we cap at 80 and accept the closest bound so a pathological calculator
// can't loop forever. Returns the full `TaxResult` at the solved gross
// so callers get the matching tax breakdown for free.
export function grossFromNetMonthly(
  netMonthly: number,
  params: TaxParams,
  year: number,
): TaxResult {
  const calc = getTaxCalculator(params.country);
  if (netMonthly <= 0) {
    return calc.netFromGrossMonthly(Math.max(0, netMonthly), params, year);
  }

  // Find an upper bracket whose net clears the target.
  let lo = netMonthly; // gross is always ≥ net
  let hi = netMonthly * 2;
  for (let i = 0; i < 40; i++) {
    if (calc.netFromGrossMonthly(hi, params, year).netMonthly >= netMonthly)
      break;
    lo = hi;
    hi *= 2;
  }

  let mid = hi;
  for (let i = 0; i < 80; i++) {
    mid = (lo + hi) / 2;
    const net = calc.netFromGrossMonthly(mid, params, year).netMonthly;
    if (Math.abs(net - netMonthly) < 0.01) break;
    if (net < netMonthly) lo = mid;
    else hi = mid;
  }
  return calc.netFromGrossMonthly(mid, params, year);
}

// The single place that knows every jurisdiction's calculator bundle.
// A new country adds one entry here and its folder under
// `src/data/tax/<cc>/`. Additive to (not a replacement for) the salary
// `CALCULATORS` map above — salary still routes off `params.country`.
const LOCATIONS: Record<TaxLocation, LocationCalculators> = {
  SE: {
    location: "SE",
    salary: swedishCalculator,
    propertySale: swedishPropertySaleCalculator,
    investment: swedishInvestmentCalculator,
  },
};

// Ordered list for the Location settings picker (the UI iterates this).
export const SUPPORTED_LOCATIONS: readonly TaxLocation[] = ["SE"];

// Resolve a location's calculator bundle, degrading to SE for an
// unknown literal rather than throwing.
export function getLocationCalculators(
  location: TaxLocation,
): LocationCalculators {
  return LOCATIONS[location] ?? LOCATIONS.SE;
}

// Property-sale capital-gains forward calc for a location. Thin
// pass-through so callers import one module.
export function computePropertySale(
  location: TaxLocation,
  inputs: PropertySaleInputs,
): PropertySaleResult {
  return getLocationCalculators(location).propertySale.computeSale(inputs);
}

// Investment net-value-on-sale forward calc for a location. Thin
// pass-through so callers import one module.
export function computeInvestmentNetValue(
  location: TaxLocation,
  inputs: InvestmentTaxInputs,
): InvestmentTaxResult {
  return getLocationCalculators(location).investment.computeNetValue(inputs);
}
