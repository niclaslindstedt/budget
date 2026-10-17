import { describe, expect, it } from "vitest";

import {
  computeCompanyTypeAmountModel,
  createCompanyTypeHintLookup,
  createCompanyTypeSuggestionLookup,
  predictTypeForAmount,
  rankTypesForAmount,
  scoreTypesForAmount,
} from "../src/data/company-type-amounts";
import { autoTypeForCompany } from "../src/data/company-type-hints";
import { findColumnByType } from "../src/data/sheet";
import { freshUserData } from "../src/storage/local";
import type {
  AccountBudget,
  HistoryEntry,
  Row,
  UserData,
} from "../src/data/types";

function entry(overrides: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    date: overrides.date ?? "2026-05-01",
    description: overrides.description ?? "STORE",
    amount: overrides.amount ?? -100,
    importedAt: overrides.importedAt ?? 1,
    ...overrides,
  };
}

function makeData(opts: {
  rows?: (amountColId: string) => readonly Row[];
  history?: readonly HistoryEntry[];
}): UserData {
  const base = freshUserData();
  const sheet = base.sheets[0]!;
  const item = sheet.items[0] as AccountBudget;
  const amountColId = findColumnByType(item.columns, "amount")!.id;
  const patchedItem: AccountBudget = {
    ...item,
    rows: opts.rows ? opts.rows(amountColId) : [],
  };
  return {
    ...base,
    sheets: [{ ...sheet, items: [patchedItem] }],
    history: { acct: [...(opts.history ?? [])] },
  };
}

// A grocery store: big weekly shops filed as groceries, small top-ups
// filed as snacks.
const groceryHistory: HistoryEntry[] = [
  ...[-450, -620, -380, -910, -520, -300, -700].map((amount) =>
    entry({ amount, userCompanyId: "co_store", userTypeId: "t_groceries" }),
  ),
  ...[-35, -49, -62, -28, -55].map((amount) =>
    entry({ amount, userCompanyId: "co_store", userTypeId: "t_snacks" }),
  ),
];

describe("computeCompanyTypeAmountModel", () => {
  it("collects signed amounts per (company, type) from every source", () => {
    const data = makeData({
      rows: (amountColId) => [
        {
          kind: "user",
          id: "r1",
          cells: { [amountColId]: -120 },
          companyId: "co",
          typeId: "t_a",
        } as Row,
        // No amount → skipped.
        {
          kind: "user",
          id: "r2",
          cells: {},
          companyId: "co",
          typeId: "t_a",
        } as Row,
      ],
      history: [
        entry({ amount: -40, userCompanyId: "co", userTypeId: "t_b" }),
        entry({
          amount: -100,
          splits: [
            {
              id: "s1",
              description: "",
              amount: -70,
              companyId: "co",
              typeId: "t_a",
            },
            { id: "s2", description: "", amount: -30, typeId: "t_b" },
          ],
        }),
      ],
    });
    const model = computeCompanyTypeAmountModel(data);
    expect(model.get("co")?.get("t_a")).toEqual([-120, -70]);
    expect(model.get("co")?.get("t_b")).toEqual([-40]);
  });
});

describe("scoreTypesForAmount", () => {
  it("ignores samples of the opposite sign", () => {
    const samples = new Map([
      ["t_refund", [50, 60]],
      ["t_buy", [-50]],
    ]);
    const scores = scoreTypesForAmount(samples, -55);
    expect(scores.has("t_refund")).toBe(false);
    expect(scores.get("t_buy")).toBeGreaterThan(0.9);
  });

  it("returns nothing for a zero amount", () => {
    expect(scoreTypesForAmount(new Map([["t", [-10]]]), 0).size).toBe(0);
  });
});

describe("rankTypesForAmount", () => {
  const model = computeCompanyTypeAmountModel(
    makeData({ history: groceryHistory }),
  );
  const samples = model.get("co_store");
  // Usage order: groceries (7 uses) ahead of snacks (5).
  const base = ["t_groceries", "t_snacks"];

  it("puts the small-purchase type first for a small amount", () => {
    expect(rankTypesForAmount(base, samples, -45)).toEqual([
      "t_snacks",
      "t_groceries",
    ]);
  });

  it("puts the big-shop type first for a large amount", () => {
    expect(rankTypesForAmount(base, samples, -480)).toEqual([
      "t_groceries",
      "t_snacks",
    ]);
  });

  it("keeps the base order when the amount is unknown", () => {
    expect(rankTypesForAmount(base, samples, null)).toBe(base);
  });

  it("keeps the base order when the amount is far from every sample", () => {
    expect(rankTypesForAmount(base, samples, -50000)).toBe(base);
  });

  it("lifts a learned type cut from the capped base list", () => {
    // Base was capped to one entry; snacks still surfaces for its range.
    expect(rankTypesForAmount(["t_groceries"], samples, -40)).toEqual([
      "t_snacks",
      "t_groceries",
    ]);
  });

  it("lets non-matching types keep their base order behind the matches", () => {
    // Groceries is several bandwidths away from -45, so it doesn't count
    // as an amount match and stays behind the manual pin.
    expect(rankTypesForAmount(["t_pinned", ...base], samples, -45)).toEqual([
      "t_snacks",
      "t_pinned",
      "t_groceries",
    ]);
  });
});

describe("predictTypeForAmount", () => {
  const samples = computeCompanyTypeAmountModel(
    makeData({ history: groceryHistory }),
  ).get("co_store");

  it("predicts confidently when the amount sits in one type's range", () => {
    expect(predictTypeForAmount(samples, -40)).toBe("t_snacks");
    expect(predictTypeForAmount(samples, -550)).toBe("t_groceries");
  });

  it("abstains when the amount sits between the ranges", () => {
    expect(predictTypeForAmount(samples, -150)).toBeUndefined();
  });

  it("abstains on thin evidence", () => {
    const thin = new Map([
      ["t_a", [-40]],
      ["t_b", [-500]],
    ]);
    expect(predictTypeForAmount(thin, -40)).toBeUndefined();
  });
});

describe("company type lookups", () => {
  const model = computeCompanyTypeAmountModel(
    makeData({ history: groceryHistory }),
  );
  const hints = new Map<string, readonly string[]>([
    ["co_store", ["t_groceries", "t_snacks"]],
    ["co_single", ["t_only"]],
  ]);

  it("re-ranks hints for the amount", () => {
    const lookup = createCompanyTypeHintLookup(hints, model);
    expect(lookup.get("co_store", -40)).toEqual(["t_snacks", "t_groceries"]);
    expect(lookup.get("co_store")).toEqual(["t_groceries", "t_snacks"]);
    expect(lookup.get("co_unknown", -40)).toBeUndefined();
  });

  it("auto-fills a single-type company regardless of amount", () => {
    const lookup = createCompanyTypeSuggestionLookup(hints, model);
    expect(autoTypeForCompany(null, "co_single", lookup)).toBe("t_only");
    expect(autoTypeForCompany(null, "co_single", lookup, -9999)).toBe("t_only");
  });

  it("auto-fills a multi-type company only when the amount is decisive", () => {
    const lookup = createCompanyTypeSuggestionLookup(hints, model);
    expect(autoTypeForCompany(null, "co_store", lookup)).toBeUndefined();
    expect(autoTypeForCompany(null, "co_store", lookup, -45)).toBe("t_snacks");
    expect(autoTypeForCompany(null, "co_store", lookup, -600)).toBe(
      "t_groceries",
    );
    expect(autoTypeForCompany(null, "co_store", lookup, -150)).toBeUndefined();
  });
});
