import { extensionOf, sanitizeSegment } from "../items/receipt-name";

export { extensionOf };

export type BuildPayslipPathOpts = {
  // The salary's employer name — the primary token. The caller resolves
  // it from `Salary.employerId`; an unassigned salary falls back to
  // `fallbackLabel`.
  employerName?: string;
  // i18n fallback name when the salary has no employer (e.g. "Payslip").
  fallbackLabel: string;
  // The salary's pay month as `YYYY-MM` (from `Salary.date.slice(0, 7)`).
  month: string;
  // The salary id, used only to disambiguate a name collision with
  // another salary's payslip.
  salaryId: string;
  // Lower-case extension without the dot (from `extensionOf`). "" omits
  // the extension entirely.
  extension: string;
  // The payslip paths already used by OTHER salaries, so a duplicate
  // name gets an id suffix rather than overwriting an unrelated file.
  usedPaths: ReadonlySet<string>;
};

// Build the flat relative payslip path (inside the backend's `payslips/`
// folder) for a salary: `<Employer or fallback> - <YYYY-MM>.<ext>`.
// Unlike receipts there is no subdirectory — payslips are a flat list.
// A short id suffix is appended when the name would collide with another
// salary's payslip so two paychecks in the same employer-month never
// fight over one file. Mirrors `buildReceiptPath` in
// `src/data/items/receipt-name.ts`.
export function buildPayslipPath(opts: BuildPayslipPathOpts): string {
  const { employerName, fallbackLabel, month, salaryId, extension, usedPaths } =
    opts;

  const name = sanitizeSegment(employerName ?? "") || fallbackLabel;
  const ym = sanitizeSegment(month);
  const ext = extension ? `.${extension}` : "";

  const stem = `${name} - ${ym}`;
  const candidate = `${stem}${ext}`;
  if (usedPaths.has(candidate)) {
    return `${stem} (${salaryId.slice(0, 6)})${ext}`;
  }
  return candidate;
}
