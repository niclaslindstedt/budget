// Pure helpers over the Salary / Employer shapes. No React, no storage —
// just the brutto/netto/tax algebra and the role-title resolution the
// Salary sheet and its modals share.

import type { Employer, Role, Salary } from "../types";

// The built-in "Salary" income entry-type id. Rows carrying it are the
// strongest non-flag signal that an income is a paycheck, so the
// detector scores them highly. Kept as a named constant so a rename of
// the preset slug is a one-line change here.
export const SALARY_TYPE_ID = "preset-type-salary";

// Brutto for a salary. When the user hasn't entered a gross figure the
// net deposit is the best we have, so it doubles as the brutto and the
// implied tax is zero.
export function salaryGross(salary: Salary): number {
  return salary.gross ?? salary.net;
}

// Absolute tax paid: brutto − netto. Zero when no gross is recorded
// (we can't know the tax yet) and clamped at zero so a gross typed
// below the net deposit never shows a negative tax.
export function salaryTax(salary: Salary): number {
  if (salary.gross === undefined) return 0;
  return Math.max(0, salary.gross - salary.net);
}

// Derive the brutto from a net deposit and a tax rate expressed as a
// fraction of the gross (e.g. 0.3 for 30 %). Used by the bulk-edit "set
// tax %" flow (Swedish "skattejämkning"): gross = net / (1 − rate).
// A rate at or above 1 is nonsensical (it would imply zero or negative
// take-home), so the net is returned unchanged in that case.
export function grossFromNetAndRate(net: number, rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 1) return net;
  return Math.round(net / (1 - rate));
}

// Calendar year a salary belongs to — the per-year table grouping key.
export function salaryYear(salary: Salary): string {
  return salary.date.slice(0, 4);
}

// The role active at a given date for an employer: the role whose
// `[startDate, endDate]` window covers `date`. An undefined `startDate`
// means "from the beginning", an undefined `endDate` means "ongoing".
// When several roles overlap the date, the one with the latest start
// wins (the most recent promotion). Returns undefined when no role
// covers the date.
export function roleForDate(
  employer: Employer | undefined,
  date: string,
): Role | undefined {
  if (!employer) return undefined;
  let best: Role | undefined;
  for (const role of employer.roles) {
    if (role.startDate !== undefined && date < role.startDate) continue;
    if (role.endDate !== undefined && date > role.endDate) continue;
    if (best === undefined || (role.startDate ?? "") > (best.startDate ?? "")) {
      best = role;
    }
  }
  return best;
}

// Convenience: the job title to show for a salary, resolved from its
// employer's role covering the payment date.
export function titleForSalary(
  salary: Salary,
  employersById: ReadonlyMap<string, Employer>,
): string | undefined {
  if (!salary.employerId) return undefined;
  const role = roleForDate(employersById.get(salary.employerId), salary.date);
  return role?.title;
}
