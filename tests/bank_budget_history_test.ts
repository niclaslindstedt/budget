import { describe, expect, it } from "vitest";

import {
  buildHistoryExportRows,
  writeHistoryCsv,
  writeHistoryXlsx,
} from "../src/data/history-export";
import type {
  Category,
  EntryType,
  HistoryEntry,
  Settings,
} from "../src/data/types";
import {
  historyEntryId,
  makeBankFile,
  mergeHistory,
  parseBankFile,
} from "../src/storage/bank-parsers";

const SETTINGS: Settings = {
  currency: "SEK",
  currencyPosition: "after",
  currencySpace: true,
  decimalSeparator: ",",
  thousandsSeparator: " ",
  dateFormat: "YYYY-MM-DD",
  shortDateFormat: "D MMM",
  showCurrency: true,
  showDecimals: true,
  formatNumbers: true,
  hideTransfers: false,
  startOfMonth: 1,
  language: "en",
  theme: "system",
  fontFamily: "system",
  radius: "md",
  density: "comfortable",
  borderWidth: "normal",
  reduceMotion: false,
  lastSeenChangelogVersion: undefined,
} as Settings;

const TYPES: readonly EntryType[] = [
  {
    id: "type-groceries",
    name: "Groceries",
    color: "#abc",
    glyph: "shopping-cart",
    categoryId: "cat-food",
    kind: "expense",
  },
];

const CATEGORIES: readonly Category[] = [
  { id: "cat-food", name: "Food", color: "#fed" },
];

function entry(over: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: over.id ?? "abc12345",
    date: over.date ?? "2026-05-01",
    description: over.description ?? "ICA Maxi",
    amount: over.amount ?? -100,
    importedAt: over.importedAt ?? 0,
    balance: over.balance,
    hidden: over.hidden,
    userTypeId: over.userTypeId,
    userDescription: over.userDescription,
  };
}

function withRealId(e: HistoryEntry): HistoryEntry {
  return { ...e, id: historyEntryId(e) };
}

const ENTRIES: readonly HistoryEntry[] = [
  withRealId(
    entry({
      date: "2026-05-01",
      description: "ICA Maxi Söder",
      amount: -123.45,
      balance: 9_876.55,
    }),
  ),
  withRealId(
    entry({
      date: "2026-05-02",
      description: "Salary, May",
      amount: 30_000,
      balance: 39_876.55,
    }),
  ),
  withRealId(
    entry({
      date: "2026-05-03",
      description: "Coffee at Espresso House",
      amount: -45,
      balance: 39_831.55,
      userTypeId: "type-groceries",
    }),
  ),
];

describe("bank-budget-history (csv round-trip)", () => {
  it("re-imports its own CSV as 0 added, N duplicates", async () => {
    const rows = buildHistoryExportRows({
      entries: ENTRIES,
      types: TYPES,
      categories: CATEGORIES,
      merchantHints: {},
      matchRules: [],
    });
    const csv = writeHistoryCsv(rows, "SEK");
    const file = makeBankFile(
      "myaccount-history-2026-05-24.csv",
      new TextEncoder().encode(csv).buffer as ArrayBuffer,
    );
    const parsed = await parseBankFile(file);
    expect(parsed.bankParserId).toBe("budget-history");
    expect(parsed.entries).toHaveLength(ENTRIES.length);

    const merge = mergeHistory(ENTRIES, parsed.entries, 1);
    expect(merge.addedCount).toBe(0);
    expect(merge.duplicateCount).toBe(ENTRIES.length);
  });

  it("survives entries with no balance (credit-card style)", async () => {
    const ccEntry = withRealId(
      entry({
        date: "2026-05-05",
        description: "Klarna purchase",
        amount: -99.5,
        balance: undefined,
      }),
    );
    const rows = buildHistoryExportRows({
      entries: [ccEntry],
      types: TYPES,
      categories: CATEGORIES,
      merchantHints: {},
      matchRules: [],
    });
    const csv = writeHistoryCsv(rows);
    const parsed = await parseBankFile(
      makeBankFile(
        "cc-history.csv",
        new TextEncoder().encode(csv).buffer as ArrayBuffer,
      ),
    );
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].balance).toBeUndefined();
    const merge = mergeHistory([ccEntry], parsed.entries, 1);
    expect(merge.addedCount).toBe(0);
    expect(merge.duplicateCount).toBe(1);
  });

  it("rejects a CSV whose first header is not Date", async () => {
    const bogus =
      '"Whatever","Description","Amount","Balance","Type","Category"\n"2026-05-01","x",1,1,"",""';
    await expect(
      parseBankFile(
        makeBankFile(
          "bogus.csv",
          new TextEncoder().encode(bogus).buffer as ArrayBuffer,
        ),
      ),
    ).rejects.toThrow(/no parser matched/i);
  });
});

describe("bank-budget-history (xlsx round-trip)", () => {
  it("re-imports its own XLSX as 0 added, N duplicates", async () => {
    const rows = buildHistoryExportRows({
      entries: ENTRIES,
      types: TYPES,
      categories: CATEGORIES,
      merchantHints: {},
      matchRules: [],
    });
    const bytes = writeHistoryXlsx({
      rows,
      accountName: "My Account",
      settings: SETTINGS,
    });
    const file = makeBankFile(
      "myaccount-history-2026-05-24.xlsx",
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
    );
    const parsed = await parseBankFile(file);
    expect(parsed.bankParserId).toBe("budget-history");
    expect(parsed.entries).toHaveLength(ENTRIES.length);

    const merge = mergeHistory(ENTRIES, parsed.entries, 1);
    expect(merge.addedCount).toBe(0);
    expect(merge.duplicateCount).toBe(ENTRIES.length);
  });
});
