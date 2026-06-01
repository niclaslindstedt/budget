import type { CategoryIcon } from "./categories";

// A role (job title) held at an Employer over a date range. A salary's
// displayed title is resolved by finding the role whose
// `[startDate, endDate]` window covers the salary's payment date — so a
// promotion is a new role rather than a field rewritten on every
// paycheck. Both dates are optional: an undefined `startDate` means
// "from the beginning of time", an undefined `endDate` means "still
// ongoing".
export type Role = {
  id: string;
  title: string;
  startDate?: string; // ISO yyyy-mm-dd
  endDate?: string; // ISO yyyy-mm-dd
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
};
