import { describe, expect, it } from "vitest";

import {
  applyMetadataToMatchingEntries,
  countMatchingMetadataTargets,
  type HistoryMetadataPatch,
} from "../src/data/budget/pattern-apply";
import { derivePatternFromDescription } from "../src/data/budget/pattern-derive";
import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import { reducer } from "../src/data/reducer";
import { createDefaultSheet } from "../src/data/sheet";
import type { AccountBudget, HistoryEntry, UserData } from "../src/data/types";

function entry(over: Partial<HistoryEntry> & { id: string }): HistoryEntry {
  return {
    date: "2026-04-20",
    description: "Insättning från annan bank BARNBDR",
    amount: 625,
    importedAt: 0,
    ...over,
  };
}

// The pattern the modal derives from the source entry's bank text —
// dates / ref numbers stripped so it matches related entries, not just
// the one the user clicked.
const PATTERN = derivePatternFromDescription(
  "Insättning från annan bank BARNBDR",
);

const PATCH: HistoryMetadataPatch = {
  userTypeId: "type-child-benefit",
  userCompanyId: "company-fk",
  userDescription: "Barnbidrag",
};

describe("metadata bulk apply — matching + fill-blanks", () => {
  it("derives a pattern that matches lookalikes regardless of the date prefix", () => {
    const entries = [
      entry({ id: "src" }),
      entry({ id: "m1", date: "2026-03-20", description: "20/3 BARNBDR" }),
    ];
    // Both share the BARNBDR merchant token; the second buries it after
    // a date the deriver strips.
    const pattern = derivePatternFromDescription("20/4 BARNBDR");
    const next = applyMetadataToMatchingEntries(
      entries,
      pattern,
      { userTypeId: "t" },
      "src",
    );
    const m1 = next.find((e) => e.id === "m1");
    expect(m1?.userTypeId).toBe("t");
  });

  it("fills blank fields on matches and excludes the source entry", () => {
    const entries = [
      entry({ id: "src" }),
      entry({ id: "m1", date: "2026-03-20" }),
      entry({ id: "m2", date: "2026-02-20" }),
    ];
    const next = applyMetadataToMatchingEntries(entries, PATTERN, PATCH, "src");

    // Source untouched — it's saved separately.
    const src = next.find((e) => e.id === "src");
    expect(src?.userTypeId).toBeUndefined();
    expect(src).toBe(entries[0]);

    for (const id of ["m1", "m2"]) {
      const e = next.find((x) => x.id === id);
      expect(e?.userTypeId).toBe("type-child-benefit");
      expect(e?.userCompanyId).toBe("company-fk");
      expect(e?.userDescription).toBe("Barnbidrag");
    }
  });

  it("never overwrites a field a match already carries", () => {
    const entries = [
      entry({ id: "src" }),
      entry({
        id: "m1",
        date: "2026-03-20",
        userTypeId: "type-other",
        userDescription: "Mine",
      }),
    ];
    const next = applyMetadataToMatchingEntries(entries, PATTERN, PATCH, "src");
    const m1 = next.find((e) => e.id === "m1");
    // Pre-existing type / description preserved; the blank company fills.
    expect(m1?.userTypeId).toBe("type-other");
    expect(m1?.userDescription).toBe("Mine");
    expect(m1?.userCompanyId).toBe("company-fk");
  });

  it("does not fill company on an entry flagged noCompany", () => {
    const entries = [
      entry({ id: "src" }),
      entry({ id: "m1", date: "2026-03-20", noCompany: true }),
    ];
    const next = applyMetadataToMatchingEntries(entries, PATTERN, PATCH, "src");
    const m1 = next.find((e) => e.id === "m1");
    expect(m1?.userCompanyId).toBeUndefined();
    // Type / description still fill — only the company is gated.
    expect(m1?.userTypeId).toBe("type-child-benefit");
  });

  it("skips hidden, transfer, collapsed and split entries", () => {
    const entries = [
      entry({ id: "src" }),
      entry({ id: "hidden", date: "2026-03-20", hidden: true }),
      entry({ id: "transfer", date: "2026-03-19", isTransfer: true }),
      entry({
        id: "collapsed",
        date: "2026-03-18",
        collapsedIntoTransferId: "tx1",
      }),
      entry({
        id: "split",
        date: "2026-03-17",
        splits: [
          { description: "a", amount: 300, typeId: "x" },
          { description: "b", amount: 325, typeId: "y" },
        ],
      }),
    ];
    const next = applyMetadataToMatchingEntries(entries, PATTERN, PATCH, "src");
    // No eligible match → input array returned unchanged.
    expect(next).toBe(entries);
  });

  it("unions tags rather than replacing them", () => {
    const entries = [
      entry({ id: "src" }),
      entry({ id: "m1", date: "2026-03-20", userTagIds: ["keep"] }),
    ];
    const next = applyMetadataToMatchingEntries(
      entries,
      PATTERN,
      { userTagIds: ["add"] },
      "src",
    );
    const m1 = next.find((e) => e.id === "m1");
    expect(m1?.userTagIds).toEqual(["keep", "add"]);
  });

  it("counts only entries the patch would actually change", () => {
    const entries = [
      entry({ id: "src" }),
      entry({ id: "m1", date: "2026-03-20" }),
      // Already fully labelled — nothing to fill.
      entry({
        id: "m2",
        date: "2026-02-20",
        userTypeId: "type-child-benefit",
        userCompanyId: "company-fk",
        userDescription: "Barnbidrag",
      }),
      // Different merchant — pattern doesn't match.
      entry({ id: "other", date: "2026-01-20", description: "ICA Maxi 12/1" }),
    ];
    expect(countMatchingMetadataTargets(entries, PATTERN, PATCH, "src")).toBe(
      1,
    );
  });

  it("counts nothing for an empty patch or empty pattern", () => {
    const entries = [entry({ id: "src" }), entry({ id: "m1" })];
    expect(countMatchingMetadataTargets(entries, PATTERN, {}, "src")).toBe(0);
    expect(countMatchingMetadataTargets(entries, "", PATCH, "src")).toBe(0);
  });
});

function workspaceWith(entries: HistoryEntry[]): UserData {
  const sheet = createDefaultSheet("Budget", "acct1");
  const item = sheet.items[0] as AccountBudget;
  item.rows = [];
  return {
    version: 47,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [{ id: "acct1", name: "Checking" }],
    companies: [],
    tags: [],
    categories: [],
    types: [],
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    transfers: [],
    history: { acct1: entries },
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    matchRules: [],
    seriesMatchRules: [],
    renamePatterns: {},
    seriesMetadata: {},
    primaryIncomeMerchants: [],
    settings: {
      ...DEFAULT_PERSISTED_SETTINGS,
      device: {
        mobile: { ...DEFAULT_PERSISTED_SETTINGS.device.mobile },
        desktop: { ...DEFAULT_PERSISTED_SETTINGS.device.desktop },
      },
    },
  } as UserData;
}

describe("applyMetadataToMatchingHistory reducer action", () => {
  it("stamps matching entries and leaves the rest of the workspace alone", () => {
    const state = workspaceWith([
      entry({ id: "src" }),
      entry({ id: "m1", date: "2026-03-20" }),
    ]);
    const next = reducer(state, {
      type: "applyMetadataToMatchingHistory",
      accountId: "acct1",
      pattern: PATTERN,
      excludeEntryId: "src",
      patch: PATCH,
    });
    const m1 = next.history.acct1.find((e) => e.id === "m1");
    expect(m1?.userTypeId).toBe("type-child-benefit");
    expect(next.history.acct1.find((e) => e.id === "src")?.userTypeId).toBe(
      undefined,
    );
  });

  it("is a no-op (same state reference) when nothing matches", () => {
    const state = workspaceWith([entry({ id: "src" })]);
    const next = reducer(state, {
      type: "applyMetadataToMatchingHistory",
      accountId: "acct1",
      pattern: PATTERN,
      excludeEntryId: "src",
      patch: PATCH,
    });
    expect(next).toBe(state);
  });
});
