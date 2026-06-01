import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v59 → v60 step moves the job title from a date-windowed role lookup
// to an explicit `Salary.roleId`, and strips the dates off `Role`. The
// migration resolves each salary's covering role one last time with the
// old rule, pins it as `roleId`, and drops `startDate` / `endDate`.
describe("migration v59 → latest (salary roleId)", () => {
  function v59() {
    return {
      version: 59,
      sheets: [],
      activeSheetId: "s",
      accounts: [],
      taxProfiles: [],
      employers: [
        {
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
        },
      ],
      salaries: [
        { id: "s1", date: "2021-06-15", net: 100, employerId: "e1" },
        { id: "s2", date: "2024-06-15", net: 200, employerId: "e1" },
        // Falls outside every role window → no title.
        { id: "s3", date: "2019-06-15", net: 50, employerId: "e1" },
        // No employer → no role.
        { id: "s4", date: "2024-06-15", net: 75 },
      ],
    };
  }

  it("pins each salary's covering role and drops role dates", () => {
    const result = migrate(v59());
    expect(result.migrated).toBe(true);
    const data = result.data as {
      version: number;
      employers: { roles: Record<string, unknown>[] }[];
      salaries: { id: string; roleId?: string }[];
    };
    expect(data.version).toBe(LATEST_VERSION);

    const byId = Object.fromEntries(data.salaries.map((s) => [s.id, s]));
    expect(byId.s1.roleId).toBe("r1");
    expect(byId.s2.roleId).toBe("r2");
    expect(byId.s3.roleId).toBeUndefined();
    expect(byId.s4.roleId).toBeUndefined();

    // Roles keep id + title but shed their dates.
    for (const role of data.employers[0].roles) {
      expect(role).not.toHaveProperty("startDate");
      expect(role).not.toHaveProperty("endDate");
      expect(typeof role.id).toBe("string");
      expect(typeof role.title).toBe("string");
    }
  });
});
