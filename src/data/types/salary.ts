import type { CategoryIcon } from "./categories";

// A role (job title) held at an Employer. A salary points at the role it
// was paid under via `Salary.roleId` — so a promotion is a new role the
// later paychecks reference, not a field rewritten on every one. The role
// itself carries no dates: a role's effective span is derived from the
// min/max payment date of the salaries that reference it (see
// `roleDateRange` in `data/salary/salary.ts`).
export type Role = {
  id: string;
  title: string;
};

// A workplace the user has drawn salary from. Lives at the UserData
// level (like Account) so the same employer can be referenced from many
// salaries and the job-change detector can group consecutive paychecks
// under one. `color` / `glyph` are display metadata; `roles` carry the
// titles held there over time.
export type Employer = {
  id: string;
  name: string;
  color?: string;
  glyph?: CategoryIcon;
  roles: Role[];
};

// One salary payment, typically one per month. `net` is the amount that
// actually landed in the bank (netto) — this is what salary detection
// reads off the ledger. `gross` (brutto) is entered by the user, or
// derived from a tax rate in bulk-edit; the absolute tax paid is the
// difference `gross - net`. The absence-day counts explain a paycheck
// that is off the usual average (parental leave, VAB, a sick stretch).
export type Salary = {
  id: string;
  date: string; // ISO payment date — drives the per-year grouping
  net: number; // netto: the bank deposit
  gross?: number; // brutto: entered or derived; tax = gross - net
  // The job title held for this paycheck — a reference into the
  // employer's `roles`. Cleared automatically when the salary's employer
  // changes (a role belongs to exactly one employer), and dropped by the
  // validator if it dangles. Absent means no title recorded.
  roleId?: string;
  employerId?: string; // reference into UserData.employers
  careOfChildDays?: number; // VAB — vård av barn
  parentalLeaveDays?: number;
  vacationDays?: number;
  sickDays?: number;
  note?: string;
  // The budget row this salary was detected from, when added via the
  // "Find salaries" flow. Used to dedupe so the same paycheck isn't
  // offered for adding twice.
  sourceRowId?: string;
  // The bank `HistoryEntry` this salary was discovered from, when added
  // via the explorative "Find salaries" walk that scans an account's
  // imported history. Used to dedupe so the same paycheck isn't offered
  // twice. Mirrors `sourceRowId` for the history-sourced path — at most
  // one of the two is set, depending on which detector produced the
  // candidate. Best-effort: bank entry ids aren't stable across
  // re-imports, so the page pairs this with a month+net dedupe.
  sourceHistoryId?: string;
  // Relative path (inside the active backend's `payslips/` folder) of
  // the single payslip / lönerapport file attached to this salary —
  // proof of the paycheck, kept for the record. Mirrors `Row.receiptPath`
  // on the budget side: encrypted at rest exactly when the budget is,
  // and the file itself does not travel through JSON export / import —
  // only the reference path does. Absent means no payslip.
  payslipPath?: string;
};
