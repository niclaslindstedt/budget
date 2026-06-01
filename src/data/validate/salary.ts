import type { CategoryIcon, Employer, Role, Salary } from "../types";
import { CATEGORY_ICONS, fail, isObject, type Result } from "./helpers";

// ISO yyyy-mm-dd shape check shared by salary `date` and role
// start/end dates. Lenient on the tail so a stored timestamp
// (yyyy-mm-ddThh:…) still passes — the date prefix is all the salary
// surfaces read.
function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// A non-negative whole-day count (absence days). Negatives and
// fractions are dropped rather than rejecting the whole file.
function isDayCount(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function validateRole(raw: unknown): Role | null {
  if (!isObject(raw)) return null;
  const { id, title } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (typeof title !== "string") return null;
  const role: Role = { id, title };
  if (isIsoDate(raw.startDate)) role.startDate = raw.startDate;
  if (isIsoDate(raw.endDate)) role.endDate = raw.endDate;
  return role;
}

export function validateEmployer(raw: unknown, path: string): Result<Employer> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  const employer: Employer = { id, name, roles: [] };
  if (typeof raw.color === "string" && raw.color.length > 0)
    employer.color = raw.color;
  if (
    typeof raw.glyph === "string" &&
    CATEGORY_ICONS.has(raw.glyph as CategoryIcon)
  ) {
    employer.glyph = raw.glyph as CategoryIcon;
  }
  // Roles are advisory display metadata — drop a malformed one rather
  // than rejecting the whole employer, mirroring how line-item links
  // and tags are swept elsewhere.
  if (Array.isArray(raw.roles)) {
    const seen = new Set<string>();
    for (const rawRole of raw.roles) {
      const role = validateRole(rawRole);
      if (!role || seen.has(role.id)) continue;
      seen.add(role.id);
      employer.roles.push(role);
    }
  }
  return { ok: true, value: employer };
}

// Validate one Salary. `knownEmployerIds` drops a dangling
// `employerId` (a deleted employer) silently — the salary stays, just
// unassigned — mirroring how dangling type / company references are
// swept on budget rows.
export function validateSalary(
  raw: unknown,
  path: string,
  knownEmployerIds: ReadonlySet<string>,
): Result<Salary> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, date, net } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (!isIsoDate(date))
    return fail(`${path}.date`, "expected an ISO yyyy-mm-dd string");
  if (!isFiniteNumber(net))
    return fail(`${path}.net`, "expected a finite number");
  const salary: Salary = { id, date, net };
  if (isFiniteNumber(raw.gross)) salary.gross = raw.gross;
  if (
    typeof raw.employerId === "string" &&
    raw.employerId !== "" &&
    knownEmployerIds.has(raw.employerId)
  ) {
    salary.employerId = raw.employerId;
  }
  if (isDayCount(raw.careOfChildDays))
    salary.careOfChildDays = raw.careOfChildDays;
  if (isDayCount(raw.parentalLeaveDays))
    salary.parentalLeaveDays = raw.parentalLeaveDays;
  if (isDayCount(raw.vacationDays)) salary.vacationDays = raw.vacationDays;
  if (isDayCount(raw.sickDays)) salary.sickDays = raw.sickDays;
  if (typeof raw.note === "string" && raw.note !== "") salary.note = raw.note;
  if (typeof raw.sourceRowId === "string" && raw.sourceRowId !== "")
    salary.sourceRowId = raw.sourceRowId;
  if (typeof raw.sourceHistoryId === "string" && raw.sourceHistoryId !== "")
    salary.sourceHistoryId = raw.sourceHistoryId;
  return { ok: true, value: salary };
}
