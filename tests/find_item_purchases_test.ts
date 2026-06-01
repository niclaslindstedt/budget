import { describe, expect, it } from "vitest";

import { findItemPurchaseCandidates } from "../src/data/items/find";
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
    ignoredItemEntryIds: [],
    ...overrides,
  } as unknown as UserData;
}

function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, itemFindThreshold: 2000, ...overrides };
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
          lineItems: [{ id: "l1", itemId: "i1", amount: -1500 }],
        }),
      ],
    });
    const out = findItemPurchaseCandidates(data, settings());
    expect(out[0].existingLineItemCount).toBe(1);
  });
});
