import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v62 → v63 step merges the two mortgage preset types into one. It
// remaps every stored reference to `preset-type-mortgage-interest` onto the
// surviving `preset-type-mortgage`, and collapses each mortgage payment's
// `principal` + `interest` legs into a single `amount`.
const OLD = "preset-type-mortgage-interest";
const NEW = "preset-type-mortgage";

type AnyRecord = Record<string, unknown>;

function migrated(extra: AnyRecord): AnyRecord {
  const result = migrate({
    version: 62,
    sheets: [
      {
        id: "sh1",
        type: "budget",
        items: [
          {
            type: "accountBudget",
            rows: [
              { id: "r1", typeId: OLD },
              { id: "r2", typeId: "preset-type-rent" },
            ],
          },
        ],
      },
    ],
    activeSheetId: "sh1",
    accounts: [],
    ...extra,
  });
  return result.data as AnyRecord;
}

describe("migration v62 → v63 (merge mortgage types + flatten payments)", () => {
  it("remaps the interest type id across rows, hints, rules, and companies", () => {
    const data = migrated({
      history: {
        a1: [{ id: "h1", date: "2023-01-01", amount: -1, userTypeId: OLD }],
      },
      transfers: [{ id: "t1", typeId: OLD }],
      matchRules: [{ id: "m1", typeId: OLD }],
      merchantHints: { "*bank*": { typeId: OLD, hitCount: 1, lastUsedAt: 0 } },
      companies: [{ id: "co1", name: "SBAB", typeIds: [OLD, NEW] }],
      subtypes: [{ id: "su1", name: "x", typeId: OLD }],
      hiddenPresetTypeIds: [OLD, NEW],
      presetTypeKindOverrides: { [OLD]: "expense" },
      settings: { itemFindTypeIds: [OLD] },
    });

    expect(data.version).toBe(LATEST_VERSION);
    const sheets = data.sheets as Array<{
      items: Array<{ rows: Array<{ typeId?: string }> }>;
    }>;
    expect(sheets[0].items[0].rows[0].typeId).toBe(NEW);

    const history = data.history as Record<
      string,
      Array<{ userTypeId?: string }>
    >;
    expect(history.a1[0].userTypeId).toBe(NEW);

    expect((data.transfers as Array<{ typeId?: string }>)[0].typeId).toBe(NEW);
    expect((data.matchRules as Array<{ typeId?: string }>)[0].typeId).toBe(NEW);
    expect(
      (data.merchantHints as Record<string, { typeId?: string }>)["*bank*"]
        .typeId,
    ).toBe(NEW);

    // The duplicate (both old + new pinned) collapses to a single entry.
    const companies = data.companies as Array<{ typeIds?: string[] }>;
    expect(companies[0].typeIds).toEqual([NEW]);
    expect((data.subtypes as Array<{ typeId?: string }>)[0].typeId).toBe(NEW);

    expect(data.hiddenPresetTypeIds).toEqual([NEW]);
    expect(data.presetTypeKindOverrides).toEqual({});
    expect(
      (data.settings as { itemFindTypeIds: string[] }).itemFindTypeIds,
    ).toEqual([NEW]);
  });

  it("collapses each payment's principal + interest into one amount", () => {
    const data = migrated({
      properties: [
        {
          id: "p1",
          name: "Home",
          valueHistory: [],
          mortgages: [
            {
              id: "mo1",
              name: "Loan",
              payments: [
                {
                  id: "pay1",
                  date: "2023-01-28",
                  principal: 8000,
                  interest: 4000,
                  sourceHistoryId: "h1",
                  interestSourceHistoryId: "h2",
                },
              ],
            },
          ],
        },
      ],
    });

    const properties = data.properties as Array<{
      mortgages: Array<{ payments: Array<Record<string, unknown>> }>;
    }>;
    const payment = properties[0].mortgages[0].payments[0];
    expect(payment.amount).toBe(12000);
    expect(payment.sourceHistoryId).toBe("h1");
    expect("principal" in payment).toBe(false);
    expect("interest" in payment).toBe(false);
    expect("interestSourceHistoryId" in payment).toBe(false);
  });
});
