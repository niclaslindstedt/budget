import { describe, expect, it } from "vitest";

import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import { reducer } from "../src/data/reducer";
import type { HistoryEntry, UserData } from "../src/data/types";

function baseState(history: Record<string, HistoryEntry[]> = {}): UserData {
  return {
    version: 50,
    sheets: [
      {
        id: "s",
        name: "S",
        type: "budget",
        glyph: "wallet",
        color: "var(--color-blue)",
        description: "",
        items: [],
      },
    ],
    activeSheetId: "s",
    accounts: [{ id: "acct-1", name: "Checking" }],
    companies: [],
    tags: [],
    categories: [],
    types: [],
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    transfers: [],
    history,
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
  };
}

function entry(id: string, date: string, description: string): HistoryEntry {
  return {
    id,
    date,
    description,
    amount: 30000,
    importedAt: 0,
  };
}

describe("setHistoryEntryPrimaryIncome", () => {
  it("records the merchant and stamps fiscalMonthShift on early arrivals", () => {
    const earlyArrival = entry("e1", "2026-04-22", "LÖN HANDELSBANKEN");
    const onTime = entry("e2", "2026-05-25", "LÖN HANDELSBANKEN");
    const state = baseState({ "acct-1": [earlyArrival, onTime] });
    const next = reducer(state, {
      type: "setHistoryEntryPrimaryIncome",
      accountId: "acct-1",
      entryId: "e1",
      isPrimaryIncome: true,
      anchorDayOfMonth: 25,
    });
    expect(next.primaryIncomeMerchants).toHaveLength(1);
    expect(next.primaryIncomeMerchants[0].anchorDayOfMonth).toBe(25);
    // Apr 22 < 25 → shift = 1 stamped on the entry
    expect(next.history["acct-1"][0].fiscalMonthShift).toBe(1);
    // May 25 >= 25 → no shift
    expect(next.history["acct-1"][1].fiscalMonthShift).toBeUndefined();
  });

  it("supports multiple merchants (job switch keeps the old key tagged)", () => {
    const jobA = entry("a1", "2026-04-22", "LÖN HANDELSBANKEN");
    const jobB = entry("b1", "2026-06-26", "SALARY NORDEA");
    const state = baseState({ "acct-1": [jobA, jobB] });
    const afterA = reducer(state, {
      type: "setHistoryEntryPrimaryIncome",
      accountId: "acct-1",
      entryId: "a1",
      isPrimaryIncome: true,
      anchorDayOfMonth: 25,
    });
    const afterB = reducer(afterA, {
      type: "setHistoryEntryPrimaryIncome",
      accountId: "acct-1",
      entryId: "b1",
      isPrimaryIncome: true,
      anchorDayOfMonth: 27,
    });
    expect(afterB.primaryIncomeMerchants).toHaveLength(2);
    // The old job's pattern still tags its history rows.
    expect(afterB.history["acct-1"][0].fiscalMonthShift).toBe(1);
    // The new job's June 26 entry: 26 < 27 → shift fires.
    expect(afterB.history["acct-1"][1].fiscalMonthShift).toBe(1);
  });

  it("toggling off clears the merchant and the shift on matching entries", () => {
    const earlyArrival = entry("e1", "2026-04-22", "LÖN HANDELSBANKEN");
    const state = baseState({ "acct-1": [earlyArrival] });
    const flagged = reducer(state, {
      type: "setHistoryEntryPrimaryIncome",
      accountId: "acct-1",
      entryId: "e1",
      isPrimaryIncome: true,
      anchorDayOfMonth: 25,
    });
    const cleared = reducer(flagged, {
      type: "setHistoryEntryPrimaryIncome",
      accountId: "acct-1",
      entryId: "e1",
      isPrimaryIncome: false,
      anchorDayOfMonth: null,
    });
    expect(cleared.primaryIncomeMerchants).toHaveLength(0);
    expect(cleared.history["acct-1"][0].fiscalMonthShift).toBeUndefined();
  });
});

describe("setHistoryEntryFiscalMonthShift", () => {
  it("manually pushes one entry to the next fiscal month", () => {
    const e = entry("e1", "2026-04-22", "FREELANCE INC");
    const state = baseState({ "acct-1": [e] });
    const next = reducer(state, {
      type: "setHistoryEntryFiscalMonthShift",
      accountId: "acct-1",
      entryId: "e1",
      shift: 1,
    });
    expect(next.history["acct-1"][0].fiscalMonthShift).toBe(1);
    // Pure manual override doesn't add a merchant.
    expect(next.primaryIncomeMerchants).toHaveLength(0);
  });

  it("clears with shift: null", () => {
    const e = entry("e1", "2026-04-22", "FREELANCE INC");
    e.fiscalMonthShift = 1;
    const state = baseState({ "acct-1": [e] });
    const next = reducer(state, {
      type: "setHistoryEntryFiscalMonthShift",
      accountId: "acct-1",
      entryId: "e1",
      shift: null,
    });
    expect(next.history["acct-1"][0].fiscalMonthShift).toBeUndefined();
  });
});

describe("removePrimaryIncomeMerchant", () => {
  it("drops the rule and clears auto-stamped shift on every match", () => {
    const e = entry("e1", "2026-04-22", "LÖN HANDELSBANKEN");
    const state = baseState({ "acct-1": [e] });
    const flagged = reducer(state, {
      type: "setHistoryEntryPrimaryIncome",
      accountId: "acct-1",
      entryId: "e1",
      isPrimaryIncome: true,
      anchorDayOfMonth: 25,
    });
    const key = flagged.primaryIncomeMerchants[0].key;
    const removed = reducer(flagged, {
      type: "removePrimaryIncomeMerchant",
      key,
    });
    expect(removed.primaryIncomeMerchants).toHaveLength(0);
    expect(removed.history["acct-1"][0].fiscalMonthShift).toBeUndefined();
  });
});
