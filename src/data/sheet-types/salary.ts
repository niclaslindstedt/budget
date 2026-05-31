import { newId } from "../sheet";
import type { SalaryView } from "../types";
import { validateSalaryView } from "../validate/sheet-items";

import type { SheetTypeDescriptor } from "./index";

// The Salary sheet renders the workspace-wide salary history
// (`UserData.salaries` + `UserData.employers`) rather than a
// per-account ledger, so the item carries no data of its own today —
// the shape exists so future per-sheet config (default employer
// filter, gross/net toggle, …) lands here without another migration.
// Mirrors `accounts.ts` / `items.ts`.
export function createDefaultSalaryView(): SalaryView {
  return { id: newId(), type: "salaryView" };
}

export const SALARY_SHEET_DESCRIPTOR: SheetTypeDescriptor = {
  id: "salary",
  label: "Salary",
  description: "See your salary over time, by employer and year.",
  glyph: "banknote",
  createDefaultItem: () => createDefaultSalaryView(),
  itemTypes: ["salaryView"],
  validate: (raw, path) => validateSalaryView(raw, path),
  // No `reduceItem`: salary history is global state mutated by the
  // `createSalary` / `updateSalary` / `deleteSalary` (and employer)
  // actions in `reducers/salary.ts`, not per-item actions routed
  // through the registry tail. And no `rowsForItem`: the collection
  // isn't row-shaped.
};
