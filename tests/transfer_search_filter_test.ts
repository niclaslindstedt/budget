import { describe, expect, it } from "vitest";

import { EMPTY_FILTER, type SearchEntry } from "../src/data/search";
import {
  collectFilterTokens,
  deriveAmountSlider,
  deriveDateSlider,
  isoToMonthNum,
  monthNumToIsoEnd,
  monthNumToIsoStart,
  monthNumToKey,
  nextAmountFilter,
  nextDateFilter,
  toggleFilterId,
} from "../src/components/budget/useTransferSearchFilter";

// Minimal SearchEntry factory — only the fields the token collector
// reads matter; everything else gets a benign default.
function entry(over: Partial<SearchEntry>): SearchEntry {
  return {
    sheetId: "s1",
    sheetName: "Sheet",
    sheetColor: "#fff",
    sheetGlyph: "wallet",
    itemId: "i1",
    rowId: "r1",
    iso: "2024-01-01",
    description: "",
    typeName: "",
    typeGlyph: "",
    typeColor: "",
    categoryName: "",
    categoryGlyph: "",
    categoryColor: "",
    companyName: "",
    typeId: "",
    categoryId: "",
    companyId: "",
    tagNames: "",
    tags: [],
    bankDescription: "",
    amount: 0,
    kind: "user",
    isTransfer: false,
    isRecurring: false,
    descriptionLc: "",
    typeNameLc: "",
    categoryNameLc: "",
    companyNameLc: "",
    tagNamesLc: "",
    bankDescriptionLc: "",
    ...over,
  };
}

describe("month-number conversions", () => {
  it("round-trips an ISO month through the integer domain", () => {
    expect(isoToMonthNum("2024-01-15")).toBe(2024 * 12 + 0);
    expect(isoToMonthNum("2024-12-01")).toBe(2024 * 12 + 11);
    expect(monthNumToKey(2024 * 12 + 0)).toBe("2024-01");
    expect(monthNumToKey(2024 * 12 + 11)).toBe("2024-12");
  });

  it("maps a month number to inclusive ISO start / end days", () => {
    expect(monthNumToIsoStart(2024 * 12 + 0)).toBe("2024-01-01");
    // February 2024 is a leap year → 29 days.
    expect(monthNumToIsoEnd(2024 * 12 + 1)).toBe("2024-02-29");
    // February 2023 → 28 days.
    expect(monthNumToIsoEnd(2023 * 12 + 1)).toBe("2023-02-28");
    // April → 30 days.
    expect(monthNumToIsoEnd(2024 * 12 + 3)).toBe("2024-04-30");
  });
});

describe("collectFilterTokens", () => {
  it("dedupes by id in first-seen order and skips empty ids", () => {
    const tokens = collectFilterTokens([
      entry({
        sheetId: "s1",
        companyId: "c1",
        companyName: "Acme",
        typeId: "t1",
        typeName: "Rent",
        categoryId: "cat1",
        categoryName: "Home",
        tags: [{ id: "tag1", name: "fixed", color: "#111" }],
      }),
      entry({
        sheetId: "s2",
        sheetName: "Sheet 2",
        companyId: "", // no company → skipped
        typeId: "t1", // duplicate type → not re-added
        typeName: "Rent",
        categoryId: "cat2",
        categoryName: "Food",
        tags: [
          { id: "tag1", name: "fixed", color: "#111" }, // dup tag
          { id: "tag2", name: "rare", color: "#222" },
        ],
      }),
    ]);
    expect(tokens.sheets.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(tokens.companies.map((c) => c.id)).toEqual(["c1"]);
    expect(tokens.types.map((t) => t.id)).toEqual(["t1"]);
    expect(tokens.categories.map((c) => c.id)).toEqual(["cat1", "cat2"]);
    expect(tokens.tags.map((t) => t.id)).toEqual(["tag1", "tag2"]);
  });

  it("carries glyph / colour through for glyph tokens", () => {
    const tokens = collectFilterTokens([
      entry({
        typeId: "t1",
        typeName: "Rent",
        typeGlyph: "home",
        typeColor: "#abc",
      }),
    ]);
    expect(tokens.types[0]).toEqual({
      id: "t1",
      name: "Rent",
      glyph: "home",
      color: "#abc",
    });
  });
});

describe("deriveAmountSlider", () => {
  it("reports no usable range but the lone value when bounds are flat", () => {
    const s = deriveAmountSlider(EMPTY_FILTER, {
      amountMin: 100,
      amountMax: 100,
    });
    expect(s.hasAmount).toBe(false);
    // The flat value is surfaced so the menu can show a hint rather than
    // dropping the amount section entirely.
    expect(s.single).toBe(100);
  });

  it("reports no value when there are no amounts to filter", () => {
    const s = deriveAmountSlider(EMPTY_FILTER, {
      amountMin: null,
      amountMax: null,
    });
    expect(s.hasAmount).toBe(false);
    expect(s.single).toBe(null);
  });

  it("has no flat value when the bounds span a range", () => {
    const s = deriveAmountSlider(EMPTY_FILTER, {
      amountMin: 100,
      amountMax: 500,
    });
    expect(s.single).toBe(null);
  });

  it("falls back to bounds and honours filter overrides", () => {
    const bounds = { amountMin: 100, amountMax: 500 };
    expect(deriveAmountSlider(EMPTY_FILTER, bounds)).toMatchObject({
      hasAmount: true,
      min: 100,
      max: 500,
      value: [100, 500],
    });
    expect(
      deriveAmountSlider({ ...EMPTY_FILTER, amountMin: 200 }, bounds).value,
    ).toEqual([200, 500]);
  });
});

describe("deriveDateSlider", () => {
  it("converts ISO bounds to the month-number domain", () => {
    const s = deriveDateSlider(EMPTY_FILTER, {
      dateMin: "2024-01-10",
      dateMax: "2024-06-20",
    });
    expect(s.hasDate).toBe(true);
    expect(s.min).toBe(isoToMonthNum("2024-01-10"));
    expect(s.max).toBe(isoToMonthNum("2024-06-20"));
    expect(s.value).toEqual([s.min, s.max]);
  });

  it("uses filter overrides for the current value", () => {
    const s = deriveDateSlider(
      { ...EMPTY_FILTER, dateMin: "2024-03-01" },
      { dateMin: "2024-01-10", dateMax: "2024-06-20" },
    );
    expect(s.value).toEqual([isoToMonthNum("2024-03-01"), s.max]);
  });
});

describe("nextAmountFilter", () => {
  const bounds = { amountMin: 100, amountMax: 500 };

  it("collapses a thumb at the natural edge back to null", () => {
    expect(nextAmountFilter(EMPTY_FILTER, bounds, [100, 500])).toMatchObject({
      amountMin: null,
      amountMax: null,
    });
  });

  it("keeps an interior thumb value", () => {
    expect(nextAmountFilter(EMPTY_FILTER, bounds, [200, 400])).toMatchObject({
      amountMin: 200,
      amountMax: 400,
    });
  });
});

describe("nextDateFilter", () => {
  it("collapses edge thumbs to null, commits interior to ISO bounds", () => {
    const min = isoToMonthNum("2024-01-01");
    const max = isoToMonthNum("2024-12-01");
    expect(nextDateFilter(EMPTY_FILTER, min, max, [min, max])).toMatchObject({
      dateMin: null,
      dateMax: null,
    });
    const mid = isoToMonthNum("2024-03-01");
    const result = nextDateFilter(EMPTY_FILTER, min, max, [mid, max - 1]);
    expect(result.dateMin).toBe("2024-03-01");
    expect(result.dateMax).toBe("2024-11-30");
  });
});

describe("toggleFilterId", () => {
  it("adds and removes an id from a set-valued key", () => {
    const added = toggleFilterId(EMPTY_FILTER, "typeIds", "t1", true);
    expect(added.typeIds).toEqual(["t1"]);
    const removed = toggleFilterId(added, "typeIds", "t1", false);
    expect(removed.typeIds).toEqual([]);
  });

  it("does not mutate the source filter", () => {
    const next = toggleFilterId(EMPTY_FILTER, "companyIds", "c1", true);
    expect(EMPTY_FILTER.companyIds).toEqual([]);
    expect(next.companyIds).toEqual(["c1"]);
  });
});
