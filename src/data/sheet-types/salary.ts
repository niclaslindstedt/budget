import { newId } from "../sheet";
import type { SalaryView } from "../types";
import { validateSalaryView } from "../validate/sheet-items";

import type { SheetTypeDescriptor } from "./index";

// The Salary sheet renders the workspace-wide salary history
// (`UserData.salaries` + `UserData.employers`) rather than a
// per-account ledger. `accountId` binds the sheet to the bank account
// the user's pay lands in so "Find salaries" scans that account's
// history directly; nullable until the user picks one.
export function createDefaultSalaryView(
  accountId: string | null = null,
): SalaryView {
  return { id: newId(), type: "salaryView", accountId };
}

export const SALARY_SHEET_DESCRIPTOR: SheetTypeDescriptor = {
  id: "salary",
  label: "Salary",
  description: "See your salary over time, by employer and year.",
  glyph: "banknote",
  createDefaultItem: ({ accountId }) => createDefaultSalaryView(accountId),
  itemTypes: ["salaryView"],
  validate: (raw, path, ctx) => validateSalaryView(raw, path, ctx),
  // No `reduceItem`: salary history is global state mutated by the
  // `createSalary` / `updateSalary` / `deleteSalary` (and employer)
  // actions in `reducers/salary.ts`, not per-item actions routed
  // through the registry tail. And no `rowsForItem`: the collection
  // isn't row-shaped.
};
