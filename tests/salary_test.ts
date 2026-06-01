import { describe, expect, it } from "vitest";

import {
  detectSalaries,
  type DetectionRow,
} from "../src/data/salary/detection";
import {
  grossFromNetAndRate,
  roleForDate,
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

  it("resolves the role covering a date", () => {
    const employer: Employer = {
      id: "e1",
      name: "Acme",
      roles: [
        {
          id: "r1",
          title: "Developer",
          startDate: "2020-01-01",
          endDate: "2022-12-31",
        },
        { id: "r2", title: "Lead", startDate: "2023-01-01" },
      ],
    };
    expect(roleForDate(employer, "2021-06-15")?.title).toBe("Developer");
    expect(roleForDate(employer, "2024-06-15")?.title).toBe("Lead");
    expect(roleForDate(employer, "2019-01-01")).toBeUndefined();
    expect(roleForDate(undefined, "2024-06-15")).toBeUndefined();
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
