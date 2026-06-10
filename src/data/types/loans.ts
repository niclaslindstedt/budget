import type { CategoryIcon } from "./categories";

// The Loans sheet tracks money the user owes — a CSN student loan, a car
// loan, a mortgage, money borrowed from a friend. Lives at the `UserData`
// level (like `Property` / `Saving`) so the workspace-wide Loans sheet
// renders the whole collection and per-account roll-ups stay mechanical.

// The flavour of a loan. Drives which lender field the editor collects
// (`personal` → `lenderName`, `private` / `car` → `companyId`) and which
// preset entry type the payment-import candidate scan anchors on — see
// `LOAN_PRESET_TYPE_BY_KIND` in `src/data/loans/presets.ts`.
export type LoanKind = "student" | "mortgage" | "car" | "private" | "personal";

// One recorded payment against a loan. Mirrors `MortgagePayment` so a
// linked mortgage's payments and a simple loan's payments render through
// the same table.
export type LoanPayment = {
  id: string;
  // ISO yyyy-mm-dd the bank charged the payment.
  date: string;
  // Charge magnitude, >= 0 (the bank row's outflow with the sign dropped).
  amount: number;
  // The bank `HistoryEntry` this payment was imported from. Dedupe key for
  // the import-payments modal and the auto-attach pass inside
  // `importBankHistory`; absent on a hand-entered payment.
  sourceHistoryId?: string;
};

// A loan. Deliberately flat rather than a discriminated union: every term
// field is optional so a loan can be created sparse and filled in later
// (mirrors `Mortgage`), and the linked-mortgage flavour simply leaves the
// term fields absent because they resolve live from the linked mortgage.
export type Loan = {
  id: string;
  name: string;
  kind: LoanKind;
  glyph?: CategoryIcon;
  color?: string;
  description?: string;
  // ISO yyyy-mm-dd the loan started (first day interest accrues).
  startDate?: string;
  // Original principal, >= 0.
  startSum?: number;
  // What the user pays per month (amortization + interest), >= 0.
  monthlyPayment?: number;
  // Annual interest rate in percent (e.g. 4.5). Absent ⇒ the remaining
  // balance falls back to startSum + startFee − payments made.
  rate?: number;
  // One-off setup fee ("uppläggningsavgift"), >= 0. Treated as financed
  // into the principal by the balance simulation.
  startFee?: number;
  // kind === "personal": the person the money was borrowed from. Free
  // text rather than a Company — a friend or relative isn't a merchant.
  lenderName?: string;
  // kind === "private" | "car": the lending company
  // (`UserData.companies` id). Dangling reference swept to absent on load.
  companyId?: string;
  // kind === "mortgage", linked flavour: `propertyId` and a non-empty
  // `mortgageIds` are set together or both absent. A property's monthly
  // mortgage cost is paid to the bank as ONE transaction even when it
  // covers several loans, so a single loan row can link any subset of
  // one property's mortgages and list them as one figure. Terms /
  // payments / balance resolve LIVE from the linked mortgages — never
  // copied here, so the Properties sheet stays the single source of
  // truth.
  propertyId?: string;
  mortgageIds?: string[];
  // Recorded payments. Unused for a linked mortgage loan — the mortgage's
  // own `payments[]` is authoritative there.
  payments: LoanPayment[];
  // Normalised bank-description keys (`normaliseDescription`) learned when
  // the user imports payments. Future `importBankHistory` runs auto-attach
  // matching new outflow entries as payments. Absent ⇒ no auto-attach.
  paymentPatterns?: string[];
};
