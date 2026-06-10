// Pure helpers over the Salary / Employer shapes. No React, no storage —
// just the brutto/netto/tax algebra and the role-title resolution the
// Salary sheet and its modals share.

import { grossFromNetMonthly } from "../tax/engine";
import type { Employer, Role, Salary, TaxParams } from "../types";

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

// The gross to display for a salary plus whether it's an estimate. An
// entered gross always wins (the user's number is authoritative); when
// it's absent and a tax profile is bound, the gross is back-calculated
// from the net deposit using that profile's rules for the paycheck's
// own tax year (so a 2023 paycheck uses 2023 rules). With no profile we
// fall back to the net deposit, the pre-tax-calc behaviour. `params` is
// the resolved profile's `TaxParams`, or null when the sheet has no
// profile bound.
export function resolveSalaryGross(
  salary: Salary,
  params: TaxParams | null,
): { gross: number; estimated: boolean } {
  if (salary.gross !== undefined)
    return { gross: salary.gross, estimated: false };
  if (params) {
    const year = Number(salary.date.slice(0, 4));
    const { grossMonthly } = grossFromNetMonthly(salary.net, params, year);
    return { gross: Math.round(grossMonthly), estimated: true };
  }
  return { gross: salary.net, estimated: false };
}

// The tax + gross to display, estimate-aware. Tax is always gross − net
// (clamped at zero), matching `salaryTax`'s contract — for an estimated
// gross this is the estimated withholding.
export function resolveSalary(
  salary: Salary,
  params: TaxParams | null,
): { gross: number; tax: number; estimated: boolean } {
  const { gross, estimated } = resolveSalaryGross(salary, params);
  return { gross, tax: Math.max(0, gross - salary.net), estimated };
}

// Average monthly net household income effective at `date`. Paychecks
// are summed per calendar month (`UserData.salaries` is one shared
// collection, so two earners' deposits in the same month add up to the
// household figure), then averaged over the up-to-12 most recent months
// with at least one paycheck on or before `date`. Averaging over
// recorded months only — not the full trailing year — keeps a sparse
// history honest: one recorded month IS the figure, not 1/12 of it.
// A `date` before the first paycheck falls back to the earliest
// recorded months, so a chart whose x range starts before the salary
// history still gets a defined divisor. Returns null when no salaries
// exist or the window sums to zero (nothing meaningful to divide by).
export function averageMonthlyNetAt(
  salaries: readonly Salary[],
  date: string,
): number | null {
  if (salaries.length === 0) return null;
  const netByMonth = new Map<string, number>();
  for (const salary of salaries) {
    const month = salary.date.slice(0, 7);
    netByMonth.set(month, (netByMonth.get(month) ?? 0) + salary.net);
  }
  const months = [...netByMonth.keys()].sort();
  const cutoff = date.slice(0, 7);
  let end = months.length;
  while (end > 0 && months[end - 1] > cutoff) end -= 1;
  const window =
    end === 0 ? months.slice(0, 12) : months.slice(Math.max(0, end - 12), end);
  let sum = 0;
  for (const month of window) sum += netByMonth.get(month) ?? 0;
  if (sum <= 0) return null;
  return sum / window.length;
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

// The role a salary was paid under: the entry in its employer's `roles`
// matching `salary.roleId`. Returns undefined when the salary has no
// role pinned, no employer, or the reference dangles.
export function roleForSalary(
  salary: Salary,
  employer: Employer | undefined,
): Role | undefined {
  if (!employer || salary.roleId === undefined) return undefined;
  return employer.roles.find((r) => r.id === salary.roleId);
}

// Convenience: the job title to show for a salary, resolved from its
// employer's pinned role.
export function titleForSalary(
  salary: Salary,
  employersById: ReadonlyMap<string, Employer>,
): string | undefined {
  if (!salary.employerId) return undefined;
  return roleForSalary(salary, employersById.get(salary.employerId))?.title;
}

// The effective date span of a role, derived from the salaries that
// reference it: the earliest and latest payment date among them. Returns
// null when no salary points at the role (a freshly-added title not yet
// assigned to any paycheck). ISO `start`/`end` may be equal (one salary).
export function roleDateRange(
  roleId: string,
  salaries: readonly Salary[],
): { start: string; end: string } | null {
  let start: string | undefined;
  let end: string | undefined;
  for (const s of salaries) {
    if (s.roleId !== roleId) continue;
    if (start === undefined || s.date < start) start = s.date;
    if (end === undefined || s.date > end) end = s.date;
  }
  if (start === undefined || end === undefined) return null;
  return { start, end };
}

// Find an existing role on `employer` whose title matches `title`
// (trimmed, case-insensitive), or undefined when none does. Used by the
// bulk "set job title" flow to reuse a role instead of spawning a
// duplicate every time the same title is applied.
export function findRoleByTitle(
  employer: Employer,
  title: string,
): Role | undefined {
  const needle = title.trim().toLowerCase();
  return employer.roles.find((r) => r.title.trim().toLowerCase() === needle);
}
