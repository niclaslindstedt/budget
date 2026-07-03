import type { CategoryIcon } from "./categories";
import type { ItemDepreciation } from "./items";

// How the user has access to a car. Value tracking (purchase price,
// depreciation, market-value snapshots) only applies to cars the user
// holds capital in — "owned" and "shared". A leased or car-pool car is
// pure running cost: its "value loss" is the leasing / pool fee, which
// arrives as a linked expense, so those cars never contribute to net
// worth and hide the value surfaces in the UI.
export type CarOwnership = "owned" | "leased" | "shared" | "pool";

// One dated snapshot recording the car's market value and/or odometer
// reading. At least one of the two must be set (validator-enforced).
// A second-hand-market lookup (e.g. Blocket) records both — the value
// quoted there is driven by model, year, and mileage — while a plain
// odometer check records mileage alone. Mirrors `ItemValuePoint` /
// `PropertyValuePoint`, widened with the odometer column.
export type CarSnapshot = {
  id: string;
  date: string; // ISO yyyy-mm-dd the snapshot was recorded for
  // Market value at that date, in the user's currency. Absent on a
  // mileage-only snapshot.
  value?: number;
  // Odometer reading at that date (km or miles — whatever the user's
  // convention is; the app never converts). Finite and non-negative.
  // Absent on a value-only snapshot.
  mileage?: number;
};

// One transportation cost attributed to a car. Usually sourced from an
// imported bank charge via the "Find car expenses" walk — then
// `accountId` + `sourceHistoryId` point at the backing `HistoryEntry`
// (both set together, mirroring `MortgagePayment`). A manual expense
// (cash fuel, a cost predating the imported history, a car-pool invoice
// on another person's account) has neither. `date` / `amount` /
// `description` / `typeId` are denormalised at link time so the expense
// survives a re-import that reshuffles history ids; the finder keys its
// already-linked exclusion on `${accountId}:${entryId}` like property
// repairs do.
export type CarExpense = {
  id: string;
  date: string; // ISO yyyy-mm-dd
  amount: number; // outflow magnitude, >= 0
  description: string;
  // The transport entry type this cost resolved to when linked (or the
  // user's pick for a manual expense) — drives the per-type bands in the
  // cost chart. Points into the merged preset + user type list; a
  // dangling id renders as "uncategorised" rather than being swept.
  typeId: string;
  accountId?: string;
  sourceHistoryId?: string;
};

// Which kind of contract an uploaded car document is. Purchase and
// leasing contracts cover how the car was acquired; a sale contract is
// the paperwork from selling it on. The kind drives only the badge /
// grouping in the contracts manager — the bytes are stored the same way
// regardless.
export type CarContractKind = "purchase" | "lease" | "sale";

// One uploaded contract document attached to a car (purchase, leasing,
// or sale paperwork — a scan or PDF). The bytes live in the backend's
// per-car `cars/<name>/contracts/` store; `path` addresses them there.
// Mirrors `PropertyFile`, trimmed to the fields a car contract needs.
export type CarContract = {
  id: string;
  // Relative path of the stored bytes within the `carFiles` store.
  path: string;
  kind: CarContractKind;
  // Optional user label shown instead of the filename.
  description?: string;
};

// A car the user owns, leases, shares, or reaches through a car pool.
// Sits in `UserData.cars`, rendered by the Cars sheet. The point of the
// record is the REAL cost of having the car: the linked transportation
// expenses, the value lost to depreciation (owned/shared), and the
// interest on the loan financing it — rolled up per month/year and per
// kilometre once odometer data exists.
export type Car = {
  id: string;
  name: string;
  ownership: CarOwnership;
  glyph?: CategoryIcon;
  color?: string;
  // Free-form model / registration-plate note ("Volvo V60 D4 -17, ABC123").
  description?: string;
  // The purchase: cost basis and the anchor the depreciation curve
  // measures elapsed time from. Owned/shared only — a leased/pool car
  // leaves both absent.
  purchaseDate?: string;
  purchasePrice?: number;
  // Odometer reading at purchase — bought used ⇒ > 0. The baseline
  // `carDistanceDriven` subtracts so cost-per-km covers only the
  // user's own driving.
  purchaseMileage?: number;
  // Ownership share in percent, exclusive range (0, 100), for a car
  // co-owned with someone outside the budget. Absent ⇒ 100. Scales the
  // car's net-worth contribution; costs are NOT scaled — the linked
  // expenses are what the user actually paid.
  sharePct?: number;
  // How the car loses value over time. Reuses the item depreciation
  // union — its `accelerated` arm (instant drive-off-the-lot drop, steep
  // first year, flatter decline after) was written for exactly this.
  // Absent means no modelled decay; the value then sits at the latest
  // snapshot or the purchase price.
  depreciation?: ItemDepreciation;
  // Dated value / mileage snapshots recorded via the "Update value"
  // modal. The latest snapshot with a `value` on or before a date wins
  // over the depreciation curve (see `computeCarCurrentValue`); the
  // purchase (`purchasePrice` + `purchaseMileage` at `purchaseDate`) is
  // folded in as a read-only first point at display time, never stored.
  snapshots: CarSnapshot[];
  // Leasing terms. Present only for `ownership: "leased"` cars; the
  // editor hides them otherwise. Together they model the lease as a
  // level-payment ("annuity") balloon loan: the financed amount runs
  // from `leaseStartValue` down to `leaseEndValue` (the residual) over
  // `leaseMonths`, so the outstanding balance amortises slowly at first
  // and fast near the end (small early amortisation, large late). The
  // car's own market value depreciates front-loaded over the same
  // window, so the two curves cross — the user is "underwater" (market
  // value below the outstanding balance) early in the term. The
  // net-worth roll-up surfaces that gap as a NEGATIVE contribution that
  // recovers toward zero by lease end (see `leasedCarEquity`). All six
  // are optional; the value model needs `leaseStart`, `leaseMonths`,
  // `leaseStartValue`, and `leaseEndValue` (interest defaults to 0) to
  // produce a figure — missing any of those leaves a leased car out of
  // net worth exactly as before.
  leaseStart?: string; // ISO yyyy-mm-dd the lease begins
  leaseMonths?: number; // whole-month term length, > 0
  leaseMonthlyCost?: number; // contract monthly payment (display / reference)
  leaseInterestRate?: number; // nominal annual interest %, >= 0
  leaseStartValue?: number; // car value / amount financed at lease start
  leaseEndValue?: number; // residual value at lease end
  // The loan financing this car — points into `UserData.loans` (the
  // Loans sheet owns the entity; no duplication here). Lets the cost
  // view include the interest leg. Swept to absent when the loan is
  // deleted.
  loanId?: string;
  // Sale: once `soldAt` is set the car is no longer owned capital — it
  // stops contributing to net worth from that date and the card moves
  // to the sold section. `soldFor` is the proceeds actually received.
  soldAt?: string;
  soldFor?: number;
  expenses: CarExpense[];
  // Uploaded contract documents (purchase / leasing / sale paperwork),
  // managed from the car card's "…" menu. Empty until the user uploads
  // one; the bytes live in the backend's `cars/<name>/contracts/` store.
  contracts: CarContract[];
};
