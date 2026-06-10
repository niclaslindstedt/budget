import { describe, expect, it } from "vitest";

import {
  detectSalaries,
  type DetectionRow,
} from "../src/data/salary/detection";
import {
  averageMonthlyNetAt,
  grossFromNetAndRate,
  roleDateRange,
  roleForSalary,
  salaryGross,
  salaryTax,
} from "../src/data/salary/salary";
import { reducer } from "../src/data/reducer";
import { createDefaultSheet } from "../src/data/sheet";
import {
  countSheetItemRows,
  createDefaultSalaryView,
} from "../src/data/sheet-types";
import { freshUserData } from "../src/storage/local";
import { validateUserData } from "../src/data/validate";
import type { Employer, Salary, UserData } from "../src/data/types";

function withSalarySheet(over: Partial<UserData> = {}): UserData {
  const base = freshUserData();
  const sheet = createDefaultSheet("Pay", null, { type: "salary" });
  return { ...base, sheets: [...base.sheets, sheet], ...over };
}

function row(
  id: string,
  date: string,
  amount: number,
  flags: Partial<Omit<DetectionRow, "rowId" | "date" | "amount">> = {},
): DetectionRow {
  return {
    rowId: id,
    date,
    amount,
    isSalaryType: flags.isSalaryType ?? false,
    isPrimaryIncome: flags.isPrimaryIncome ?? false,
    hasSeriesId: flags.hasSeriesId ?? false,
  };
}

describe("Salary sheet type", () => {
  it("seeds a salaryView item from the registry factory", () => {
    const view = createDefaultSalaryView();
    expect(view.type).toBe("salaryView");
    expect(view.accountId).toBeNull();
    const sheet = createDefaultSheet("Pay", null, { type: "salary" });
    expect(sheet.type).toBe("salary");
    expect(sheet.items[0].type).toBe("salaryView");
  });

  it("binds the salary sheet to an account via createDefaultSheet", () => {
    const view = createDefaultSalaryView("acc-1");
    expect(view.accountId).toBe("acc-1");
    const sheet = createDefaultSheet("Pay", "acc-1", { type: "salary" });
    const item = sheet.items[0];
    expect(item.type).toBe("salaryView");
    if (item.type === "salaryView") expect(item.accountId).toBe("acc-1");
  });

  it("round-trips salaries + employers and drops a dangling employerId", () => {
    const data = withSalarySheet({
      employers: [{ id: "e1", name: "Acme", roles: [] }],
      salaries: [
        {
          id: "s1",
          date: "2026-01-25",
          net: 30000,
          gross: 42000,
          employerId: "e1",
        },
        { id: "s2", date: "2026-02-25", net: 30000, employerId: "ghost" },
      ],
    });
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.salaries).toHaveLength(2);
    // Known employer kept, dangling one dropped.
    expect(result.value.salaries[0].employerId).toBe("e1");
    expect(result.value.salaries[1].employerId).toBeUndefined();
    // Salary data isn't row-shaped, so it doesn't inflate the entry count.
    expect(countSheetItemRows(result.value)).toBe(0);
  });

  it("CRUD + cascade through the reducer", () => {
    let state = withSalarySheet();
    const salary: Salary = { id: "s1", date: "2026-03-25", net: 28000 };
    state = reducer(state, { type: "addSalaries", salaries: [salary] });
    expect(state.salaries).toHaveLength(1);

    state = reducer(state, {
      type: "createEmployer",
      employer: { id: "e1", name: "Acme", roles: [] },
    });
    state = reducer(state, {
      type: "bulkUpdateSalaries",
      ids: ["s1"],
      patch: { employerId: "e1" },
    });
    expect(state.salaries[0].employerId).toBe("e1");

    // Tax rate sets gross from the net deposit: 28000 / (1 - 0.3) = 40000.
    state = reducer(state, {
      type: "bulkSetSalaryTaxRate",
      ids: ["s1"],
      rate: 0.3,
    });
    expect(state.salaries[0].gross).toBe(40000);

    // Deleting the employer detaches the salary rather than removing it.
    state = reducer(state, { type: "deleteEmployer", employerId: "e1" });
    expect(state.employers).toHaveLength(0);
    expect(state.salaries[0].employerId).toBeUndefined();

    state = reducer(state, { type: "deleteSalary", salaryId: "s1" });
    expect(state.salaries).toHaveLength(0);
  });

  it("bulk-sets a job title by minting / reusing an employer role", () => {
    let state = withSalarySheet({
      employers: [{ id: "e1", name: "Acme", roles: [] }],
      salaries: [
        { id: "s1", date: "2026-01-25", net: 30000, employerId: "e1" },
        { id: "s2", date: "2026-02-25", net: 30000, employerId: "e1" },
      ],
    });

    state = reducer(state, {
      type: "bulkSetSalaryRole",
      ids: ["s1", "s2"],
      title: "Developer",
    });
    // One role is minted and both salaries point at it.
    expect(state.employers[0].roles).toHaveLength(1);
    const roleId = state.employers[0].roles[0].id;
    expect(state.employers[0].roles[0].title).toBe("Developer");
    expect(state.salaries[0].roleId).toBe(roleId);
    expect(state.salaries[1].roleId).toBe(roleId);

    // Re-applying the same title (case-insensitive) reuses the role.
    state = reducer(state, {
      type: "bulkSetSalaryRole",
      ids: ["s1"],
      title: "developer",
    });
    expect(state.employers[0].roles).toHaveLength(1);
    expect(state.salaries[0].roleId).toBe(roleId);

    // A blank title clears the role on the selection.
    state = reducer(state, {
      type: "bulkSetSalaryRole",
      ids: ["s1"],
      title: "  ",
    });
    expect(state.salaries[0].roleId).toBeUndefined();
    expect(state.salaries[1].roleId).toBe(roleId);
  });

  it("drops a salary's roleId when its employer changes", () => {
    let state = withSalarySheet({
      employers: [
        { id: "e1", name: "Acme", roles: [{ id: "r1", title: "Dev" }] },
        { id: "e2", name: "Globex", roles: [] },
      ],
      salaries: [
        {
          id: "s1",
          date: "2026-01-25",
          net: 30000,
          employerId: "e1",
          roleId: "r1",
        },
      ],
    });
    state = reducer(state, {
      type: "updateSalary",
      salaryId: "s1",
      patch: { employerId: "e2" },
    });
    expect(state.salaries[0].employerId).toBe("e2");
    // The role belonged to the old employer, so it's dropped.
    expect(state.salaries[0].roleId).toBeUndefined();
  });
});

describe("salary helpers", () => {
  it("derives gross from a net deposit and tax rate", () => {
    expect(grossFromNetAndRate(7000, 0.3)).toBe(10000);
    // Degenerate rates fall back to the net unchanged.
    expect(grossFromNetAndRate(7000, 0)).toBe(7000);
    expect(grossFromNetAndRate(7000, 1)).toBe(7000);
  });

  it("computes gross/tax with and without an entered brutto", () => {
    expect(salaryGross({ id: "a", date: "2026-01-01", net: 7000 })).toBe(7000);
    expect(salaryTax({ id: "a", date: "2026-01-01", net: 7000 })).toBe(0);
    const s: Salary = { id: "a", date: "2026-01-01", net: 7000, gross: 10000 };
    expect(salaryGross(s)).toBe(10000);
    expect(salaryTax(s)).toBe(3000);
  });

  it("resolves the role a salary points at", () => {
    const employer: Employer = {
      id: "e1",
      name: "Acme",
      roles: [
        { id: "r1", title: "Developer" },
        { id: "r2", title: "Lead" },
      ],
    };
    const dev: Salary = {
      id: "s1",
      date: "2021-06-15",
      net: 100,
      roleId: "r1",
    };
    const lead: Salary = {
      id: "s2",
      date: "2024-06-15",
      net: 200,
      roleId: "r2",
    };
    const untitled: Salary = { id: "s3", date: "2019-01-01", net: 50 };
    expect(roleForSalary(dev, employer)?.title).toBe("Developer");
    expect(roleForSalary(lead, employer)?.title).toBe("Lead");
    expect(roleForSalary(untitled, employer)).toBeUndefined();
    expect(roleForSalary(lead, undefined)).toBeUndefined();
    // A dangling reference resolves to nothing.
    expect(roleForSalary({ ...dev, roleId: "gone" }, employer)).toBeUndefined();
  });

  it("derives a role's date span from the salaries referencing it", () => {
    const salaries: Salary[] = [
      { id: "s1", date: "2021-03-15", net: 100, roleId: "r1" },
      { id: "s2", date: "2021-01-15", net: 100, roleId: "r1" },
      { id: "s3", date: "2021-06-15", net: 100, roleId: "r1" },
      { id: "s4", date: "2022-01-15", net: 100, roleId: "r2" },
    ];
    expect(roleDateRange("r1", salaries)).toEqual({
      start: "2021-01-15",
      end: "2021-06-15",
    });
    expect(roleDateRange("r2", salaries)).toEqual({
      start: "2022-01-15",
      end: "2022-01-15",
    });
    expect(roleDateRange("none", salaries)).toBeNull();
  });
});

describe("averageMonthlyNetAt", () => {
  const salary = (id: string, date: string, net: number): Salary => ({
    id,
    date,
    net,
  });

  it("returns null when no salaries exist", () => {
    expect(averageMonthlyNetAt([], "2026-06-15")).toBeNull();
  });

  it("averages over the recorded months on or before the date", () => {
    const salaries = [
      salary("s1", "2026-01-25", 30000),
      salary("s2", "2026-02-25", 30000),
      salary("s3", "2026-03-25", 36000),
    ];
    expect(averageMonthlyNetAt(salaries, "2026-03-31")).toBe(32000);
    // A date mid-history only sees the paychecks up to it.
    expect(averageMonthlyNetAt(salaries, "2026-02-28")).toBe(30000);
  });

  it("sums two paychecks in the same month into one household figure", () => {
    const salaries = [
      salary("s1", "2026-01-25", 30000),
      salary("s2", "2026-01-27", 25000),
    ];
    expect(averageMonthlyNetAt(salaries, "2026-06-15")).toBe(55000);
  });

  it("ignores months without a paycheck instead of diluting the average", () => {
    // January and June recorded, nothing in between — the average is over
    // the two recorded months, not six.
    const salaries = [
      salary("s1", "2026-01-25", 30000),
      salary("s2", "2026-06-25", 40000),
    ];
    expect(averageMonthlyNetAt(salaries, "2026-06-30")).toBe(35000);
  });

  it("only looks at the trailing twelve recorded months", () => {
    const salaries: Salary[] = [salary("old", "2024-01-25", 90000)];
    for (let m = 1; m <= 12; m++) {
      const month = String(m).padStart(2, "0");
      salaries.push(salary(`s-${m}`, `2026-${month}-25`, 30000));
    }
    expect(averageMonthlyNetAt(salaries, "2026-12-31")).toBe(30000);
  });

  it("falls back to the earliest recorded months before the first paycheck", () => {
    const salaries = [
      salary("s1", "2026-01-25", 30000),
      salary("s2", "2026-02-25", 34000),
    ];
    expect(averageMonthlyNetAt(salaries, "2020-05-15")).toBe(32000);
  });

  it("returns null when the window sums to zero", () => {
    expect(
      averageMonthlyNetAt([salary("s1", "2026-01-25", 0)], "2026-06-15"),
    ).toBeNull();
  });
});

describe("salary detection", () => {
  it("prefers recurring income over a bigger one-off in the same month", () => {
    const { candidates } = detectSalaries({
      rows: [
        row("salary", "2026-01-25", 30000, { hasSeriesId: true }),
        row("inheritance", "2026-01-10", 250000),
      ],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].sourceRowId).toBe("salary");
    expect(candidates[0].net).toBe(30000);
  });

  it("ranks a flagged main-salary series highest", () => {
    const { candidates } = detectSalaries({
      rows: [
        row("typed", "2026-01-25", 31000, { isSalaryType: true }),
        row("flagged", "2026-01-20", 30000, {
          isPrimaryIncome: true,
          hasSeriesId: true,
        }),
      ],
    });
    expect(candidates[0].sourceRowId).toBe("flagged");
    expect(candidates[0].confidence).toBeGreaterThan(0.9);
  });

  it("excludes already-added source rows and ignores non-positive amounts", () => {
    const { candidates } = detectSalaries({
      rows: [
        row("a", "2026-01-25", 30000, { hasSeriesId: true }),
        row("b", "2026-02-25", -500),
      ],
      excludeSourceRowIds: new Set(["a"]),
    });
    expect(candidates).toHaveLength(0);
  });

  it("flags a sustained salary change as a new employer group", () => {
    const rows: DetectionRow[] = [];
    for (let m = 1; m <= 6; m++)
      rows.push(row(`old-${m}`, `2026-0${m}-25`, 30000, { hasSeriesId: true }));
    // Three sustained months at the new level → a job change.
    rows.push(row("new-1", "2026-07-25", 35000, { hasSeriesId: true }));
    rows.push(row("new-2", "2026-08-25", 35000, { hasSeriesId: true }));
    rows.push(row("new-3", "2026-09-25", 35000, { hasSeriesId: true }));
    const { candidates, boundaries } = detectSalaries({ rows });
    expect(candidates).toHaveLength(9);
    expect(boundaries).toEqual([0, 6]);
    expect(candidates[6].employerGroup).toBe(1);
  });

  it("treats a single off-average month as a blip, not a job change", () => {
    const rows: DetectionRow[] = [];
    for (let m = 1; m <= 5; m++)
      rows.push(row(`r-${m}`, `2026-0${m}-25`, 30000, { hasSeriesId: true }));
    // One fat bonus month, then back to normal — must stay one group.
    rows[2] = row("r-3", "2026-03-25", 60000, { hasSeriesId: true });
    const { boundaries } = detectSalaries({ rows });
    expect(boundaries).toEqual([0]);
  });
});
