// Swedish capital-gains tax on a private-residence sale (vinstskatt vid
// bostadsförsäljning). Everything here is SE-specific and confined to
// this folder; the registry in `../engine.ts` is the only thing that
// imports it.
//
// The taxed gain is the sale price less the deductible selling expenses
// (broker fee, advertising), the improvement spend (repairs +
// renovations), and the original purchase price. For a private residence
// (privatbostad) the gain is taxed at an effective 22 % — only 22/30 of
// the gain is taxable and that slice is taxed at 30 %, which nets to the
// same 22 % — so the seller keeps 78 % of the gain. A loss is not taxed.
//
// The figures are accurate enough for a budget *estimate*; deferral
// (uppskov), the per-improvement deductibility rules, and the 5 000 kr
// yearly improvement floor are not modelled.

import type {
  BrokerCost,
  PropertySaleInputs,
  PropertySaleResult,
  PropertySaleTaxCalculator,
} from "../types";

// The single Swedish capital-gains rate constant: a private residence
// keeps 78 % of the gain (22 % tax). Change THIS one line to retune the
// rate — nothing else in the codebase encodes it. The 30 % rate (net ×
// 0.70) applies to a business/commercial property (näringsfastighet),
// not modelled here.
export const SE_CAPITAL_GAINS_NET_MULTIPLIER = 0.78;
export const SE_CAPITAL_GAINS_TAX_RATE = 1 - SE_CAPITAL_GAINS_NET_MULTIPLIER;

// The broker fee for a given sale price under the chosen mode. Never
// negative.
function brokerFee(broker: BrokerCost, sellPrice: number): number {
  switch (broker.mode) {
    case "none":
      return 0;
    case "fixed":
      return Math.max(0, broker.amount);
    case "percent":
      return Math.max(0, (broker.percent / 100) * sellPrice);
    case "tiered": {
      const above = Math.max(0, sellPrice - broker.threshold);
      return Math.max(0, broker.base + (broker.percent / 100) * above);
    }
  }
}

export const swedishPropertySaleCalculator: PropertySaleTaxCalculator = {
  computeSale(inputs: PropertySaleInputs): PropertySaleResult {
    const sellPrice = Math.max(0, inputs.sellPrice);
    const broker = brokerFee(inputs.broker, sellPrice);
    const advertisement = Math.max(0, inputs.advertisementCost);
    const repairs = Math.max(0, inputs.repairs);
    const purchase = Math.max(0, inputs.purchasePrice);

    // Advertising (Hemnet etc.) is a deductible selling expense in the SE
    // model, alongside the broker fee.
    const gain = sellPrice - broker - advertisement - repairs - purchase;
    const taxableGain = Math.max(0, gain);
    const tax = taxableGain * SE_CAPITAL_GAINS_TAX_RATE;
    const netProfit = gain - tax;

    return {
      taxableGain,
      tax,
      netProfit,
      lineItems: [
        { key: "sellPrice", amount: sellPrice, sign: 1 },
        { key: "broker", amount: broker, sign: -1 },
        { key: "advertisement", amount: advertisement, sign: -1 },
        { key: "repairs", amount: repairs, sign: -1 },
        { key: "purchasePrice", amount: purchase, sign: -1 },
        { key: "tax", amount: tax, sign: -1 },
      ],
    };
  },
};
