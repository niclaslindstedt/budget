import { describe, expect, it } from "vitest";

import { migrate } from "../src/data/migrations";
import { DEFAULT_CATEGORY_ID } from "../src/data/presets/categories";
import { PRESET_ENTRY_TYPES } from "../src/data/presets/types";

// Characterization fixture for the v24 → v25 migration, which
// restructures the type/category relationship: category columns and
// per-row category cells are dropped, every user type gains a resolved
// `categoryId`, and rows / transactions / hints / rules that carried a
// category but no type get a synthesized "generic" type minted under
// that category so their meaning survives the cell removal.
//
// The migration is frozen historical code with no other coverage, so
// this test pins every observable branch (most-popular-category pick,
// preset-name fallback, default fallback, orphan-row generic minting,
// per-category generic dedup, transaction / hint / rule rewrites) to
// guard refactors of the 280-line function.

// A real preset type whose name match drives the category fallback.
const PRESET_SAMPLE = PRESET_ENTRY_TYPES[0];

function makeV24() {
  return {
    version: 24,
    settings: { startOfMonth: 25, theme: "system", language: "en" },
    categories: [
      { id: "cat-1", name: "Bills" },
      { id: "cat-2", name: "Fun" },
    ],
    types: [
      // Used by typed rows: cat-1 twice, cat-2 once → cat-1 wins.
      { id: "type-used", name: "MyType", color: "#abcabc", glyph: "tag" },
      // No row usage, but the name matches a preset → preset category.
      {
        id: "type-preset",
        name: PRESET_SAMPLE.name,
        color: "#abcabc",
        glyph: "tag",
      },
      // No usage, no preset match → DEFAULT_CATEGORY_ID.
      {
        id: "type-unknown",
        name: "Zzz Nonsense Name",
        color: "#abcabc",
        glyph: "tag",
      },
    ],
    sheets: [
      {
        id: "s1",
        items: [
          {
            type: "accountBudget",
            columns: [
              { id: "c-date", type: "date", label: "Date" },
              { id: "c-desc", type: "description", label: "Desc" },
              { id: "c-cat", type: "category", label: "Category" },
            ],
            rows: [
              { id: "r1", typeId: "type-used", cells: { "c-cat": "cat-1" } },
              { id: "r2", typeId: "type-used", cells: { "c-cat": "cat-1" } },
              { id: "r3", typeId: "type-used", cells: { "c-cat": "cat-2" } },
              // Orphan rows: no typeId, a category cell → generic type.
              // Two under the same category to exercise the dedup.
              { id: "orphan1", cells: { "c-cat": "cat-2" } },
              { id: "orphan2", cells: { "c-cat": "cat-2" } },
            ],
          },
        ],
      },
    ],
    transactions: [
      { id: "tx-cat-only", categoryId: "cat-1", amount: 10 },
      { id: "tx-typed", categoryId: "cat-2", typeId: "type-used", amount: 5 },
    ],
    merchantHints: {
      "shop-a": { categoryId: "cat-1" },
      "shop-b": { typeId: "type-used", categoryId: "cat-2" },
      "shop-c": {},
    },
    matchRules: [
      { id: "rule-cat", categoryId: "cat-1", pattern: "x" },
      {
        id: "rule-typed",
        typeId: "type-used",
        categoryId: "cat-2",
        pattern: "y",
      },
    ],
  };
}

type AnyRec = Record<string, unknown>;

describe("migration v24 → v25 (type/category restructure)", () => {
  const result = migrate(makeV24());
  // NB: a later migration (v39 → v40) renames the top-level
  // `transactions` array to `transfers`, so the v24 → v25 transaction
  // rewrite is read back here under that final name.
  const data = result.data as {
    version: number;
    types: AnyRec[];
    sheets: AnyRec[];
    transfers: AnyRec[];
    merchantHints: Record<string, AnyRec>;
    matchRules: AnyRec[];
  };

  const typeById = (id: string) =>
    data.types.find((t) => t.id === id) as AnyRec | undefined;
  const generics = data.types.filter(
    (t) =>
      typeof t.name === "string" && (t.name as string).endsWith("(generic)"),
  );
  const genericFor = (categoryId: string) =>
    generics.find((t) => t.categoryId === categoryId) as AnyRec | undefined;

  const item = (data.sheets[0].items as AnyRec[])[0];
  const rows = item.rows as AnyRec[];
  const rowById = (id: string) => rows.find((r) => r.id === id) as AnyRec;

  it("runs the chain to the latest version", () => {
    expect(result.migrated).toBe(true);
    expect(data.version).toBeGreaterThanOrEqual(25);
  });

  it("assigns the most-used category to a type with row usage", () => {
    expect(typeById("type-used")?.categoryId).toBe("cat-1");
  });

  it("falls back to the preset-name category when a type has no usage", () => {
    expect(typeById("type-preset")?.categoryId).toBe(PRESET_SAMPLE.categoryId);
  });

  it("falls back to the default category when nothing matches", () => {
    expect(typeById("type-unknown")?.categoryId).toBe(DEFAULT_CATEGORY_ID);
  });

  it("mints exactly one generic type per referenced category", () => {
    // cat-1 (transaction / hint / rule) and cat-2 (orphan rows) each
    // get one generic; the two cat-2 orphans share a single type.
    expect(generics).toHaveLength(2);
    const billsGeneric = genericFor("cat-1");
    const funGeneric = genericFor("cat-2");
    expect(billsGeneric?.name).toBe("Bills (generic)");
    expect(funGeneric?.name).toBe("Fun (generic)");
    for (const g of generics) {
      expect(g.color).toBe("#5c6370");
      expect(g.glyph).toBe("tag");
    }
  });

  it("drops category columns from the budget item", () => {
    const columns = item.columns as AnyRec[];
    expect(columns.some((c) => c.type === "category")).toBe(false);
  });

  it("removes category cells from every row", () => {
    for (const r of rows) {
      const cells = (r.cells ?? {}) as AnyRec;
      expect("c-cat" in cells).toBe(false);
    }
  });

  it("keeps the typeId of already-typed rows", () => {
    expect(rowById("r1").typeId).toBe("type-used");
    expect(rowById("r3").typeId).toBe("type-used");
  });

  it("attaches the category's generic type to orphan rows", () => {
    const funGenericId = genericFor("cat-2")?.id;
    expect(rowById("orphan1").typeId).toBe(funGenericId);
    expect(rowById("orphan2").typeId).toBe(funGenericId);
  });

  it("strips categoryId from transactions and mints when untyped", () => {
    const txCatOnly = data.transfers.find((t) => t.id === "tx-cat-only")!;
    const txTyped = data.transfers.find((t) => t.id === "tx-typed")!;
    expect("categoryId" in txCatOnly).toBe(false);
    expect(txCatOnly.typeId).toBe(genericFor("cat-1")?.id);
    expect("categoryId" in txTyped).toBe(false);
    expect(txTyped.typeId).toBe("type-used");
  });

  it("rewrites merchant hints, dropping the ones with nothing left", () => {
    expect("categoryId" in data.merchantHints["shop-a"]).toBe(false);
    expect(data.merchantHints["shop-a"].typeId).toBe(genericFor("cat-1")?.id);
    expect("categoryId" in data.merchantHints["shop-b"]).toBe(false);
    expect(data.merchantHints["shop-b"].typeId).toBe("type-used");
    expect("shop-c" in data.merchantHints).toBe(false);
  });

  it("rewrites match rules, minting a type for category-only rules", () => {
    const ruleCat = data.matchRules.find((r) => r.id === "rule-cat")!;
    const ruleTyped = data.matchRules.find((r) => r.id === "rule-typed")!;
    expect("categoryId" in ruleCat).toBe(false);
    expect(ruleCat.typeId).toBe(genericFor("cat-1")?.id);
    expect("categoryId" in ruleTyped).toBe(false);
    expect(ruleTyped.typeId).toBe("type-used");
  });
});
