import { describe, expect, it } from "vitest";

import { findItemPurchaseCandidates } from "../src/data/items/find";
import { normaliseDescription } from "../src/data/description-normaliser";
import { DEFAULT_SETTINGS } from "../src/data/constants/defaults";
import type { HistoryEntry, Settings, UserData } from "../src/data/types";

let counter = 0;
function entry(
  amount: number,
  overrides: Partial<HistoryEntry> = {},
): HistoryEntry {
  counter += 1;
  return {
    id: `e${counter}`,
    date: "2026-03-15",
    description: `Purchase ${counter}`,
    amount,
    importedAt: 0,
    ...overrides,
  };
}

// Minimal workspace: only the fields the scanner reads matter. The rest
// are stubbed empty so the resolver falls through to bank text.
function workspace(
  history: Record<string, HistoryEntry[]>,
  overrides: Partial<UserData> = {},
): UserData {
  return {
    history,
    merchantHints: {},
    matchRules: [],
    companies: [],
    types: [],
    items: [],
    ignoredItemEntryIds: [],
    itemFindExclusionPatterns: [],
    ...overrides,
  } as unknown as UserData;
}

function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    itemFindThreshold: 2000,
    // Default to no type filter so the untyped fixtures below survive;
    // DEFAULT_SETTINGS now seeds a durable-goods allow-list, exercised
    // by its own test.
    itemFindTypeIds: [],
    ...overrides,
  };
}

describe("findItemPurchaseCandidates", () => {
  it("keeps entries at or above the threshold and drops those below", () => {
    const data = workspace({
      acc: [entry(-2500), entry(-1999), entry(-2000)],
    });
    const out = findItemPurchaseCandidates(data, settings());
    const amounts = out.map((c) => c.amount).sort((a, b) => a - b);
    // -2500 and -2000 clear |amount| >= 2000; -1999 does not.
    expect(amounts).toEqual([-2500, -2000]);
  });

  it("excludes inflows — only money spent counts as a purchase", () => {
    // A large positive amount (selling the apartment, a refund) is an
    // inflow, never an item purchase.
    const data = workspace({ acc: [entry(-5000), entry(5000), entry(9000)] });
    const out = findItemPurchaseCandidates(data, settings());
    expect(out.map((c) => c.amount)).toEqual([-5000]);
  });

  it("defaults to the durable-goods type allow-list", () => {
    const electronics = entry(-5000, {
      userTypeId: "preset-type-electronics",
    });
    const groceries = entry(-5000, { userTypeId: "preset-type-groceries" });
    const data = workspace({ acc: [electronics, groceries] });
    // DEFAULT_SETTINGS seeds the allow-list, so groceries drop out.
    const out = findItemPurchaseCandidates(data, {
      ...DEFAULT_SETTINGS,
      itemFindThreshold: 2000,
    });
    expect(out.map((c) => c.entryId)).toEqual([electronics.id]);
  });

  it("sorts by descending absolute amount", () => {
    const data = workspace({ acc: [entry(-2100), entry(-9000), entry(-3000)] });
    const out = findItemPurchaseCandidates(data, settings());
    expect(out.map((c) => c.amount)).toEqual([-9000, -3000, -2100]);
  });

  it("excludes hidden, transfer, and collapsed entries", () => {
    const data = workspace({
      acc: [
        entry(-5000, { hidden: true }),
        entry(-5000, { isTransfer: true }),
        entry(-5000, { collapsedIntoTransferId: "t1" }),
        entry(-5000),
      ],
    });
    const out = findItemPurchaseCandidates(data, settings());
    expect(out).toHaveLength(1);
  });

  it("excludes entries on the ignore allowlist", () => {
    const keep = entry(-5000);
    const ignored = entry(-5000);
    const data = workspace(
      { acc: [keep, ignored] },
      { ignoredItemEntryIds: [ignored.id] },
    );
    const out = findItemPurchaseCandidates(data, settings());
    expect(out.map((c) => c.entryId)).toEqual([keep.id]);
  });

  it("drops never-item types even when no allow-list is set", () => {
    // The hard `NEVER_ITEM_TYPE_IDS` denylist (rent, utilities, …) wins
    // over a scan-every-type run: a rent payment is obviously not a good.
    const laptop = entry(-5000, { userTypeId: "preset-type-electronics" });
    const rent = entry(-5000, { userTypeId: "preset-type-rent" });
    const data = workspace({ acc: [laptop, rent] });
    const out = findItemPurchaseCandidates(data, settings());
    expect(out.map((c) => c.entryId)).toEqual([laptop.id]);
  });

  it("excludes entries matching an 'exclude similar' pattern", () => {
    const a = entry(-5252, { description: "Brf Spillkråkan 3" });
    const b = entry(-5252, { description: "BRF  Spillkråkan 3  2026" });
    const keep = entry(-5000, { description: "Webhallen" });
    const data = workspace(
      { acc: [a, b, keep] },
      {
        itemFindExclusionPatterns: [normaliseDescription("Brf Spillkråkan 3")],
      },
    );
    const out = findItemPurchaseCandidates(data, settings());
    // Both rent rows collapse to the same normalised key and drop; the
    // unrelated purchase survives.
    expect(out.map((c) => c.entryId)).toEqual([keep.id]);
  });

  it("restricts to the configured types when the allow-list is set", () => {
    const withType = entry(-5000, { userTypeId: "electronics" });
    const otherType = entry(-5000, { userTypeId: "rent" });
    const noType = entry(-5000);
    const data = workspace({ acc: [withType, otherType, noType] });
    const out = findItemPurchaseCandidates(
      data,
      settings({ itemFindTypeIds: ["electronics"] }),
    );
    expect(out.map((c) => c.entryId)).toEqual([withType.id]);
  });

  it("reports the count of existing line items", () => {
    const data = workspace({
      acc: [
        entry(-5000, {
          lineItems: [{ id: "l1", itemId: "i1" }],
        }),
      ],
    });
    const out = findItemPurchaseCandidates(data, settings());
    expect(out[0].existingLineItemCount).toBe(1);
  });

  it("drops entries whose linked items cover the full amount", () => {
    // 5 000 spent, one linked item bought for 5 000: fully catalogued,
    // so the scan stops resurfacing it.
    const done = entry(-5000, { lineItems: [{ id: "l1", itemId: "i1" }] });
    const data = workspace(
      { acc: [done] },
      { items: [{ id: "i1", name: "Watch", purchasePrice: 5000 }] },
    );
    const out = findItemPurchaseCandidates(data, settings());
    expect(out).toHaveLength(0);
  });

  it("keeps partially allocated entries — more items may be left to add", () => {
    const partial = entry(-20000, {
      lineItems: [{ id: "l1", itemId: "i1" }],
    });
    const data = workspace(
      { acc: [partial] },
      { items: [{ id: "i1", name: "iPhone", purchasePrice: 15000 }] },
    );
    const out = findItemPurchaseCandidates(data, settings());
    expect(out.map((c) => c.entryId)).toEqual([partial.id]);
    expect(out[0].existingLineItemCount).toBe(1);
  });

  it("keeps entries whose linked items carry no purchase price", () => {
    // An item linked without a price contributes nothing to the
    // allocation, so the entry still reads as uncatalogued.
    const unpriced = entry(-5000, {
      lineItems: [{ id: "l1", itemId: "i1" }],
    });
    const data = workspace(
      { acc: [unpriced] },
      { items: [{ id: "i1", name: "Watch" }] },
    );
    const out = findItemPurchaseCandidates(data, settings());
    expect(out.map((c) => c.entryId)).toEqual([unpriced.id]);
  });
});
