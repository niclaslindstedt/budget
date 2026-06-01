// Swedish forward tax calculation (gross → net). Everything here is
// SE-specific and confined to this folder; the registry in
// `../engine.ts` is the only thing that imports it. The bracket math
// follows Skatteverket's published model: grundavdrag (basic
// deduction), kommunal + regional tax, statlig inkomstskatt above the
// skiktgräns, jobbskatteavdrag (earned-income credit), and the allmän
// pensionsavgift (withheld but fully credited, so net-zero on
// take-home). Coefficients are expressed in prisbasbelopp (pbb)
// multiples — stable across years — so only the per-year pbb /
// skiktgräns from `./constants.ts` move them.
//
// The figures are accurate enough for a budget *estimate*; they are not
// a substitute for Skatteverket's own calculation (parish church rates,
// förhöjt grundavdrag edge tables, and the 66+ jobbskatteavdrag are
// approximated where the exact tables are unwieldy).

import type {
  SwedishTaxParams,
  TaxCalculator,
  TaxParams,
  TaxResult,
} from "../types";
import { clampTaxYear, constsForYear } from "./constants";
import { rateForMunicipality } from "./municipalities";

// Round to the nearest 100 kronor, as Skatteverket does for the
// beskattningsbar inkomst and the grundavdrag.
function round100(n: number): number {
  return Math.round(n / 100) * 100;
}

// Standard grundavdrag (basic deduction) for someone under 66, as a
// piecewise function of fastställd förvärvsinkomst (≈ gross earned
// income) measured in pbb. Coefficients per Skatteverket's grundavdrag
// table; rounded to the nearest 100 kronor.
function standardGrundavdrag(gross: number, pbb: number): number {
  const u = gross / pbb; // income in pbb units
  let ga: number;
  if (u <= 0.99) ga = 0.423 * pbb;
  else if (u <= 2.72) ga = (0.423 + 0.2 * (u - 0.99)) * pbb;
  else if (u <= 3.11) ga = 0.77 * pbb;
  else if (u <= 7.88) ga = (0.77 - 0.1 * (u - 3.11)) * pbb;
  else ga = 0.293 * pbb;
  return round100(ga);
}

// Förhöjt grundavdrag for those 66+ at the start of the tax year. The
// exact table is intricate; this approximates it as the standard
// deduction plus an age supplement that tapers with income, which
// tracks the published förhöjt curve closely enough for an estimate.
//
// Note: for *employment* income the grundavdrag is largely offset by a
// reduced jobbskatteavdrag (the credit subtracts the deduction), so the
// senior benefit mostly shows on *pension* income (no credit to
// offset). The additional 66+ jobbskatteavdrag for working seniors is
// not modelled — an acceptable simplification for a budget estimate.
function enhancedGrundavdrag(gross: number, pbb: number): number {
  const base = standardGrundavdrag(gross, pbb);
  const u = gross / pbb;
  let supplement: number;
  if (u <= 0.99) supplement = 0.687 * pbb;
  else if (u <= 1.11) supplement = (0.885 - 0.2 * u) * pbb;
  else if (u <= 2.72) supplement = (0.6 - 0.045 * u) * pbb;
  else if (u <= 3.11) supplement = (0.6 - 0.045 * u) * pbb;
  else if (u <= 7.88) supplement = Math.max(0, (0.34 - 0.025 * u) * pbb);
  else supplement = 0;
  return round100(base + Math.max(0, supplement));
}

// Jobbskatteavdrag (earned-income tax credit) for someone under 66.
// `municipalRate` is the combined kommun + region rate; the credit is
// (creditBase − grundavdrag) × that rate, then phased out 3 % above a
// high-income threshold. Only employment income qualifies — pension
// income passes 0 in from the caller.
function jobbskatteavdrag(
  earned: number,
  grundavdrag: number,
  pbb: number,
  municipalRate: number,
): number {
  const u = earned / pbb;
  let creditBase: number;
  if (u <= 0.91) creditBase = earned;
  else if (u <= 3.24) creditBase = (0.91 + 0.3405 * (u - 0.91)) * pbb;
  else if (u <= 8.08) creditBase = (1.703 + 0.128 * (u - 3.24)) * pbb;
  else creditBase = 2.323 * pbb;

  let credit = Math.max(0, (creditBase - grundavdrag) * municipalRate);

  // Phase-out: reduce by 3 % of income above ≈ 11.49 pbb (the indexed
  // high-income threshold), never below zero.
  const phaseOutStart = 11.49 * pbb;
  if (earned > phaseOutStart) {
    credit = Math.max(0, credit - 0.03 * (earned - phaseOutStart));
  }
  return credit;
}

function isSixtySixPlus(birthYear: number | undefined, year: number): boolean {
  if (birthYear === undefined) return false;
  return year - birthYear >= 66;
}

function computeAnnual(
  gross: number,
  params: SwedishTaxParams,
  year: number,
): TaxResult["components"] & { net: number } {
  const c = constsForYear(year);
  const pbb = c.prisbasbelopp;
  const municipalRate = rateForMunicipality(params.municipalityId, year);
  const senior = isSixtySixPlus(params.birthYear, year);

  const grundavdrag = senior
    ? enhancedGrundavdrag(gross, pbb)
    : standardGrundavdrag(gross, pbb);

  // Beskattningsbar inkomst — taxable income, rounded to the nearest 100.
  const taxable = round100(Math.max(0, gross - grundavdrag));

  const municipal = municipalRate * taxable;
  const state = c.stateTaxRate * Math.max(0, taxable - c.skiktgrans);
  const church = params.churchMember ? c.churchRateDefault * taxable : 0;

  // Jobbskatteavdrag applies to employment income only.
  const credit =
    params.incomeKind === "employment"
      ? jobbskatteavdrag(gross, grundavdrag, pbb, municipalRate)
      : 0;

  // Allmän pensionsavgift: 7 % of income up to 8.07 × ibb, rounded to
  // 100. Withheld but matched by a skattereduktion, so it nets to ≈ 0
  // on take-home — reported for the breakdown, not subtracted from net.
  const pensionBase = Math.min(gross, 8.07 * c.inkomstbasbelopp);
  const pensionFee = round100(c.pensionFeeRate * pensionBase);

  const totalTax = Math.max(0, municipal + state + church - credit);
  const net = gross - totalTax;

  return {
    municipal,
    state,
    church,
    jobbskatteavdrag: credit,
    pensionFee,
    grundavdrag,
    net,
  };
}

export const swedishCalculator: TaxCalculator = {
  netFromGrossMonthly(
    grossMonthly: number,
    params: TaxParams,
    year: number,
  ): TaxResult {
    // `params` is the SE union member here — the registry only routes
    // SE params to this calculator.
    const se = params as SwedishTaxParams;
    const effectiveYear = clampTaxYear(se.year ?? year);
    const gross = Math.max(0, grossMonthly) * 12;
    const a = computeAnnual(gross, se, effectiveYear);
    const taxAnnual = gross - a.net;
    return {
      grossMonthly: gross / 12,
      netMonthly: a.net / 12,
      taxMonthly: taxAnnual / 12,
      components: {
        municipal: a.municipal,
        state: a.state,
        church: a.church,
        jobbskatteavdrag: a.jobbskatteavdrag,
        pensionFee: a.pensionFee,
        grundavdrag: a.grundavdrag,
      },
    };
  },
};
