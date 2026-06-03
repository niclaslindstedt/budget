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

// One mortgage payment — a single charge against the loan, recorded
// manually or via the "Find mortgage payments" walk that scans the bound
// account's history. Amortisation and interest are no longer split apart:
// each bank charge the user tagged as a mortgage payment is one record at
// its full magnitude. A month split across two bank draws (an amortisation
// charge and a separate interest charge) simply yields two payment records
// for that month; the card sums them.
export type MortgagePayment = {
  id: string;
  date: string; // ISO payment date — drives the per-month grouping
  amount: number; // the charge magnitude (>= 0)
  // The bank `HistoryEntry` this payment was discovered from, when added
  // via "Find mortgage payments". Best-effort dedupe key — bank ids aren't
  // stable across re-imports, so the discovery walk pairs this with a
  // month dedupe. Absent on a hand-entered payment.
  sourceHistoryId?: string;
};

// A loan taken against a property. A property can carry several (a first
// loan plus a top-up / second loan, a refinance kept alongside), so
// mortgages are a named list under the property. The bank account whose
// history "Find mortgage payments" scans lives on the parent **Property**
// (`Property.accountId`), not here — a property is paid to the bank as a
// single charge covering every loan against it, so the account is shared.
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

// One effective-dated interest-rate period on a mortgage. The rate of
// `rate`% became effective on `date` and holds until the next change (or
// indefinitely if it's the most recent). A blank `date` marks the
// original rate — effective "from the start", before any recorded change.
// Recorded so a historical payment's interest is computed at the rate that
// was actually in effect that month, not today's headline rate. The latest
// change by date is the current rate (and is mirrored onto
// `Mortgage.interestRate` so the card and current resolvers don't have to
// walk the list). Resolve a rate at an arbitrary date with `resolveRateAt`
// in `src/data/property-mortgage/interest.ts`.
export type MortgageRateChange = {
  id: string;
  date: string; // ISO yyyy-mm-dd the rate took effect, or "" for the original rate
  rate: number; // annual interest rate as a percent (3.45 ⇒ 3.45%), >= 0
};

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
  loanAmount?: number; // the sum originally borrowed
  currentBalance?: number; // outstanding balance now (manually recorded)
  interestRate?: number; // current annual interest rate, as a percent (3.45 ⇒ 3.45%)
  // Past rate changes, effective-dated. The most recent entry is the
  // current rate and is kept in sync with `interestRate`; earlier entries
  // let the finder compute a historical payment's interest at the rate that
  // was in effect that month. Absent / empty ⇒ no history recorded, and
  // `interestRate` is used for every date.
  rateHistory?: MortgageRateChange[];
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
  // The lender the property's mortgages are held with (e.g. "SBAB"),
  // referencing `UserData.companies`. One lender per property — every loan
  // against it is paid to the same bank — so it lives here, not per
  // mortgage. A strong signal "Find mortgage payments" uses: it filters
  // the bound account's history to charges tagged with this company.
  // Absent until the user picks one; a dangling reference (the company was
  // deleted) is swept to absent on load and on the `deleteCompany`
  // cascade, mirroring `Row.companyId`.
  companyId?: string;
  // The bank account whose history "Find mortgage payments" scans for the
  // property's recurring mortgage charge. A property is paid to the bank as
  // a single charge covering every loan against it, so the account is
  // shared across all the property's mortgages and lives here, not per
  // mortgage. Nullable until the user picks one (mirrors
  // `SalaryView.accountId`); a dangling reference (the account was deleted)
  // is dropped to `null` on load rather than rejecting the file.
  accountId?: string | null;
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
