import { describe, expect, it } from "vitest";

import { findCarExpenseCandidates } from "../src/data/cars/find";
import { normaliseDescription } from "../src/data/description-normaliser";
import { freshUserData } from "../src/storage/local";
import type { Car, HistoryEntry, UserData } from "../src/data/types";

function entry(over: Partial<HistoryEntry> & { id: string }): HistoryEntry {
  return {
    date: "2026-01-10",
    description: "Bensin Tanka",
    amount: -700,
    importedAt: 0,
    ...over,
  };
}

function car(over: Partial<Car> = {}): Car {
  return {
    id: "car-1",
    name: "Volvo",
    ownership: "owned",
    snapshots: [],
    expenses: [],
    ...over,
  };
}

function state(over: Partial<UserData> = {}): UserData {
  return { ...freshUserData(), ...over };
}

describe("findCarExpenseCandidates", () => {
  it("surfaces transport-typed outflows and skips everything else", () => {
    const data = state({
      history: {
        acc: [
          entry({ id: "h1", userTypeId: "preset-type-fuel" }),
          entry({
            id: "h2",
            userTypeId: "preset-type-parking",
            description: "Parkering",
            amount: -60,
          }),
          // Groceries — not a transport type.
          entry({
            id: "h3",
            userTypeId: "preset-type-groceries",
            description: "Matboden",
          }),
          // Untyped — resolves to no type, dropped.
          entry({ id: "h4", description: "Okänd butik" }),
          // Car-loan payments are never expense candidates.
          entry({ id: "h5", userTypeId: "preset-type-car-loan" }),
          // Inflows never qualify.
          entry({ id: "h6", userTypeId: "preset-type-fuel", amount: 700 }),
          // Hidden / collapsed / transfer entries are skipped.
          entry({ id: "h7", userTypeId: "preset-type-fuel", hidden: true }),
          entry({
            id: "h8",
            userTypeId: "preset-type-fuel",
            collapsedIntoTransferId: "x",
          }),
          entry({ id: "h9", userTypeId: "preset-type-fuel", isTransfer: true }),
        ],
      },
    });
    const candidates = findCarExpenseCandidates(data);
    expect(candidates.map((c) => c.entryId).sort()).toEqual(["h1", "h2"]);
    const fuel = candidates.find((c) => c.entryId === "h1");
    expect(fuel).toMatchObject({
      accountId: "acc",
      amount: 700,
      typeId: "preset-type-fuel",
    });
  });

  it("resolves the type through merchant hints like the budget does", () => {
    const data = state({
      history: { acc: [entry({ id: "h1" })] },
      merchantHints: {
        [normaliseDescription("Bensin Tanka")]: {
          typeId: "preset-type-fuel",
          hitCount: 3,
          lastUsedAt: 0,
        },
      },
    });
    expect(findCarExpenseCandidates(data)).toHaveLength(1);
  });

  it("excludes charges already attributed to any car", () => {
    const data = state({
      history: { acc: [entry({ id: "h1", userTypeId: "preset-type-fuel" })] },
      cars: [
        car({
          expenses: [
            {
              id: "e1",
              date: "2026-01-10",
              amount: 700,
              description: "Bensin Tanka",
              typeId: "preset-type-fuel",
              accountId: "acc",
              sourceHistoryId: "h1",
            },
          ],
        }),
      ],
    });
    expect(findCarExpenseCandidates(data)).toHaveLength(0);
  });

  it("honours the persisted ignore and exclude-similar lists", () => {
    const base = {
      history: {
        acc: [
          entry({ id: "h1", userTypeId: "preset-type-fuel" }),
          entry({
            id: "h2",
            userTypeId: "preset-type-fuel",
            description: "OKQ8 Station",
          }),
        ],
      },
    };
    const ignored = state({ ...base, ignoredCarExpenseEntryIds: ["h1"] });
    expect(findCarExpenseCandidates(ignored).map((c) => c.entryId)).toEqual([
      "h2",
    ]);

    const excluded = state({
      ...base,
      carExpenseExclusionPatterns: [normaliseDescription("OKQ8 Station")],
    });
    expect(findCarExpenseCandidates(excluded).map((c) => c.entryId)).toEqual([
      "h1",
    ]);
  });

  it("sorts newest-first", () => {
    const data = state({
      history: {
        acc: [
          entry({
            id: "h1",
            date: "2026-01-05",
            userTypeId: "preset-type-fuel",
          }),
          entry({
            id: "h2",
            date: "2026-03-05",
            userTypeId: "preset-type-fuel",
          }),
        ],
      },
    });
    expect(findCarExpenseCandidates(data).map((c) => c.entryId)).toEqual([
      "h2",
      "h1",
    ]);
  });
});
