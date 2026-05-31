import { grossFromNetAndRate } from "../salary/salary";
import type { Action } from "../reducer";
import type { Salary, UserData } from "../types";

// Apply a salary patch, treating an explicit `undefined` value as
// "delete this key" rather than "set the key to undefined" — so
// clearing an optional field (drop the gross, clear an absence count)
// keeps the live salary byte-identical to one reloaded from storage,
// where absent optional fields simply aren't present. Mirrors
// `applyItemPatch` in `reducers/items.ts`.
function applySalaryPatch(
  salary: Salary,
  patch: Partial<Omit<Salary, "id">>,
): Salary {
  const next: Salary = { ...salary };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete next[key as keyof Salary];
    } else {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

// CRUD for the salary history (`UserData.salaries`) and the employer
// registry (`UserData.employers`). Both are entirely user-curated — no
// presets — so there's no preset-immutability guard here. Mirrors the
// account / item CRUD reducers.
export function reduceSalary(state: UserData, action: Action): UserData | null {
  if (action.type === "createSalary") {
    return { ...state, salaries: [...state.salaries, action.salary] };
  }
  if (action.type === "addSalaries") {
    if (action.salaries.length === 0) return state;
    return { ...state, salaries: [...state.salaries, ...action.salaries] };
  }
  if (action.type === "updateSalary") {
    return {
      ...state,
      salaries: state.salaries.map((s) =>
        s.id === action.salaryId ? applySalaryPatch(s, action.patch) : s,
      ),
    };
  }
  if (action.type === "deleteSalary") {
    return {
      ...state,
      salaries: state.salaries.filter((s) => s.id !== action.salaryId),
    };
  }
  if (action.type === "bulkUpdateSalaries") {
    const ids = new Set(action.ids);
    if (ids.size === 0) return state;
    return {
      ...state,
      salaries: state.salaries.map((s) =>
        ids.has(s.id) ? applySalaryPatch(s, action.patch) : s,
      ),
    };
  }
  if (action.type === "bulkSetSalaryTaxRate") {
    const ids = new Set(action.ids);
    if (ids.size === 0) return state;
    return {
      ...state,
      salaries: state.salaries.map((s) =>
        ids.has(s.id)
          ? { ...s, gross: grossFromNetAndRate(s.net, action.rate) }
          : s,
      ),
    };
  }
  if (action.type === "createEmployer") {
    return { ...state, employers: [...state.employers, action.employer] };
  }
  if (action.type === "updateEmployer") {
    return {
      ...state,
      employers: state.employers.map((e) =>
        e.id === action.employerId ? { ...e, ...action.patch } : e,
      ),
    };
  }
  if (action.type === "deleteEmployer") {
    // Cascading detach: clear `employerId` on every salary that
    // referenced this employer so the salaries keep rendering as
    // unassigned rather than dangling. Mirrors `deleteAccount`'s
    // budget-detach pass.
    const id = action.employerId;
    return {
      ...state,
      employers: state.employers.filter((e) => e.id !== id),
      salaries: state.salaries.map((s) => {
        if (s.employerId !== id) return s;
        const { employerId: _drop, ...rest } = s;
        void _drop;
        return rest;
      }),
    };
  }
  return null;
}
