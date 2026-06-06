import { describe, expect, it } from "vitest";

import {
  findRepairCandidates,
  resolveRepairSourceRows,
} from "../src/data/property-repairs/candidates";
import { freshUserData } from "../src/storage/local";
import type { HistoryEntry, UserData } from "../src/data/types";

const REPAIRS = "preset-type-repairs";
const RENOVATIONS = "preset-type-renovations";

function entry(over: Partial<HistoryEntry> & { id: string }): HistoryEntry {
  return {
    date: "2026-01-20",
    description: "Charge",
    amount: -1000,
    importedAt: 0,
    ...over,
  };
}

function withHistory(entries: HistoryEntry[]): UserData {
  return { ...freshUserData(), history: { a1: entries } };
}

describe("findRepairCandidates", () => {
  it("surfaces Repairs / Renovations outflows and skips everything else", () => {
    const data = withHistory([
      entry({ id: "repair", userTypeId: REPAIRS, description: "Plumber" }),
      entry({ id: "reno", userTypeId: RENOVATIONS, description: "Paint" }),
      entry({ id: "groceries", userTypeId: "preset-type-groceries" }),
      entry({ id: "untyped" }),
      // An inflow tagged Repairs is still not a cost — skipped.
      entry({ id: "refund", userTypeId: REPAIRS, amount: 500 }),
      // Hidden / collapsed charges never surface.
      entry({ id: "hidden", userTypeId: REPAIRS, hidden: true }),
      entry({
        id: "collapsed",
        userTypeId: REPAIRS,
        collapsedIntoTransferId: "x",
      }),
    ]);

    const ids = findRepairCandidates(data).map((c) => c.entryId);
    expect(ids.sort()).toEqual(["reno", "repair"]);
  });

  it("reports magnitude, type, and receipt status", () => {
    const data = withHistory([
      entry({
        id: "h1",
        userTypeId: REPAIRS,
        description: "Plumber",
        amount: -6800,
        receiptPath: "receipts/plumber.pdf",
      }),
    ]);
    const [candidate] = findRepairCandidates(data);
    expect(candidate).toMatchObject({
      accountId: "a1",
      entryId: "h1",
      amount: 6800,
      description: "Plumber",
      typeId: REPAIRS,
      hasReceipt: true,
    });
  });

  it("excludes a charge already bound to any property's repairs", () => {
    const base = withHistory([
      entry({ id: "used", userTypeId: REPAIRS }),
      entry({ id: "free", userTypeId: REPAIRS }),
    ]);
    const data: UserData = {
      ...base,
      properties: [
        {
          id: "p1",
          name: "Cabin",
          valueHistory: [],
          mortgages: [],
          repairs: [
            {
              id: "r1",
              date: "2026-01-20",
              amount: 1000,
              description: "Plumber",
              typeId: REPAIRS,
              accountId: "a1",
              sourceHistoryId: "used",
            },
          ],
        },
      ],
    };
    const ids = findRepairCandidates(data).map((c) => c.entryId);
    expect(ids).toEqual(["free"]);
  });

  it("excludes a charge bound as an additional source of a repair", () => {
    const base = withHistory([
      entry({ id: "primary", userTypeId: REPAIRS }),
      entry({ id: "extra", userTypeId: REPAIRS }),
      entry({ id: "free", userTypeId: REPAIRS }),
    ]);
    const data: UserData = {
      ...base,
      properties: [
        {
          id: "p1",
          name: "Cabin",
          valueHistory: [],
          mortgages: [],
          repairs: [
            {
              id: "r1",
              date: "2026-01-20",
              amount: 2000,
              description: "Kitchen invoice",
              typeId: REPAIRS,
              accountId: "a1",
              sourceHistoryId: "primary",
              additionalSources: [{ accountId: "a1", entryId: "extra" }],
            },
          ],
        },
      ],
    };
    const ids = findRepairCandidates(data).map((c) => c.entryId);
    expect(ids).toEqual(["free"]);
  });
});

describe("resolveRepairSourceRows", () => {
  it("resolves a repair's own sources, primary first, skipping gone entries", () => {
    const base = withHistory([
      entry({ id: "primary", userTypeId: REPAIRS, amount: -1500 }),
      entry({ id: "extra", userTypeId: REPAIRS, amount: -500 }),
    ]);
    const data: UserData = {
      ...base,
      properties: [
        {
          id: "p1",
          name: "Cabin",
          valueHistory: [],
          mortgages: [],
          repairs: [
            {
              id: "r1",
              date: "2026-01-20",
              amount: 2000,
              description: "Kitchen invoice",
              typeId: REPAIRS,
              accountId: "a1",
              sourceHistoryId: "primary",
              additionalSources: [
                { accountId: "a1", entryId: "extra" },
                // A source whose entry is gone (re-import) is omitted.
                { accountId: "a1", entryId: "vanished" },
              ],
            },
          ],
        },
      ],
    };
    const rows = resolveRepairSourceRows(data, data.properties[0].repairs[0]);
    expect(rows.map((r) => r.entryId)).toEqual(["primary", "extra"]);
    expect(rows[0].amount).toBe(1500);
    expect(rows[1].amount).toBe(500);
  });
});
