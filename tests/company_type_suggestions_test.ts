import { describe, expect, it } from "vitest";

import {
  autoTypeForCompany,
  computeCompanyTypeSuggestions,
} from "../src/data/company-type-suggestions";
import { freshUserData } from "../src/storage/local";
import type {
  AccountBudget,
  HistoryEntry,
  Row,
  UserData,
} from "../src/data/types";

function row(overrides: Partial<Row>): Row {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    cells: overrides.cells ?? {},
    ...overrides,
  };
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
}): UserData {
  const base = freshUserData();
  const sheet = base.sheets[0]!;
  const item = sheet.items[0] as AccountBudget;
  const patchedItem: AccountBudget = { ...item, rows: opts.rows ?? [] };
  return {
    ...base,
    sheets: [{ ...sheet, items: [patchedItem] }],
    history: { acct: [...(opts.history ?? [])] },
  };
}

describe("computeCompanyTypeSuggestions", () => {
  it("returns nothing when no company is paired with a type", () => {
    const data = makeData({});
    expect(computeCompanyTypeSuggestions(data, 10).size).toBe(0);
  });

  it("suggests the type when occurrences meet the threshold", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row({ id: `r${i}`, companyId: "co_hm", typeId: "t_clothes" }),
    );
    const suggestions = computeCompanyTypeSuggestions(makeData({ rows }), 10);
    expect(suggestions.get("co_hm")).toBe("t_clothes");
  });

  it("does not suggest when occurrences fall short of the threshold", () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      row({ id: `r${i}`, companyId: "co_hm", typeId: "t_clothes" }),
    );
    const suggestions = computeCompanyTypeSuggestions(makeData({ rows }), 10);
    expect(suggestions.has("co_hm")).toBe(false);
  });

  it("withholds suggestions for companies paired with multiple types", () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) =>
        row({ id: `a${i}`, companyId: "co_hm", typeId: "t_clothes" }),
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        row({ id: `b${i}`, companyId: "co_hm", typeId: "t_other" }),
      ),
    ];
    const suggestions = computeCompanyTypeSuggestions(makeData({ rows }), 10);
    expect(suggestions.has("co_hm")).toBe(false);
  });

  it("counts history-entry user overrides when no splits exist", () => {
    const history = Array.from({ length: 11 }, (_, i) =>
      entry({
        id: `e${i}`,
        userCompanyId: "co_ica",
        userTypeId: "t_food",
      }),
    );
    const suggestions = computeCompanyTypeSuggestions(
      makeData({ history }),
      10,
    );
    expect(suggestions.get("co_ica")).toBe("t_food");
  });

  it("counts each split independently of the parent entry", () => {
    const history = [
      entry({
        id: "e1",
        userCompanyId: "co_outer",
        userTypeId: "t_outer",
        splits: Array.from({ length: 11 }, () => ({
          description: "",
          amount: -10,
          companyId: "co_split",
          typeId: "t_split",
        })),
      }),
    ];
    const suggestions = computeCompanyTypeSuggestions(
      makeData({ history }),
      10,
    );
    expect(suggestions.get("co_split")).toBe("t_split");
    // The parent's userCompanyId/userTypeId is skipped when splits
    // override the row presentation.
    expect(suggestions.has("co_outer")).toBe(false);
  });

  it("ignores rows that have a company without a type and vice versa", () => {
    const rows = [
      ...Array.from({ length: 11 }, (_, i) =>
        row({ id: `r${i}`, companyId: "co_hm" }),
      ),
      ...Array.from({ length: 11 }, (_, i) =>
        row({ id: `t${i}`, typeId: "t_clothes" }),
      ),
    ];
    const suggestions = computeCompanyTypeSuggestions(makeData({ rows }), 10);
    expect(suggestions.size).toBe(0);
  });

  it("returns an empty map when the threshold is zero (auto-fill disabled)", () => {
    const rows = Array.from({ length: 50 }, (_, i) =>
      row({ id: `r${i}`, companyId: "co_hm", typeId: "t_clothes" }),
    );
    expect(computeCompanyTypeSuggestions(makeData({ rows }), 0).size).toBe(0);
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
