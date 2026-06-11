// Swedish capital-gains tax on selling an investment (vinstskatt vid
// försäljning av värdepapper). Everything here is SE-specific and
// confined to this folder; the registry in `../engine.ts` is the only
// thing that imports it.
//
// The treatment decides the rate:
//   - ISK / KF — Investeringssparkonto and Kapitalförsäkring are taxed
//     yearly on a schablonintäkt, not on the realised gain, so a sale
//     carries no capital-gains tax at all. Net value is the full market
//     value. (The yearly schablon itself is a small drag on returns; it
//     is not modelled here — this calc answers "what's it worth if I
//     sell it today?", and the schablon is already paid.)
//   - depå, private holder — the gain is taxed at the flat 30 %
//     capital-gains rate. Net value subtracts that tax.
//   - depå, company holder — a listed holding sold by an aktiebolag is
//     taxed at the corporate rate (bolagsskatt, 20.6 %) on the gain.
//     Only the sale-level tax is modelled; extracting the proceeds from
//     the company to the owner (dividend up to gränsbelopp, then higher)
//     is a separate layer the budget estimate leaves out.
//
// The figures are accurate enough for a budget *estimate*. A loss is not
// taxed. Näringsbetingade andelar (tax-free corporate disposals of
// unlisted / qualifying holdings) are not modelled — the company rate
// applies to every company-owned position.

import type {
  InvestmentTaxInputs,
  InvestmentTaxResult,
  InvestmentTaxCalculator,
} from "../types";

// The Swedish capital-gains rates. Change THESE constants to retune —
// nothing else in the codebase encodes them. `PRIVATE` is the flat 30 %
// on private securities gains; `COMPANY` is the 20.6 % corporate tax.
export const SE_INVESTMENT_GAINS_PRIVATE = 0.3;
export const SE_INVESTMENT_GAINS_COMPANY = 0.206;

export const swedishInvestmentCalculator: InvestmentTaxCalculator = {
  computeNetValue(inputs: InvestmentTaxInputs): InvestmentTaxResult {
    const value = Math.max(0, inputs.value);
    // ISK / KF: schablon-taxed yearly, no capital-gains tax on a sale.
    if (inputs.treatment === "isk" || inputs.treatment === "kf") {
      return { taxableGain: 0, tax: 0, netValue: value };
    }
    const rate =
      inputs.treatment === "depot-company"
        ? SE_INVESTMENT_GAINS_COMPANY
        : SE_INVESTMENT_GAINS_PRIVATE;
    const taxableGain = Math.max(0, value - Math.max(0, inputs.costBasis));
    const tax = taxableGain * rate;
    return { taxableGain, tax, netValue: value - tax };
  },
};
