// The Properties sheet tracks valuable things the user has bought — a
// house, an apartment, a holiday cabin: what they paid for it, what it's
// worth now (manually recorded over time), and the mortgages (loans)
// taken against it. Lives at the `UserData` level (like `Item` /
// `Salary`) so the workspace-wide Properties sheet renders the whole
// collection and a future per-account roll-up can read it directly.
//
// The shape is deliberately open for the deferred follow-up (a `sale`,
// transaction-linked repairs, a country-pluggable capital-gains engine):
// readers tolerate and writers preserve fields they don't recognise, so
// those land without a migration — exactly as `Item` documents.

// One manually-entered snapshot of a property's market value. "Update
// value" on the page appends one of these; the property's current value
// is simply the latest point by date. Carries its own `id` (rather than
// being keyed by `date`) so two snapshots taken on the same day can be
// edited / deleted independently.
export type PropertyValuePoint = {
  id: string;
  date: string; // ISO yyyy-mm-dd the value was recorded for
  value: number; // the market value at that date, in the user's currency
};

// One month's payment on a mortgage, split into the amortisation
// (`principal`) and `interest` portions. Recorded manually or via the
// "Find mortgage payments" walk that scans the bound account's history.
// A combined bank charge is stored as a single record (the user splits
// it into principal / interest); two separate charges are paired into
// one record, with `interestSourceHistoryId` carrying the interest leg's
// bank entry so both can be de-duplicated on a re-scan.
export type MortgagePayment = {
  id: string;
  date: string; // ISO payment date — drives the per-month grouping
  principal: number; // amortisation portion (>= 0)
  interest: number; // interest portion (>= 0)
  // The bank `HistoryEntry` this payment was discovered from, when added
  // via "Find mortgage payments". For a combined charge this is the whole
  // payment; for a split pair it is the principal (amortisation) leg.
  // Best-effort dedupe key — bank ids aren't stable across re-imports, so
  // the discovery walk pairs this with a month dedupe. Absent on a
  // hand-entered payment.
  sourceHistoryId?: string;
  // The interest leg's bank `HistoryEntry`, set only when principal and
  // interest arrived as two separate charges. Absent for a combined
  // charge or a hand-entered payment.
  interestSourceHistoryId?: string;
};

// A loan taken against a property. A property can carry several (a first
// loan plus a top-up / second loan, a refinance kept alongside), so
// mortgages are a named list under the property. `accountId` binds the
// bank account whose history "Find mortgage payments" scans for this
// loan's recurring charge; nullable until the user picks one (mirrors
// `SalaryView.accountId`).
//
// How much of the loan is amortised (paid down) each month. The user
// picks one of two mutually-exclusive modes:
//
// - `percent` — an annual percentage of the *initial* loan
//   (`Mortgage.loanAmount`). Swedish "amorteringskrav" is expressed this
//   way: 2% of an original 7,000,000 ⇒ 0.02 × 7,000,000 ÷ 12 ≈ 11,667 a
//   month. Needs `loanAmount` to resolve to a monthly figure.
// - `fixed` — a flat sum paid every month, independent of the loan size.
//
// Both values are non-negative. Resolve the per-month amount with
// `resolveMonthlyAmortization` in `src/data/property-mortgage/amortization.ts`.
export type MortgageAmortization =
  | { mode: "percent"; percent: number } // annual % of loanAmount
  | { mode: "fixed"; amount: number }; // fixed sum per month

// The loan-terms fields below are all manually entered and all optional —
// a mortgage can exist with just a name and have its terms filled in
// later. `currentBalance` is recorded directly (not derived from
// `loanAmount` minus the amortisation legs) so a user who tracks the loan
// without importing payments still sees an accurate outstanding figure.
// The interest fields describe a fixed-rate (Swedish "bindningstid")
// period: `interestRate` is the current annual rate, `rateChangeMonths`
// is how often it resets, and `nextRateChangeDate` is when the next reset
// lands. `amortization` is how much is paid down per month (see above).
export type Mortgage = {
  id: string;
  name: string; // user label, e.g. "SBAB loan 1"
  accountId?: string | null; // bank account scanned for payments
  loanAmount?: number; // the sum originally borrowed
  currentBalance?: number; // outstanding balance now (manually recorded)
  interestRate?: number; // current annual interest rate, as a percent (3.45 ⇒ 3.45%)
  rateChangeMonths?: number; // how often the rate resets, in months
  nextRateChangeDate?: string; // ISO yyyy-mm-dd of the next rate change
  amortization?: MortgageAmortization; // monthly amortisation (percent-of-initial or fixed)
  payments: MortgagePayment[];
};

// One property the user owns or has bought. `purchaseAmount` is what they
// paid for it (the cost basis a future capital-gains calc reads);
// `valueHistory` is the manually-recorded market value over time (current
// value = latest point); `mortgages` are the loans against it. Every
// field beyond `id` / `name` is optional or starts empty so a property
// can be created with just a name and filled in later.
export type Property = {
  id: string;
  name: string;
  purchaseAmount?: number; // what the property was bought for
  purchaseDate?: string; // ISO date of purchase
  // Living area of the property, in square metres. Stored as a bare
  // number; the unit it renders with ("kvm" / "sqm") is a global
  // display preference (`Settings.propertySizeUnit`), not stored per
  // property — both labels mean the same square-metre quantity. Absent
  // when the user hasn't recorded a size.
  size?: number;
  valueHistory: PropertyValuePoint[];
  mortgages: Mortgage[];
};
