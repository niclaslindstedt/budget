import { describe, expect, it } from "vitest";

import {
  CONFLICT_AMOUNT_PCT,
  CONFLICT_DEFAULT_MIN_AMOUNT,
  EXCLUDED_CATEGORY_IDS,
  findConflicts,
  pickWinner,
} from "../src/data/conflicts";
import type { Column, EntryType, Row } from "../src/data/types";

const dateCol: Column = { id: "d", type: "date", label: "Date" };
const descCol: Column = { id: "x", type: "description", label: "Desc" };
const amtCol: Column = { id: "a", type: "amount", label: "Amount" };
const columns: Column[] = [dateCol, descCol, amtCol];

function row(
  over: Partial<Row> & {
    date?: string;
    amount?: number;
    description?: string;
  },
): Row {
  return {
    id: over.id ?? "r1",
    cells: {
      [dateCol.id]: over.date ?? "2026-04-15",
      [descCol.id]: over.description ?? "",
      [amtCol.id]: over.amount ?? -1000,
    },
    ...(over.seriesId ? { seriesId: over.seriesId } : {}),
    ...(over.typeId ? { typeId: over.typeId } : {}),
    ...(over.historyEntryId ? { historyEntryId: over.historyEntryId } : {}),
    ...(over.transferId ? { transferId: over.transferId } : {}),
    ...(over.isCorrection ? { isCorrection: over.isCorrection } : {}),
  };
}

const types: EntryType[] = [
  {
    id: "type-rent",
    name: "Rent",
    color: "#88c0d0",
    glyph: "home",
    categoryId: "preset-cat-housing",
  },
  {
    id: "type-bill",
    name: "Bill",
    color: "#a3be8c",
    glyph: "receipt",
    categoryId: "preset-cat-bills",
  },
  {
    id: "type-groceries",
    name: "Groceries",
    color: "#b48ead",
    glyph: "shopping-cart",
    categoryId: "preset-cat-food",
  },
  {
    id: "type-uncategorised",
    name: "Misc",
    color: "#bf616a",
    glyph: "tag",
    // Intentionally missing categoryId — represents a user-created
    // type that hasn't been slotted into a category yet.
    categoryId: "",
  },
];

const defaults = { types, columns, minAmount: 0 } as const;

describe("findConflicts", () => {
  it("groups same-day exact-amount same-category pairs", () => {
    const r1 = row({ id: "r1", typeId: "type-rent", amount: -8000 });
    const r2 = row({ id: "r2", typeId: "type-rent", amount: -8000 });
    const out = findConflicts([r1, r2], defaults);
    expect(out).toHaveLength(1);
    expect(out[0].rows.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
    expect(out[0].date).toBe("2026-04-15");
    expect(out[0].categoryId).toBe("preset-cat-housing");
  });

  it("matches within 5% amount tolerance", () => {
    const r1 = row({ id: "r1", typeId: "type-rent", amount: -1000 });
    const r2 = row({ id: "r2", typeId: "type-rent", amount: -1050 });
    expect(findConflicts([r1, r2], defaults)).toHaveLength(1);
  });

  it("rejects pairs outside the 5% tolerance", () => {
    const r1 = row({ id: "r1", typeId: "type-rent", amount: -1000 });
    const r2 = row({ id: "r2", typeId: "type-rent", amount: -1100 });
    expect(findConflicts([r1, r2], defaults)).toEqual([]);
  });

  it("rejects opposite-sign amounts even when magnitudes match", () => {
    const r1 = row({ id: "r1", typeId: "type-rent", amount: -1000 });
    const r2 = row({ id: "r2", typeId: "type-rent", amount: 1000 });
    expect(findConflicts([r1, r2], defaults)).toEqual([]);
  });

  it("skips rows whose category resolves to the excluded Food bucket", () => {
    const r1 = row({ id: "r1", typeId: "type-groceries", amount: -350 });
    const r2 = row({ id: "r2", typeId: "type-groceries", amount: -350 });
    expect(findConflicts([r1, r2], defaults)).toEqual([]);
    // Sanity — the excluded list is the one the doc promises.
    expect(EXCLUDED_CATEGORY_IDS).toContain("preset-cat-food");
  });

  it("respects the min-amount threshold", () => {
    const r1 = row({ id: "r1", typeId: "type-bill", amount: -150 });
    const r2 = row({ id: "r2", typeId: "type-bill", amount: -150 });
    expect(findConflicts([r1, r2], { ...defaults, minAmount: 200 })).toEqual(
      [],
    );
    expect(
      findConflicts([r1, r2], { ...defaults, minAmount: 100 }),
    ).toHaveLength(1);
  });

  it("skips synthesized transfer halves", () => {
    const r1 = row({
      id: "r1",
      typeId: "type-rent",
      amount: -1000,
      transferId: "t1",
    });
    const r2 = row({ id: "r2", typeId: "type-rent", amount: -1000 });
    expect(findConflicts([r1, r2], defaults)).toEqual([]);
  });

  it("skips balance-correction rows", () => {
    const r1 = row({
      id: "r1",
      typeId: "type-rent",
      amount: -1000,
      isCorrection: true,
    });
    const r2 = row({ id: "r2", typeId: "type-rent", amount: -1000 });
    expect(findConflicts([r1, r2], defaults)).toEqual([]);
  });

  it("matches across mixed typed and untyped rows", () => {
    // User typed one row, left the other blank — still a duplicate
    // candidate per the spec (only mismatching set categories block).
    const r1 = row({ id: "r1", typeId: "type-rent", amount: -8000 });
    const r2 = row({ id: "r2", amount: -8000 });
    const out = findConflicts([r1, r2], defaults);
    expect(out).toHaveLength(1);
    // Display category surfaces the typed side's category.
    expect(out[0].categoryId).toBe("preset-cat-housing");
  });

  it("matches two untyped rows of the same amount", () => {
    const r1 = row({ id: "r1", amount: -2500 });
    const r2 = row({ id: "r2", amount: -2500 });
    const out = findConflicts([r1, r2], defaults);
    expect(out).toHaveLength(1);
    expect(out[0].categoryId).toBeNull();
  });

  it("does not match rows whose set categories differ", () => {
    const r1 = row({ id: "r1", typeId: "type-rent", amount: -1000 });
    const r2 = row({ id: "r2", typeId: "type-bill", amount: -1000 });
    expect(findConflicts([r1, r2], defaults)).toEqual([]);
  });

  it("treats a type with no categoryId as untyped for the category check", () => {
    // The user created a misc type but never slotted it under a
    // category — it should still match a typed (housing) row, because
    // one side has no category.
    const r1 = row({ id: "r1", typeId: "type-rent", amount: -1000 });
    const r2 = row({ id: "r2", typeId: "type-uncategorised", amount: -1000 });
    expect(findConflicts([r1, r2], defaults)).toHaveLength(1);
  });

  it("clusters three duplicates into a single group", () => {
    const r1 = row({ id: "r1", typeId: "type-rent", amount: -1000 });
    const r2 = row({ id: "r2", typeId: "type-rent", amount: -1010 });
    const r3 = row({ id: "r3", typeId: "type-rent", amount: -1020 });
    const out = findConflicts([r1, r2, r3], defaults);
    expect(out).toHaveLength(1);
    expect(out[0].rows.map((r) => r.id).sort()).toEqual(["r1", "r2", "r3"]);
  });

  it("never pairs two bank-history rows with each other", () => {
    // Bank statements are the source of truth — two history rows on
    // the same day for similar amounts are a real double charge,
    // not a duplicate.
    const r1 = row({
      id: "r1",
      typeId: "type-bill",
      amount: -500,
      historyEntryId: "h1",
    });
    const r2 = row({
      id: "r2",
      typeId: "type-bill",
      amount: -500,
      historyEntryId: "h2",
    });
    expect(findConflicts([r1, r2], defaults)).toEqual([]);
  });

  it("pairs one bank-history row with a user row even when another history row sits nearby", () => {
    // Two bank rows can't pair with each other, but each bank row
    // can still pair with the user-authored row — the user row is
    // the actual duplicate.
    const userRow = row({ id: "u", typeId: "type-bill", amount: -500 });
    const histA = row({
      id: "ha",
      typeId: "type-bill",
      amount: -500,
      historyEntryId: "ea",
    });
    const histB = row({
      id: "hb",
      typeId: "type-bill",
      amount: -510,
      historyEntryId: "eb",
    });
    const out = findConflicts([userRow, histA, histB], defaults);
    // Greedy clustering — the first valid pair claims the user row;
    // the remaining bank row is left alone.
    expect(out).toHaveLength(1);
    expect(out[0].rows).toHaveLength(2);
    const ids = out[0].rows.map((r) => r.id).sort();
    expect(ids).toContain("u");
    // The user row was paired with one of the two history rows —
    // either is acceptable.
    expect(ids.some((id) => id === "ha" || id === "hb")).toBe(true);
  });

  it("returns [] when the date column is missing", () => {
    expect(
      findConflicts([], { ...defaults, columns: [amtCol, descCol] }),
    ).toEqual([]);
  });

  it("skips undated rows", () => {
    const r1 = row({ id: "r1", typeId: "type-rent", amount: -1000, date: "" });
    const r2 = row({ id: "r2", typeId: "type-rent", amount: -1000, date: "" });
    expect(findConflicts([r1, r2], defaults)).toEqual([]);
  });

  it("respects calendar boundaries", () => {
    const r1 = row({
      id: "r1",
      typeId: "type-rent",
      amount: -1000,
      date: "2026-04-15",
    });
    const r2 = row({
      id: "r2",
      typeId: "type-rent",
      amount: -1000,
      date: "2026-04-16",
    });
    expect(findConflicts([r1, r2], defaults)).toEqual([]);
  });

  it("exposes a sensible default min-amount", () => {
    expect(CONFLICT_DEFAULT_MIN_AMOUNT).toBeGreaterThan(0);
  });

  it("uses the documented amount-pct constant", () => {
    expect(CONFLICT_AMOUNT_PCT).toBe(0.05);
  });
});

describe("pickWinner", () => {
  it("picks the lone history-backed row when one exists", () => {
    const userRow = row({ id: "u1", typeId: "type-rent", amount: -1000 });
    const histRow = row({
      id: "h1",
      typeId: "type-rent",
      amount: -1000,
      historyEntryId: "e1",
    });
    expect(pickWinner([userRow, histRow], columns).id).toBe("h1");
  });

  it("scores by metadata when all rows are user-authored", () => {
    const sparse = row({ id: "u1", amount: -1000 });
    const rich = row({
      id: "u2",
      amount: -1000,
      typeId: "type-rent",
      description: "Rent payment",
    });
    expect(pickWinner([sparse, rich], columns).id).toBe("u2");
  });

  it("breaks ties on lowest id lex when scores match", () => {
    const a = row({ id: "zzz", typeId: "type-rent", amount: -1000 });
    const b = row({ id: "aaa", typeId: "type-rent", amount: -1000 });
    expect(pickWinner([a, b], columns).id).toBe("aaa");
  });

  it("returns the history row over any number of user rows", () => {
    const u1 = row({ id: "u1", typeId: "type-bill", amount: -500 });
    const u2 = row({
      id: "u2",
      typeId: "type-bill",
      amount: -500,
      description: "rich label",
      seriesId: "s",
    });
    const h = row({
      id: "h1",
      typeId: "type-bill",
      amount: -500,
      historyEntryId: "e1",
    });
    expect(pickWinner([u1, u2, h], columns).id).toBe("h1");
  });
});
