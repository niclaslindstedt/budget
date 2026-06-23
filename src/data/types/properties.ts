// The Properties sheet tracks valuable things the user has bought — a
// house, an apartment, a holiday cabin: what they paid for it, what it's
// worth now (manually recorded over time), and the mortgages (loans)
// taken against it. Lives at the `UserData` level (like `Item` /
// `Salary`) so the workspace-wide Properties sheet renders the whole
// collection and a future per-account roll-up can read it directly.
//
// The shape is deliberately open for the deferred follow-up (a
// country-pluggable capital-gains engine): readers tolerate and writers
// preserve fields they don't recognise, so those land without a
// migration — exactly as `Item` documents.

import type { BrokerCost } from "../tax/types";

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
  // Which account's history `sourceHistoryId` lives in. "Find mortgage
  // payments" can scan several accounts at once (a loan's charges move
  // between accounts over time), so the source transaction isn't always in
  // the property's main `accountId` — without this the payments view can't
  // resolve a charge drawn from any other account back to its bank row.
  // Paired with `sourceHistoryId` (set / cleared together); best-effort
  // across re-imports and the account may since have been deleted, exactly
  // like `sourceHistoryId`. Absent on a hand-entered payment, and on a
  // payment recorded before this field existed — the payments view then
  // falls back to the property's main `accountId`.
  sourceAccountId?: string;
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
// `resolveMonthlyAmortization` in `src/data/finance/amortization.ts`.
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
// in `src/data/finance/interest.ts`.
export type MortgageRateChange = {
  id: string;
  date: string; // ISO yyyy-mm-dd the rate took effect, or "" for the original rate
  rate: number; // annual interest rate as a percent (3.45 ⇒ 3.45%), >= 0
};

// One effective-dated amortisation-plan period on a mortgage. The plan
// `amortization` became effective on `date` and holds until the next change
// (or indefinitely if it's the most recent). A blank `date` marks the original
// plan — effective "from the start", before any recorded change. Banks
// renegotiate the amortisation requirement over a loan's life (Swedish
// "amorteringskrav" steps down as the loan-to-value ratio falls, e.g. 3% → 2%
// → 1%), and the step is an exact, round change to the plan — not the small
// month-to-month drift the interest leg carries. Recorded so a historical
// payment's amortisation is taken from the plan that was actually in effect
// that month: the next charge after a change follows the new plan. The latest
// change by date is the current plan (and is mirrored onto
// `Mortgage.amortization` so the card and current resolvers don't have to walk
// the list). Resolve a plan at an arbitrary date with
// `resolveMonthlyAmortizationAt` in `src/data/finance/amortization.ts`.
export type MortgageAmortizationChange = {
  id: string;
  date: string; // ISO yyyy-mm-dd the plan took effect, or "" for the original plan
  amortization: MortgageAmortization; // the plan effective from this date
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
  // Past amortisation-plan changes, effective-dated. The most recent entry is
  // the current plan and is kept in sync with `amortization`; earlier entries
  // let the payment split take a historical charge's amortisation from the plan
  // in effect that month (a bank-agreed step like 3% → 2%). Absent / empty ⇒ no
  // history recorded, and `amortization` is used for every date.
  amortizationHistory?: MortgageAmortizationChange[];
  // How often the loan's amortisation + interest is charged, in months: 1 =
  // monthly (the default and overwhelmingly common case), 3 = quarterly, 6 =
  // semi-annual, 12 = annual. Drives "Find mortgage payments": the number of
  // charges expected since the loan started is the months elapsed divided by
  // this cadence, so a charge that recurs cleanly but covers only part of that
  // window (5 of 8 expected months) isn't promoted to "highly probable".
  // Absent ⇒ monthly.
  paymentCadenceMonths?: number;
  // When the loan started being paid (ISO yyyy-mm-dd) — the month its first
  // charge is expected. "Find mortgage payments" measures the expected number
  // of payments from here to the latest charge the account has seen (at
  // `paymentCadenceMonths` cadence), so a charge covering only the last few of
  // many expected months isn't flagged "highly probable". Absent ⇒ fall back
  // to the property's `purchaseDate`.
  loanStartDate?: string;
  payments: MortgagePayment[];
};

// One extra bank transaction backing a repair, beyond its primary source
// (the `accountId` / `sourceHistoryId` on the repair itself). A single
// invoice for one job is often paid across several bank charges — a deposit
// plus a balance, staged payments to a contractor — so a repair can group
// many transactions. The primary source stays on the repair (it hosts the
// receipt and resolves the row's company / tags); these are the rest. Each
// is located the same way (`accountId` in `UserData.history`, `entryId` its
// entry id) and is best-effort across re-imports, exactly like the primary.
export type RepairSource = {
  accountId: string;
  entryId: string;
};

// One receipt document attached to a repair / renovation. A single job often
// arrives as several invoices over time — a deposit at the start, a balance at
// the end, staged invoices across a year — each sent on its own date, so a
// repair owns a *list* of these rather than one document. `path` locates the
// bytes in the backend's per-property `properties/` store
// (`<name>/receipts/…`); `date` is the receipt's own date, which drives the
// dated filename and reads as a log of the work. A new receipt defaults its
// `date` to the repair's date (the common case) but is freely editable, since
// invoices for one job don't all share the repair's date.
export type RepairReceipt = {
  id: string;
  path: string;
  date: string; // ISO yyyy-mm-dd — the receipt's own date
};

// One repair or renovation on a property — work the user tagged as
// **Repairs** (`preset-type-repairs`) or **Renovations**
// (`preset-type-renovations`) and bound to this property. Recorded for a
// future "net value of a property" calculation (value − loan − deductible
// repairs / renovations), where a receipt is what makes the cost
// tax-deductible.
//
// A repair comes from one of two paths:
//
// - **Transaction-backed** (the common case): one **primary** source
//   transaction (`accountId` / `sourceHistoryId` below) plus any number of
//   **additional** sources (`additionalSources`) — the bank charges that
//   together paid one invoice. `date` / `typeId` track the primary, and the
//   row's company / tags resolve live off the primary transaction (they are
//   NOT stored on the repair). A given transaction backs at most one
//   property's repair across all its sources (enforced by the candidate
//   finder).
// - **Manual** (no backing transaction): for work older than the imported
//   bank history reaches, or paid in a way the ledger never saw. `accountId`
//   / `sourceHistoryId` are absent and there are no sources, so `date`,
//   `typeId`, `companyId`, and `tagIds` are entered by the user and stored on
//   the repair itself — there is no transaction to carry them.
//
// `amount` is the sum across every source (transaction-backed) or the entered
// cost (manual), always >= 0. The receipts covering the work are owned by the
// repair itself (`receipts`), decoupled from any one transaction — the
// invoices are the repair's documents. Attaching at least one clears the
// "missing receipt" flag.
export type PropertyRepair = {
  id: string;
  date: string; // ISO yyyy-mm-dd — primary source's date, or entered (manual)
  amount: number; // the cost magnitude (>= 0) — sum across every source
  // The label shown on the repairs list — denormalised from the source
  // transaction's effective description at link time (transaction-backed) or
  // entered by the user (manual) so the row reads sensibly.
  description: string;
  // Which kind of work this is, for the row glyph / label: the preset type
  // id the source charge was tagged with, or the user's pick (manual) —
  // `PRESET_TYPE_REPAIRS_ID` or `PRESET_TYPE_RENOVATIONS_ID`.
  typeId: string;
  // The user's classification of this work, one tier below the Repairs /
  // Renovations type: a `Subtype` id (`UserData.subtypes`) whose parent
  // `typeId` is this repair's `typeId` (e.g. "Painting" under Renovations).
  // Picked / edited in the repairs editor; the row resolves it for display
  // only. Absent ⇒ unclassified. A dangling reference (the subtype was
  // deleted) simply renders unclassified — the picker resolves it to none.
  subtypeId?: string;
  // The **primary** bank transaction this repair was sourced from.
  // `accountId` locates it in `UserData.history`; `sourceHistoryId` is its
  // entry id. The pair resolves the live entry to read the row's company /
  // tags (which stay on the transaction, shared with the budget). Best-effort
  // across re-imports (bank ids aren't stable), and the account may since have
  // been deleted — the snapshot above survives either way. **Both absent for
  // a manual repair** (no backing transaction); the pair is always set or
  // cleared together.
  accountId?: string;
  sourceHistoryId?: string;
  // The contractor / company behind a **manual** repair — a `UserData.companies`
  // id. Transaction-backed repairs leave this absent and resolve company off
  // the primary transaction instead; only a manual repair (no transaction to
  // carry it) stores company here. A dangling reference (the company was
  // deleted) is swept to absent on load, mirroring `Property.companyId`.
  companyId?: string;
  // The tags on a **manual** repair — `UserData.tags` ids. As with `companyId`,
  // transaction-backed repairs resolve tags off the primary transaction and
  // leave this absent; only manual repairs store tags here. Absent / empty ⇒
  // untagged; a dangling reference renders nothing.
  tagIds?: string[];
  // Any further transactions paying the same invoice, beyond the primary
  // above. Absent / empty ⇒ a single-transaction repair (the common case and
  // the only shape older budgets carry — this field is additive). Walk the
  // full set with `repairSources` in `src/data/property-repairs/sources.ts`.
  additionalSources?: RepairSource[];
  // The receipts covering this repair's work — dated invoice documents owned
  // by the repair (not by any source transaction), filed into the backend's
  // per-property `properties/<name>/receipts/` store. A job can produce
  // several over time (deposit + balance, staged invoices), each with its own
  // date, so this is a list. Absent / empty ⇒ no receipt yet, which surfaces
  // the "missing receipt" flag (a receipt is what makes the cost
  // tax-deductible). A new receipt defaults its date to the repair's date but
  // is editable; changing it re-files the stored document. Removing the last
  // receipt drops the key, mirroring an absent optional. Walk the list with
  // `repairReceipts` in `src/data/property-repairs/receipts.ts`.
  receipts?: RepairReceipt[];
};

// The property's share of a housing association's own debt — the Swedish
// bostadsrätt case, where the förening (cooperative) carries loans that you
// indirectly own a slice of through your apartment. It is not a loan you took
// or pay to a bank directly: its interest is baked into the monthly fee
// (`Property.fee`), which is why a flat with a high fee often hides a large
// indirect debt. Entered the way an årsredovisning (annual report) reports it
// — a figure *per unit of living area* (`loanPerSize`, e.g. 6,000 kr/kvm) plus
// the association's annual interest `rate`. The property's own share is
// `loanPerSize × size`, where `size` is the area the association uses to
// apportion the debt — the figure in its lägenhetsförteckning (apartment
// register), which can differ from the measured living area on the property
// (`Property.size`): a flat measured at 82 kvm may be registered as 80 in the
// association, so its debt share is lower than the measured area implies. The
// indirect interest is charged on that share at `rate`. All non-negative.
// Absent until the user records one; the share resolves to undefined without
// either an association `size` or a recorded `Property.size` to multiply by.
export type AssociationLoan = {
  loanPerSize: number; // indirect debt per kvm / sqft (>= 0)
  rate: number; // the association's annual interest rate, as a percent (>= 0)
  // The apartment's area as recorded in the association's
  // lägenhetsförteckning, used to apportion the association's debt. Absent ⇒
  // fall back to the property's measured `size`. Optional because most users
  // only know the one measured figure; set it when the register differs.
  size?: number; // association-registered area in kvm / sqft (>= 0)
};

// A user-defined category for a property's uploaded files — "Insurance",
// "Manuals", "Before & after", … Each category becomes a subfolder under a
// property's `files/` folder in the backend's `properties/` store; a file
// with no category lands in the `files/` root. Global (workspace-wide, like
// `Subtype`) and entirely user-curated — no presets ship — created and
// renamed from the Properties settings tab. Name-only because there is no
// cell that needs a colour or glyph for it. Referenced from
// `PropertyFile.categoryId`; a dangling reference (the category was deleted)
// renders uncategorised and the file falls back to the `files/` root.
export type FileCategory = {
  id: string;
  name: string;
};

// One arbitrary file the user uploaded against a property — a before/after
// photo, an inspection report, an insurance document, anything that isn't a
// repair receipt. The bytes live in the backend's `properties/` store at
// `<property name>/files/[<category name>/]<file>`; only the relative `path`
// is stored here (mirroring a `PropertyRepair.receipts` entry's `path`).
// `description` is
// the user's label shown in the files list; `tagIds` are `UserData.tags`
// references (a file can carry several); `categoryId` is the optional
// `FileCategory` the file is filed under (absent ⇒ the `files/` root). A
// dangling tag / category reference renders nothing / uncategorised.
export type PropertyFile = {
  id: string;
  // Relative path into the backend's `properties/` store, e.g.
  // "Cabin/files/Insurance/policy-2026.pdf". The single source of truth for
  // where the bytes live — the category subfolder is baked into the path at
  // upload time, so renaming a category does not move existing files.
  path: string;
  // The user's label for the file, shown in the files list. Absent / "" ⇒
  // the row falls back to the filename derived from `path`.
  description?: string;
  // `UserData.tags` ids. Absent / empty ⇒ untagged; a dangling reference
  // (the tag was deleted) renders nothing.
  tagIds?: string[];
  // The `FileCategory` this file is filed under (`UserData.fileCategories`).
  // Absent ⇒ the `files/` root. A dangling reference (the category was
  // deleted) renders uncategorised; the stored `path` is not rewritten.
  categoryId?: string;
  // Whether the file is excluded from a property export (the sale-handover
  // archive) unless the user explicitly opts into "include private files".
  // Default (absent) ⇒ included in the export, mirroring how the rest of a
  // property's documents hand over with it. Additive/optional, so old
  // budgets simply lack it — no migration needed.
  private?: boolean;
};

// One property the user owns — or owned in the past (`soldDate` set).
// `purchaseAmount` is what they paid for it (the cost basis a future
// capital-gains calc reads); `valueHistory` is the manually-recorded
// market value over time (current value = latest point); `mortgages` are
// the loans against it; `repairs` are the transaction-linked repairs /
// renovations on it; `files` are the arbitrary documents / photos
// uploaded against it. Every field beyond `id` / `name` is optional or
// starts empty so a property can be created with just a name and filled
// in later.
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
  // What the property sold for and when, for a property the user no longer
  // owns. A set `soldDate` marks the property as previously owned: it keeps
  // its value history, repairs, and mortgage payments (so old bank charges
  // still attribute to the right home), but stops counting toward net worth
  // from that date, and discovery walks stop attributing charges after it.
  // `soldAmount` is the sale price — the closing figure of the ownership,
  // mirroring how `purchaseAmount` opens it. Both optional and additive
  // (old budgets simply lack them — no migration needed); `soldAmount`
  // without a `soldDate` is meaningless and the validator drops it.
  soldDate?: string; // ISO date of sale — set ⇒ previously owned
  soldAmount?: number; // what the property was sold for
  // Living area of the property, in square metres. Stored as a bare
  // number; the unit it renders with ("kvm" / "sqm") is a global
  // display preference (`Settings.propertySizeUnit`), not stored per
  // property — both labels mean the same square-metre quantity. Absent
  // when the user hasn't recorded a size.
  size?: number;
  // Number of rooms in the property. A bare non-negative count (Sweden
  // counts half-rooms, e.g. 3.5 "rok", so fractional values are allowed).
  // Absent when the user hasn't recorded it. Additive / optional, so old
  // budgets simply lack it — no migration needed.
  rooms?: number;
  // A recurring monthly charge the user pays just to hold the property,
  // separate from any mortgage — the Swedish bostadsrätt "avgift" to the
  // housing association, or an equivalent HOA / service fee. A flat
  // per-month sum in the user's currency, always >= 0. Absent when the
  // user hasn't recorded one. Additive / optional, so old budgets simply
  // lack it — no migration needed.
  fee?: number;
  // The property's share of the housing association's own debt — see
  // `AssociationLoan`. For a Swedish bostadsrätt the förening carries loans
  // whose interest you pay indirectly through your monthly fee; recording it
  // here lets the value chart deduct that hidden interest from the property's
  // apparent gain. Absent until the user records one. Additive / optional, so
  // old budgets simply lack it — no migration needed beyond the version bump.
  associationLoan?: AssociationLoan;
  valueHistory: PropertyValuePoint[];
  mortgages: Mortgage[];
  repairs: PropertyRepair[];
  // Arbitrary files uploaded against the property (photos, documents) — see
  // `PropertyFile`. Starts empty; additive, so old budgets simply lack it
  // and the v68 validator fills `files: []` regardless.
  files: PropertyFile[];
  // The last "Net sale profit" estimate the user configured for this
  // property — the broker model, advertising cost, and the sale price
  // they were experimenting with. Absent until they open the estimator
  // and change something. Repairs and purchase price are NOT stored here:
  // they always prefill live from `repairs` / `purchaseAmount` so the
  // estimate tracks the real data. Optional and additive — old budgets
  // simply lack it; the validator leaves it absent, no migration needed.
  saleEstimate?: PropertySaleEstimate;
};

// A saved "Net sale profit" estimate. `broker` carries the chosen broker
// model and its inputs (see `BrokerCost`). `sellPrice` is the last value
// the user parked the experiment slider on; absent means "default to the
// property's current value on open". `advertisementCost` is the selling
// advert spend (e.g. Hemnet).
export type PropertySaleEstimate = {
  sellPrice?: number;
  advertisementCost?: number;
  broker: BrokerCost;
};
