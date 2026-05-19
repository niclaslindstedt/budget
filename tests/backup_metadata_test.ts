import { describe, expect, it } from "vitest";

import { createDefaultSheet } from "../src/data/sheet";
import type { AccountBudget, Sheet, UserData } from "../src/data/types";
import {
  describeBackup,
  suggestBackupFilename,
} from "../src/storage/backup-metadata";

function sampleData(): UserData {
  const accountId = "acct-1";
  const sheet = createDefaultSheet("Tests", accountId);
  return {
    accounts: [{ id: accountId, name: "Default" }],
    sheets: [sheet],
  } as unknown as UserData;
}

describe("describeBackup", () => {
  it("counts accounts straight off the accounts array", () => {
    const data = sampleData();
    (data.accounts as unknown as { id: string; name: string }[]).push(
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    );
    const meta = describeBackup(data, {
      filename: "x.json",
      createdAt: 100,
    });
    expect(meta.accountCount).toBe(3);
  });

  it("counts rows across every AccountBudget item on every sheet", () => {
    const data = sampleData();
    const firstBudget = data.sheets[0].items.find(
      (i): i is AccountBudget => i.type === "accountBudget",
    )!;
    firstBudget.rows = [
      { id: "r1", cells: {} },
      { id: "r2", cells: {} },
    ];
    const secondSheet: Sheet = {
      ...data.sheets[0],
      id: "s2",
      name: "Second",
      items: [
        {
          id: "ab2",
          type: "accountBudget",
          accountId: null,
          columns: [],
          rows: [
            { id: "r3", cells: {} },
            { id: "r4", cells: {} },
            { id: "r5", cells: {} },
          ],
        },
      ],
    };
    data.sheets = [...data.sheets, secondSheet];
    const meta = describeBackup(data, {
      filename: "y.json",
      createdAt: 200,
    });
    expect(meta.entryCount).toBe(5);
  });

  it("flags auto-created backups", () => {
    const meta = describeBackup(sampleData(), {
      filename: "auto.json",
      createdAt: 0,
      autoCreated: true,
    });
    expect(meta.autoCreated).toBe(true);
  });
});

describe("suggestBackupFilename", () => {
  it("includes a sortable timestamp segment", () => {
    const filename = suggestBackupFilename(new Date(2026, 4, 19, 14, 30, 5));
    expect(filename).toBe("budget-2026-05-19T14-30-05.json");
  });

  it("prefixes with `auto-` when flagged", () => {
    const filename = suggestBackupFilename(new Date(2026, 4, 19, 14, 30, 5), {
      autoCreated: true,
    });
    expect(filename).toBe("auto-budget-2026-05-19T14-30-05.json");
  });
});
