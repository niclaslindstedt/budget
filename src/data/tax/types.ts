// Country-agnostic tax-engine vocabulary. Nothing in this file knows a
// single Swedish constant — those live entirely under `./se/`. The
// salary page, reducers, and UI talk to the engine through these types
// plus the registry in `./engine.ts`, never reaching into a country
// folder directly. Adding a country is: extend `TaxCountry`, add a
// `*TaxParams` variant to the `TaxParams` union, drop a folder under
// `src/data/tax/<cc>/`, and register its calculator in `engine.ts`.

// ISO-3166 alpha-2 of every supported tax jurisdiction. The union grows
// one literal per country.
export type TaxCountry = "SE";

// Sweden-specific tax inputs. The shape the Swedish calculator reads;
// every field maps to a real Skatteverket lever. `year` is an optional
// override — normally the tax year is derived from the paycheck's date,
// not the profile (a 2023 paycheck is taxed under 2023 rules).
export type SwedishTaxParams = {
  country: "SE";
  // Optional explicit tax year. When absent the caller passes the
  // paycheck's calendar year to the calculator instead. Clamped to the
  // supported span at calc time.
  year?: number;
  // References a kommun in `se/municipalities.ts`; resolves to that
  // kommun's combined (municipal + regional) rate for the tax year.
  municipalityId: string;
  // Adds the kyrkoavgift (church fee) on top of municipal tax.
  churchMember: boolean;
  // Birth year. When the person is 66 or older at the start of the tax
  // year they get the förhöjt grundavdrag and the 66+ jobbskatteavdrag.
  birthYear?: number;
  // Employment income earns jobbskatteavdrag; pension income does not.
  incomeKind: "employment" | "pension";
};

// Discriminated by `country`. Grows `| FrenchTaxParams | …` per country.
export type TaxParams = SwedishTaxParams;

// A reusable, named bundle of tax inputs stored at the budget level
// (`UserData.taxProfiles`) so the user can pick it when creating a
// salary sheet. The `id` is referenced from `SalaryView.taxProfileId`.
export type TaxProfile = {
  id: string;
  name: string;
  params: TaxParams;
};

// The result of a forward calculation. Monetary fields are monthly
// kronor (gross÷12 etc.). `components` is an annual breakdown so a
// future "show me the math" panel can render each lever; the engine
// divides only the headline figures by 12.
export type TaxResult = {
  grossMonthly: number;
  netMonthly: number;
  taxMonthly: number;
  // Annual breakdown of the levers that produced `taxMonthly`. Credits
  // (jobbskatteavdrag) and deductions (grundavdrag) are reported as
  // positive magnitudes; the calculator already nets them out.
  components: {
    municipal: number;
    state: number;
    church: number;
    jobbskatteavdrag: number;
    pensionFee: number;
    grundavdrag: number;
  };
};

// One country's forward tax calculation. Forward means gross → net;
// the engine inverts it numerically for the net → gross direction the
// salary page needs. Implementations must be monotonic in gross (more
// gross ⇒ more net) so the bisection in `engine.ts` converges.
export interface TaxCalculator {
  // `year` is the tax year (the paycheck's calendar year), clamped to
  // the country's supported range by the implementation. Annualizes
  // `grossMonthly × 12`, applies that year's rules, divides back by 12.
  netFromGrossMonthly(
    grossMonthly: number,
    params: TaxParams,
    year: number,
  ): TaxResult;
}

// The user-facing jurisdiction selector stored globally
// (`Settings.location`). Picks which `LocationCalculators` bundle the
// non-profile tax estimates use — today the property-sale capital-gains
// calc. Kept distinct from `TaxCountry` (the per-`TaxProfile` salary
// discriminant) so the two systems can converge later without a
// breaking rename; the sets are identical today. One literal per
// supported jurisdiction.
export type TaxLocation = "SE";

// How a broker (estate agent) is paid on a property sale. Discriminated
// by `mode`: "none" skips the broker entirely; the others carry the
// inputs that mode needs. "tiered" is "a static base fee plus `percent`%
// of the part of the sale price above `threshold`".
export type BrokerCost =
  | { mode: "none" }
  | { mode: "fixed"; amount: number }
  | { mode: "percent"; percent: number }
  | { mode: "tiered"; base: number; threshold: number; percent: number };

// Everything a property-sale capital-gains calc reads. Bare numbers in
// the user's display currency; the calc does no formatting. `repairs` is
// the summed repairs + renovations spend deductible from the gain.
export type PropertySaleInputs = {
  sellPrice: number;
  purchasePrice: number;
  repairs: number;
  advertisementCost: number;
  broker: BrokerCost;
};

// The breakdown lines a property-sale calc can emit. Each maps to an
// i18n label at `properties.netSale.line.<key>`.
export type PropertySaleLineKey =
  | "sellPrice"
  | "broker"
  | "advertisement"
  | "repairs"
  | "purchasePrice"
  | "tax";

// One line of the breakdown the modal renders, in declaration order.
// `sign` is +1 for amounts that add to proceeds (the sale price) and -1
// for the deducted costs and tax, so the UI renders the breakdown by
// iterating without re-deriving which figures subtract.
export type PropertySaleLineItem = {
  key: PropertySaleLineKey;
  amount: number;
  sign: 1 | -1;
};

// The result of a property-sale calc. `taxableGain` is the jurisdiction's
// taxed gain (clamped at 0 — a loss is not taxed); `netProfit` is the
// final bottom line and is negative on a loss. `lineItems` is the ordered
// breakdown the modal renders above the bottom line.
export type PropertySaleResult = {
  taxableGain: number;
  tax: number;
  netProfit: number;
  lineItems: PropertySaleLineItem[];
};

// One jurisdiction's capital-gains-on-property calculation. Pure; no
// React, no formatting. Mirrors `TaxCalculator`'s "one country, one
// forward function" shape — the calc owns the cost ordering and the tax
// rule so the modal stays jurisdiction-agnostic.
export interface PropertySaleTaxCalculator {
  computeSale(inputs: PropertySaleInputs): PropertySaleResult;
}

// Every calculator that varies by jurisdiction, bundled per location.
// Today: the salary forward calc and the property-sale calc. Adding a
// country means adding one value here and one registry entry in
// `engine.ts`.
export type LocationCalculators = {
  location: TaxLocation;
  salary: TaxCalculator;
  propertySale: PropertySaleTaxCalculator;
};
