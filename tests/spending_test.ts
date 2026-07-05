import { describe, expect, it } from "vitest";

import {
  collectSpendingFacts,
  computeCategoryShares,
  computeIncomeVsExpenses,
  computeMonthlyCategorySpending,
  computeTopMerchants,
  computeTypeShares,
  isActualSpendingRow,
  monthIndexToKey,
  monthKeyToIndex,
} from "../src/data/budget/spending";
import type { SpendingFact, SpendingInputs } from "../src/data/budget/spending";
import type {
  Column,
  EntryType,
  Item,
  LineItemLink,
  Row,
} from "../src/data/types";

const DATE_COL = "col-date";
const DESC_COL = "col-desc";
const AMOUNT_COL = "col-amount";
const COMPLETED_COL = "col-completed";

const COLUMNS: Column[] = [
  { id: DATE_COL, type: "date", label: "Date" },
  { id: DESC_COL, type: "description", label: "Description" },
  { id: AMOUNT_COL, type: "amount", label: "Amount" },
  { id: COMPLETED_COL, type: "completed", label: "Done" },
];

const TYPES: EntryType[] = [
  {
    id: "type-rent",
    name: "Rent",
    color: "#e06c75",
    glyph: "home",
    categoryId: "cat-housing",
  },
  {
    id: "type-electricity",
    name: "Electricity",
    color: "#d19a66",
    glyph: "zap",
    categoryId: "cat-housing",
  },
  {
    id: "type-groceries",
    name: "Groceries",
    color: "#98c379",
    glyph: "shopping-cart",
    categoryId: "cat-food",
  },
  {
    id: "type-salary",
    name: "Salary",
    color: "#61afef",
    glyph: "banknote",
    categoryId: "cat-income",
    kind: "income",
  },
];

const TYPES_BY_ID = new Map(TYPES.map((t) => [t.id, t]));

let nextId = 0;

function makeRow(
  kind: "user" | "historic" | "transfer" | "correction",
  opts: {
    date?: string | null;
    amount?: number;
    completed?: boolean;
    typeId?: string;
    companyId?: string;
    fiscalMonthShift?: -1 | 1;
    isTransfer?: boolean;
    ignored?: boolean;
    lineItems?: LineItemLink[];
  } = {},
): Row {
  nextId += 1;
  const base = {
    id: `row-${nextId}`,
    cells: {
      [DATE_COL]: opts.date === undefined ? "2026-06-05" : opts.date,
      [AMOUNT_COL]: opts.amount ?? -100,
      [COMPLETED_COL]: opts.completed ?? false,
    },
    typeId: opts.typeId,
    companyId: opts.companyId,
    fiscalMonthShift: opts.fiscalMonthShift,
    isTransfer: opts.isTransfer,
    ignored: opts.ignored,
    lineItems: opts.lineItems,
  };
  switch (kind) {
    case "user":
      return { ...base, kind: "user" };
    case "correction":
      return { ...base, kind: "correction", isCorrection: true };
    case "historic":
      return { ...base, kind: "historic", historyEntryId: `h-${nextId}` };
    case "transfer":
      return {
        ...base,
        kind: "transfer",
        transferId: `t-${nextId}`,
        peerAccountId: "acct-2",
        peerAccountName: "Savings",
      };
  }
}

function collect(
  rows: Row[],
  overrides: Partial<SpendingInputs> = {},
): ReturnType<typeof collectSpendingFacts> {
  return collectSpendingFacts({
    rows,
    columns: COLUMNS,
    typesById: TYPES_BY_ID,
    startOfMonth: 1,
    currentMonthKey: "2026-06",
    period: 6,
    ...overrides,
  });
}

function fact(partial: Partial<SpendingFact>): SpendingFact {
  return {
    monthKey: "2026-06",
    amount: -100,
    typeId: null,
    categoryId: null,
    companyId: null,
    isIncome: false,
    ...partial,
  };
}

describe("isActualSpendingRow", () => {
  it("includes completed user rows and excludes uncompleted ones", () => {
    expect(
      isActualSpendingRow(makeRow("user", { completed: true }), COMPLETED_COL),
    ).toBe(true);
    expect(
      isActualSpendingRow(makeRow("user", { completed: false }), COMPLETED_COL),
    ).toBe(false);
  });
  it("includes historic rows even without a completed column", () => {
    expect(isActualSpendingRow(makeRow("historic"), null)).toBe(true);
  });
  it("excludes transfer-kind rows and isTransfer-flagged rows", () => {
    expect(isActualSpendingRow(makeRow("transfer"), COMPLETED_COL)).toBe(false);
    expect(
      isActualSpendingRow(
        makeRow("user", { completed: true, isTransfer: true }),
        COMPLETED_COL,
      ),
    ).toBe(false);
    expect(
      isActualSpendingRow(
        makeRow("historic", { isTransfer: true }),
        COMPLETED_COL,
      ),
    ).toBe(false);
  });
  it("excludes ignored rows on both user and historic kinds", () => {
    expect(
      isActualSpendingRow(
        makeRow("user", { completed: true, ignored: true }),
        COMPLETED_COL,
      ),
    ).toBe(false);
    expect(
      isActualSpendingRow(
        makeRow("historic", { ignored: true }),
        COMPLETED_COL,
      ),
    ).toBe(false);
  });
  it("excludes correction rows", () => {
    expect(
      isActualSpendingRow(
        makeRow("correction", { completed: true }),
        COMPLETED_COL,
      ),
    ).toBe(false);
  });
  it("excludes user rows when there is no completed column", () => {
    expect(
      isActualSpendingRow(makeRow("user", { completed: true }), null),
    ).toBe(false);
  });

  describe("with budgetIgnoredForStats (opt-in polarity)", () => {
    it("excludes non-ignored rows by default", () => {
      expect(
        isActualSpendingRow(
          makeRow("user", { completed: true }),
          COMPLETED_COL,
          true,
        ),
      ).toBe(false);
      expect(isActualSpendingRow(makeRow("historic"), null, true)).toBe(false);
    });
    it("includes ignored (opted-in) rows", () => {
      expect(
        isActualSpendingRow(
          makeRow("user", { completed: true, ignored: true }),
          COMPLETED_COL,
          true,
        ),
      ).toBe(true);
      expect(
        isActualSpendingRow(makeRow("historic", { ignored: true }), null, true),
      ).toBe(true);
    });
    it("still requires the completed cell on opted-in user rows", () => {
      expect(
        isActualSpendingRow(
          makeRow("user", { completed: false, ignored: true }),
          COMPLETED_COL,
          true,
        ),
      ).toBe(false);
    });
    it("keeps transfers and corrections excluded regardless of polarity", () => {
      expect(
        isActualSpendingRow(
          makeRow("transfer", { ignored: true }),
          COMPLETED_COL,
          true,
        ),
      ).toBe(false);
      expect(
        isActualSpendingRow(
          makeRow("correction", { completed: true, ignored: true }),
          COMPLETED_COL,
          true,
        ),
      ).toBe(false);
    });
  });
});

describe("collectSpendingFacts", () => {
  it("keeps only actual rows and skips zero amounts", () => {
    const { facts } = collect([
      makeRow("user", { completed: true, amount: -250 }),
      makeRow("user", { completed: false, amount: -999 }),
      makeRow("historic", { amount: -50 }),
      makeRow("transfer", { amount: -500 }),
      makeRow("correction", { completed: true, amount: -123 }),
      makeRow("user", { completed: true, amount: 0 }),
    ]);
    expect(facts.map((f) => f.amount).sort((a, b) => a - b)).toEqual([
      -250, -50,
    ]);
  });

  it("flips to opt-in when budgetIgnoredForStats is set", () => {
    const { facts } = collect(
      [
        makeRow("user", { completed: true, amount: -250 }),
        makeRow("historic", { amount: -50 }),
        makeRow("user", { completed: true, amount: -400, ignored: true }),
        makeRow("historic", { amount: -70, ignored: true }),
      ],
      { budgetIgnoredForStats: true },
    );
    // Only the two `ignored` (opted-in) rows survive; the default rows drop.
    expect(facts.map((f) => f.amount).sort((a, b) => a - b)).toEqual([
      -400, -70,
    ]);
  });

  it("buckets by fiscal month when startOfMonth is 25", () => {
    const { facts } = collect(
      [
        makeRow("historic", { date: "2026-06-24", amount: -10 }),
        makeRow("historic", { date: "2026-06-25", amount: -20 }),
      ],
      { startOfMonth: 25, currentMonthKey: "2026-06" },
    );
    expect(facts.find((f) => f.amount === -10)?.monthKey).toBe("2026-05");
    expect(facts.find((f) => f.amount === -20)?.monthKey).toBe("2026-06");
  });

  it("cascades a fiscalMonthShift anchor even when the anchor is filtered out", () => {
    // The shifted anchor is a transfer (excluded from facts), but the
    // same-day completed expense must still inherit the shift — the
    // grouping pass has to run before the scope filter.
    const { facts } = collect([
      makeRow("transfer", {
        date: "2026-05-22",
        amount: 30000,
        fiscalMonthShift: 1,
      }),
      makeRow("user", { date: "2026-05-22", amount: -400, completed: true }),
    ]);
    expect(facts).toHaveLength(1);
    expect(facts[0].monthKey).toBe("2026-06");
  });

  it("returns a contiguous zero-filled window ending at the current month", () => {
    const { facts, monthKeys } = collect(
      [makeRow("historic", { date: "2026-04-10", amount: -10 })],
      { period: 3 },
    );
    expect(monthKeys).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(facts).toHaveLength(1);
  });

  it("drops facts outside the window, future months, and undated rows", () => {
    const { facts, monthKeys } = collect(
      [
        makeRow("historic", { date: "2025-12-10", amount: -10 }),
        makeRow("historic", { date: "2026-07-10", amount: -20 }),
        makeRow("historic", { date: null, amount: -30 }),
        makeRow("historic", { date: "2026-06-10", amount: -40 }),
      ],
      { period: 3 },
    );
    expect(monthKeys).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(facts).toHaveLength(1);
    expect(facts[0].amount).toBe(-40);
  });

  it("spans oldest fact month through current for period 'all'", () => {
    const { monthKeys } = collect(
      [makeRow("historic", { date: "2026-01-10", amount: -10 })],
      { period: "all" },
    );
    expect(monthKeys).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
  });

  describe("spread item costs", () => {
    const ITEMS: Item[] = [
      // 0.25 years → 3 monthly slices.
      { id: "item-tv", name: "TV", purchasePrice: 1200, lifetimeYears: 0.25 },
      { id: "item-no-lifetime", name: "Couch", purchasePrice: 900 },
      { id: "item-no-price", name: "Lamp", lifetimeYears: 1 },
    ];
    const ITEMS_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
    const link = (itemId: string): LineItemLink => ({
      id: `link-${itemId}`,
      itemId,
    });
    const spread = (rows: Row[], overrides: Partial<SpendingInputs> = {}) =>
      collect(rows, {
        itemsById: ITEMS_BY_ID,
        spreadItemCosts: true,
        ...overrides,
      });

    it("replaces the purchase spike with equal monthly slices", () => {
      const { facts } = spread([
        makeRow("historic", {
          date: "2026-04-10",
          amount: -1200,
          typeId: "type-groceries",
          companyId: "co-a",
          lineItems: [link("item-tv")],
        }),
      ]);
      expect(facts).toHaveLength(3);
      expect(
        facts
          .map((f) => [f.monthKey, f.amount])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      ).toEqual([
        ["2026-04", -400],
        ["2026-05", -400],
        ["2026-06", -400],
      ]);
      // Slices stay attributed to the row's type / category / company.
      for (const f of facts) {
        expect(f.typeId).toBe("type-groceries");
        expect(f.categoryId).toBe("cat-food");
        expect(f.companyId).toBe("co-a");
      }
    });

    it("keeps the unallocated remainder in the purchase month", () => {
      const { facts } = spread([
        makeRow("historic", {
          date: "2026-05-10",
          amount: -2000,
          lineItems: [link("item-tv")],
        }),
      ]);
      const purchaseMonth = facts.filter((f) => f.monthKey === "2026-05");
      expect(purchaseMonth.map((f) => f.amount).sort((a, b) => a - b)).toEqual([
        -800, -400,
      ]);
      expect(facts.find((f) => f.monthKey === "2026-06")?.amount).toBe(-400);
    });

    it("clamps the lifted cost to the row's expense", () => {
      // Item priced above the transaction: only what was paid spreads,
      // and no positive remainder fact leaks into income.
      const { facts } = spread([
        makeRow("historic", {
          date: "2026-04-10",
          amount: -600,
          lineItems: [link("item-tv")],
        }),
      ]);
      expect(facts.every((f) => f.amount < 0)).toBe(true);
      expect(facts.map((f) => f.amount)).toEqual([-200, -200, -200]);
    });

    it("drops slices past the current month", () => {
      const { facts } = spread([
        makeRow("historic", {
          date: "2026-06-10",
          amount: -1200,
          lineItems: [link("item-tv")],
        }),
      ]);
      expect(facts).toEqual([
        fact({ monthKey: "2026-06", amount: -400, companyId: null }),
      ]);
    });

    it("leaves items without a lifetime or price (and income rows) alone", () => {
      const { facts } = spread([
        makeRow("historic", {
          date: "2026-05-10",
          amount: -900,
          lineItems: [link("item-no-lifetime")],
        }),
        makeRow("historic", {
          date: "2026-05-11",
          amount: -300,
          lineItems: [link("item-no-price")],
        }),
        makeRow("historic", {
          date: "2026-05-12",
          amount: 500,
          lineItems: [link("item-tv")],
        }),
      ]);
      expect(facts.map((f) => f.amount).sort((a, b) => a - b)).toEqual([
        -900, -300, 500,
      ]);
    });

    it("does not spread when the option is off", () => {
      const { facts } = spread(
        [
          makeRow("historic", {
            date: "2026-04-10",
            amount: -1200,
            lineItems: [link("item-tv")],
          }),
        ],
        { spreadItemCosts: false },
      );
      expect(facts).toHaveLength(1);
      expect(facts[0]).toMatchObject({ monthKey: "2026-04", amount: -1200 });
    });
  });

  it("resolves typeId to categoryId and nulls dangling ids", () => {
    const { facts } = collect([
      makeRow("user", { completed: true, typeId: "type-rent", amount: -100 }),
      makeRow("user", { completed: true, typeId: "type-gone", amount: -200 }),
    ]);
    const rent = facts.find((f) => f.amount === -100);
    const dangling = facts.find((f) => f.amount === -200);
    expect(rent?.categoryId).toBe("cat-housing");
    expect(rent?.typeId).toBe("type-rent");
    expect(dangling?.categoryId).toBeNull();
    expect(dangling?.typeId).toBeNull();
  });

  it("flags income-typed rows as income (sign-independent)", () => {
    const { facts } = collect([
      makeRow("historic", { typeId: "type-salary", amount: 30000 }),
      // An income-typed row can still carry a negative amount (a clawback
      // / correction); the flag tracks the type, not the sign.
      makeRow("historic", { typeId: "type-salary", amount: -2000 }),
      makeRow("historic", { typeId: "type-groceries", amount: -100 }),
    ]);
    expect(facts.find((f) => f.amount === 30000)?.isIncome).toBe(true);
    expect(facts.find((f) => f.amount === -2000)?.isIncome).toBe(true);
    expect(facts.find((f) => f.amount === -100)?.isIncome).toBe(false);
  });
});

describe("computeMonthlyCategorySpending", () => {
  const monthKeys = ["2026-05", "2026-06"];
  it("sums expenses per category aligned to monthKeys, income excluded", () => {
    const result = computeMonthlyCategorySpending(
      [
        fact({ monthKey: "2026-05", amount: -100, categoryId: "cat-housing" }),
        fact({ monthKey: "2026-06", amount: -300, categoryId: "cat-housing" }),
        fact({ monthKey: "2026-06", amount: -50, categoryId: "cat-food" }),
        fact({ monthKey: "2026-06", amount: 30000, categoryId: "cat-income" }),
      ],
      monthKeys,
    );
    expect(result.categories).toHaveLength(2);
    expect(result.categories[0]).toEqual({
      categoryId: "cat-housing",
      totalsByMonth: [100, 300],
      total: 400,
    });
    expect(result.categories[1]).toEqual({
      categoryId: "cat-food",
      totalsByMonth: [0, 50],
      total: 50,
    });
  });
  it("excludes income-typed facts even when their amount is negative", () => {
    const result = computeMonthlyCategorySpending(
      [
        fact({ monthKey: "2026-06", amount: -100, categoryId: "cat-food" }),
        // Income type with a negative amount must not leak into spend.
        fact({
          monthKey: "2026-06",
          amount: -2000,
          categoryId: "cat-income",
          isIncome: true,
        }),
      ],
      monthKeys,
    );
    expect(result.categories).toEqual([
      { categoryId: "cat-food", totalsByMonth: [0, 100], total: 100 },
    ]);
  });
  it("orders by total descending with the null category last", () => {
    const result = computeMonthlyCategorySpending(
      [
        fact({ amount: -1000, categoryId: null }),
        fact({ amount: -10, categoryId: "cat-food" }),
        fact({ amount: -500, categoryId: "cat-housing" }),
      ],
      ["2026-06"],
    );
    expect(result.categories.map((c) => c.categoryId)).toEqual([
      "cat-housing",
      "cat-food",
      null,
    ]);
  });
});

describe("computeCategoryShares / computeTypeShares", () => {
  const facts = [
    fact({ amount: -300, categoryId: "cat-housing", typeId: "type-rent" }),
    fact({
      amount: -100,
      categoryId: "cat-housing",
      typeId: "type-electricity",
    }),
    fact({ amount: -100, categoryId: "cat-food", typeId: "type-groceries" }),
    fact({ amount: -100, categoryId: null, typeId: null }),
    fact({ amount: 30000, categoryId: "cat-income", typeId: "type-salary" }),
  ];
  it("computes category shares summing to 1, income excluded", () => {
    const shares = computeCategoryShares(facts);
    expect(shares.map((s) => s.id)).toEqual(["cat-housing", "cat-food", null]);
    expect(shares[0].value).toBe(400);
    expect(shares[0].share).toBeCloseTo(400 / 600);
    expect(shares.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1);
  });
  it("restricts type shares to the drilled category", () => {
    const shares = computeTypeShares(facts, "cat-housing");
    expect(shares).toEqual([
      { id: "type-rent", value: 300, share: 0.75 },
      { id: "type-electricity", value: 100, share: 0.25 },
    ]);
  });
  it("drills into the uncategorised bucket via null", () => {
    const shares = computeTypeShares(facts, null);
    expect(shares).toEqual([{ id: null, value: 100, share: 1 }]);
  });
  it("excludes income-typed facts with a negative amount from shares", () => {
    const shares = computeCategoryShares([
      fact({ amount: -300, categoryId: "cat-housing", typeId: "type-rent" }),
      fact({
        amount: -5000,
        categoryId: "cat-income",
        typeId: "type-salary",
        isIncome: true,
      }),
    ]);
    expect(shares).toEqual([{ id: "cat-housing", value: 300, share: 1 }]);
  });
});

describe("computeIncomeVsExpenses", () => {
  it("splits income and expenses per month with zero-filled gaps", () => {
    const points = computeIncomeVsExpenses(
      [
        fact({ monthKey: "2026-04", amount: 30000 }),
        fact({ monthKey: "2026-04", amount: -12000 }),
        fact({ monthKey: "2026-06", amount: -500 }),
      ],
      ["2026-04", "2026-05", "2026-06"],
    );
    expect(points).toEqual([
      { monthKey: "2026-04", income: 30000, expenses: 12000, net: 18000 },
      { monthKey: "2026-05", income: 0, expenses: 0, net: 0 },
      { monthKey: "2026-06", income: 0, expenses: 500, net: -500 },
    ]);
  });
});

describe("computeTopMerchants", () => {
  it("ranks companies by expense total, capped at limit", () => {
    const merchants = computeTopMerchants(
      [
        fact({ amount: -100, companyId: "co-a" }),
        fact({ amount: -250, companyId: "co-b" }),
        fact({ amount: -50, companyId: "co-a" }),
        fact({ amount: -10, companyId: "co-c" }),
        fact({ amount: -999, companyId: null }),
        fact({ amount: 500, companyId: "co-a" }),
      ],
      2,
    );
    expect(merchants).toEqual([
      { companyId: "co-b", total: 250, count: 1 },
      { companyId: "co-a", total: 150, count: 2 },
    ]);
  });

  it("excludes income from a merchant you also earn from", () => {
    // You work at ICA (salary in) and shop at ICA (groceries out). Only
    // the spend counts — the salary never inflates the merchant total,
    // even if it were ever booked as a negative income-typed amount.
    const merchants = computeTopMerchants(
      [
        fact({ amount: -300, companyId: "co-ica" }),
        fact({ amount: 30000, companyId: "co-ica", isIncome: true }),
        fact({ amount: -2000, companyId: "co-ica", isIncome: true }),
      ],
      8,
    );
    expect(merchants).toEqual([{ companyId: "co-ica", total: 300, count: 1 }]);
  });
});

describe("monthKeyToIndex / monthIndexToKey", () => {
  it("round-trips across a year boundary", () => {
    expect(monthIndexToKey(monthKeyToIndex("2025-12"))).toBe("2025-12");
    expect(monthIndexToKey(monthKeyToIndex("2026-01"))).toBe("2026-01");
    expect(monthKeyToIndex("2026-01") - monthKeyToIndex("2025-12")).toBe(1);
  });
});
