import { describe, expect, it } from "vitest";

import {
  autoTypeForCompany,
  companyTypeSuggestionsFromHints,
  computeCompanyTypeHints,
  computeTypeCompanyHints,
} from "../src/data/budget/company-type-hints";
import { freshUserData } from "../src/storage/local";
import type {
  AccountBudget,
  Company,
  HistoryEntry,
  Row,
  UserData,
} from "../src/data/types";

function row(overrides: Partial<Row>): Row {
  return {
    kind: "user",
    id: overrides.id ?? Math.random().toString(36).slice(2),
    cells: overrides.cells ?? {},
    ...overrides,
  } as Row;
}

function entry(overrides: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    date: overrides.date ?? "2026-05-01",
    description: overrides.description ?? "",
    amount: overrides.amount ?? -100,
    importedAt: overrides.importedAt ?? 1,
    ...overrides,
  };
}

function makeData(opts: {
  rows?: readonly Row[];
  history?: readonly HistoryEntry[];
  companies?: readonly Company[];
}): UserData {
  const base = freshUserData();
  const sheet = base.sheets[0]!;
  const item = sheet.items[0] as AccountBudget;
  const patchedItem: AccountBudget = { ...item, rows: opts.rows ?? [] };
  return {
    ...base,
    companies: [...(opts.companies ?? [])],
    sheets: [{ ...sheet, items: [patchedItem] }],
    history: { acct: [...(opts.history ?? [])] },
  };
}

describe("computeCompanyTypeHints", () => {
  it("returns nothing when no company is paired with a type", () => {
    expect(computeCompanyTypeHints(makeData({})).size).toBe(0);
  });

  it("surfaces a single learned type regardless of count", () => {
    const rows = [row({ companyId: "co_hm", typeId: "t_clothes" })];
    const hints = computeCompanyTypeHints(makeData({ rows }));
    expect(hints.get("co_hm")).toEqual(["t_clothes"]);
  });

  it("ranks multiple learned types by descending usage count", () => {
    const rows = [
      ...Array.from({ length: 3 }, (_, i) =>
        row({ id: `a${i}`, companyId: "co", typeId: "t_a" }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        row({ id: `b${i}`, companyId: "co", typeId: "t_b" }),
      ),
      row({ id: "c0", companyId: "co", typeId: "t_c" }),
    ];
    expect(computeCompanyTypeHints(makeData({ rows })).get("co")).toEqual([
      "t_b",
      "t_a",
      "t_c",
    ]);
  });

  it("ranks manual pins ahead of learned types, in stored order", () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      row({ id: `r${i}`, companyId: "co", typeId: "t_learned" }),
    );
    const companies: Company[] = [
      { id: "co", name: "Co", typeIds: ["t_m1", "t_m2"] },
    ];
    expect(
      computeCompanyTypeHints(makeData({ rows, companies })).get("co"),
    ).toEqual(["t_m1", "t_m2", "t_learned"]);
  });

  it("de-duplicates a learned type that is also pinned manually", () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      row({ id: `r${i}`, companyId: "co", typeId: "t_shared" }),
    );
    const companies: Company[] = [
      { id: "co", name: "Co", typeIds: ["t_shared"] },
    ];
    expect(
      computeCompanyTypeHints(makeData({ rows, companies })).get("co"),
    ).toEqual(["t_shared"]);
  });

  it("caps the ranked list at the maximum", () => {
    const rows = ["t_a", "t_b", "t_c", "t_d", "t_e", "t_f", "t_g"].map(
      (typeId, i) => row({ id: `r${i}`, companyId: "co", typeId }),
    );
    expect(
      computeCompanyTypeHints(makeData({ rows }), 5).get("co"),
    ).toHaveLength(5);
  });

  it("counts history-entry overrides and splits", () => {
    const history = [
      entry({ id: "e0", userCompanyId: "co_ica", userTypeId: "t_food" }),
      entry({
        id: "e1",
        userCompanyId: "co_outer",
        userTypeId: "t_outer",
        splits: [
          {
            description: "",
            amount: -10,
            companyId: "co_split",
            typeId: "t_s",
          },
        ],
      }),
    ];
    const hints = computeCompanyTypeHints(makeData({ history }));
    expect(hints.get("co_ica")).toEqual(["t_food"]);
    expect(hints.get("co_split")).toEqual(["t_s"]);
    // The parent's override is skipped when splits drive presentation.
    expect(hints.has("co_outer")).toBe(false);
  });

  it("ignores a company/type pairing that is missing either side", () => {
    const rows = [
      row({ id: "r0", companyId: "co_hm" }),
      row({ id: "r1", typeId: "t_clothes" }),
    ];
    expect(computeCompanyTypeHints(makeData({ rows })).size).toBe(0);
  });
});

describe("computeTypeCompanyHints", () => {
  it("returns nothing when no type is paired with a company", () => {
    expect(computeTypeCompanyHints(makeData({})).size).toBe(0);
  });

  it("surfaces a single learned company regardless of count", () => {
    const rows = [row({ companyId: "co_hm", typeId: "t_clothes" })];
    const hints = computeTypeCompanyHints(makeData({ rows }));
    expect(hints.get("t_clothes")).toEqual(["co_hm"]);
  });

  it("ranks multiple learned companies by descending usage count", () => {
    const rows = [
      ...Array.from({ length: 3 }, (_, i) =>
        row({ id: `a${i}`, companyId: "co_a", typeId: "t" }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        row({ id: `b${i}`, companyId: "co_b", typeId: "t" }),
      ),
      row({ id: "c0", companyId: "co_c", typeId: "t" }),
    ];
    expect(computeTypeCompanyHints(makeData({ rows })).get("t")).toEqual([
      "co_b",
      "co_a",
      "co_c",
    ]);
  });

  it("caps the ranked list at the maximum", () => {
    const rows = ["c_a", "c_b", "c_c", "c_d", "c_e", "c_f", "c_g"].map(
      (companyId, i) => row({ id: `r${i}`, companyId, typeId: "t" }),
    );
    expect(
      computeTypeCompanyHints(makeData({ rows }), 5).get("t"),
    ).toHaveLength(5);
  });

  it("counts history-entry overrides and splits", () => {
    const history = [
      entry({ id: "e0", userCompanyId: "co_ica", userTypeId: "t_food" }),
      entry({
        id: "e1",
        userCompanyId: "co_outer",
        userTypeId: "t_outer",
        splits: [
          {
            description: "",
            amount: -10,
            companyId: "co_split",
            typeId: "t_s",
          },
        ],
      }),
    ];
    const hints = computeTypeCompanyHints(makeData({ history }));
    expect(hints.get("t_food")).toEqual(["co_ica"]);
    expect(hints.get("t_s")).toEqual(["co_split"]);
    // The parent's override is skipped when splits drive presentation.
    expect(hints.has("t_outer")).toBe(false);
  });

  it("ignores a pairing that is missing either side", () => {
    const rows = [
      row({ id: "r0", companyId: "co_hm" }),
      row({ id: "r1", typeId: "t_clothes" }),
    ];
    expect(computeTypeCompanyHints(makeData({ rows })).size).toBe(0);
  });
});

describe("companyTypeSuggestionsFromHints", () => {
  it("keeps only companies that resolve to exactly one type", () => {
    const hints = new Map<string, readonly string[]>([
      ["co_one", ["t_only"]],
      ["co_many", ["t_a", "t_b"]],
    ]);
    const suggestions = companyTypeSuggestionsFromHints(hints);
    expect(suggestions.get("co_one")).toBe("t_only");
    expect(suggestions.has("co_many")).toBe(false);
  });
});

describe("autoTypeForCompany", () => {
  const suggestions = new Map([["co_hm", "t_clothes"]]);

  it("returns undefined when the user has already pinned a type", () => {
    expect(autoTypeForCompany("t_other", "co_hm", suggestions)).toBeUndefined();
  });

  it("returns undefined when the user is clearing the company", () => {
    expect(autoTypeForCompany(null, null, suggestions)).toBeUndefined();
  });

  it("returns undefined when the company has no confident suggestion", () => {
    expect(autoTypeForCompany(null, "co_unknown", suggestions)).toBeUndefined();
  });

  it("returns the suggested typeId when conditions line up", () => {
    expect(autoTypeForCompany(null, "co_hm", suggestions)).toBe("t_clothes");
  });
});
