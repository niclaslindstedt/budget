import { findRoleByTitle, grossFromNetAndRate } from "../salary/salary";
import { newId } from "../sheet";
import type { Action } from "../reducer";
import type { Employer, Role, Salary, UserData } from "../types";

// Apply a salary patch, treating an explicit `undefined` value as
// "delete this key" rather than "set the key to undefined" — so
// clearing an optional field (drop the gross, clear an absence count)
// keeps the live salary byte-identical to one reloaded from storage,
// where absent optional fields simply aren't present. Mirrors
// `applyItemPatch` in `reducers/items.ts`.
//
// Invariant: a `roleId` belongs to the salary's employer, so changing
// `employerId` (when the patch doesn't itself set a `roleId`) drops the
// now-orphaned role reference rather than leaving it dangling.
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
  if (
    "employerId" in patch &&
    patch.employerId !== salary.employerId &&
    !("roleId" in patch)
  ) {
    delete next.roleId;
  }
  return next;
}

// CRUD for the salary history (`UserData.salaries`) and the employer
// registry (`UserData.employers`). Both are entirely user-curated — no
// presets — so there's no preset-immutability guard here. Mirrors the
// account / item CRUD reducers.
export function reduceSalary(state: UserData, action: Action): UserData | null {
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
  if (action.type === "bulkSetSalaryRole") {
    const ids = new Set(action.ids);
    if (ids.size === 0) return state;
    const title = action.title.trim();

    // Clearing the title: drop `roleId` on every selected salary, no
    // employer touched.
    if (title === "") {
      return {
        ...state,
        salaries: state.salaries.map((s) =>
          ids.has(s.id) ? applySalaryPatch(s, { roleId: undefined }) : s,
        ),
      };
    }

    // For each distinct employer in the selection, reuse a matching role
    // or mint one. `roleByEmployer` records the resolved role id so every
    // selected salary on that employer points at the same role.
    const employersById = new Map(state.employers.map((e) => [e.id, e]));
    const roleByEmployer = new Map<string, string>();
    const newRoles = new Map<string, Role[]>();
    for (const s of state.salaries) {
      if (!ids.has(s.id) || s.employerId === undefined) continue;
      if (roleByEmployer.has(s.employerId)) continue;
      const employer = employersById.get(s.employerId);
      if (!employer) continue;
      const existing = findRoleByTitle(employer, title);
      if (existing) {
        roleByEmployer.set(s.employerId, existing.id);
      } else {
        const role: Role = { id: newId(), title };
        roleByEmployer.set(s.employerId, role.id);
        newRoles.set(s.employerId, [...employer.roles, role]);
      }
    }

    const employers: Employer[] =
      newRoles.size === 0
        ? state.employers
        : state.employers.map((e) =>
            newRoles.has(e.id) ? { ...e, roles: newRoles.get(e.id)! } : e,
          );

    return {
      ...state,
      employers,
      salaries: state.salaries.map((s) => {
        if (!ids.has(s.id) || s.employerId === undefined) return s;
        const roleId = roleByEmployer.get(s.employerId);
        return roleId === undefined ? s : applySalaryPatch(s, { roleId });
      }),
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
  if (action.type === "createTaxProfile") {
    return { ...state, taxProfiles: [...state.taxProfiles, action.profile] };
  }
  if (action.type === "updateTaxProfile") {
    return {
      ...state,
      taxProfiles: state.taxProfiles.map((p) =>
        p.id === action.profileId ? { ...p, ...action.patch } : p,
      ),
    };
  }
  if (action.type === "deleteTaxProfile") {
    // Cascading detach: drop `taxProfileId` on every salary sheet's
    // `salaryView` item that referenced this profile so the sheets keep
    // rendering (they just stop estimating gross) rather than dangling.
    // Mirrors `deleteEmployer`'s salary-detach pass.
    const id = action.profileId;
    return {
      ...state,
      taxProfiles: state.taxProfiles.filter((p) => p.id !== id),
      sheets: state.sheets.map((sheet) => {
        let changed = false;
        const items = sheet.items.map((item) => {
          if (item.type !== "salaryView" || item.taxProfileId !== id)
            return item;
          changed = true;
          const { taxProfileId: _drop, ...rest } = item;
          void _drop;
          return rest;
        });
        return changed ? { ...sheet, items } : sheet;
      }),
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
