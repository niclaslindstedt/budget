import { describe, expect, it } from "vitest";

import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import { normaliseDescription } from "../src/data/description-normaliser";
import { stageHistoryImport } from "../src/data/import-staging";
import type { RenamePatternStore } from "../src/data/rename-patterns";
import type {
  AccountBudget,
  Column,
  HistoryEntry,
  Row,
  Sheet,
  UserData,
} from "../src/data/types";
import type { ParsedBankEntry, ParsedBankFile } from "../src/storage/banks";

const cols: Column[] = [
  { id: "d", type: "date", label: "Date" },
  { id: "x", type: "description", label: "Description" },
  { id: "a", type: "amount", label: "Amount" },
];

const ACCOUNT_ID = "acc-1";

function row(over: { id: string; date: string; amount: number }): Row {
  return {
    kind: "user",
    id: over.id,
    cells: { d: over.date, x: "", a: over.amount },
  };
}

// Build a UserData with one account-budget tracking ACCOUNT_ID, seeded
// with the given budget rows + existing history + rename patterns.
function makeData(
  options: {
    rows?: Row[];
    history?: HistoryEntry[];
    renamePatterns?: RenamePatternStore;
  } = {},
): UserData {
  const item: AccountBudget = {
    id: "ab",
    type: "accountBudget",
    accountId: ACCOUNT_ID,
    columns: cols,
    rows: options.rows ?? [],
  };
  const sheet: Sheet = {
    id: "s",
    name: "Main",
    type: "budget",
    glyph: "wallet",
    color: "var(--color-blue)",
    description: "",
    items: [item],
  };
  return {
    version: 50,
    sheets: [sheet],
    activeSheetId: "s",
    accounts: [],
    companies: [],
    tags: [],
    categories: [],
    types: [],
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    transfers: [],
    history: options.history ? { [ACCOUNT_ID]: options.history } : {},
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    matchRules: [],
    seriesMatchRules: [],
    renamePatterns: options.renamePatterns ?? {},
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

function parsed(entries: ParsedBankEntry[]): ParsedBankFile {
  return { bankParserId: "test-parser", entries };
}

describe("stageHistoryImport", () => {
  it("commits straight away when nothing matches and no renames are learned", () => {
    const data = makeData();
    const staged = stageHistoryImport(
      data,
      ACCOUNT_ID,
      parsed([{ date: "2026-03-30", description: "SIMPLEKO", amount: -5252 }]),
      "march.csv",
      111,
    );
    expect(staged.outcome.kind).toBe("commit");
    expect(staged.dedupeOccurred).toBe(false);
    expect(staged.newEntries).toHaveLength(1);
    expect(staged.pendingImport).toEqual({
      bankParserId: "test-parser",
      bankClearing: undefined,
      bankAccountNumber: undefined,
      filename: "march.csv",
      entries: [{ date: "2026-03-30", description: "SIMPLEKO", amount: -5252 }],
      now: 111,
    });
  });

  it("flags dedupe when a parsed entry repeats within the same file", () => {
    const data = makeData();
    const dupe: ParsedBankEntry = {
      date: "2026-03-30",
      description: "SIMPLEKO",
      amount: -5252,
    };
    const staged = stageHistoryImport(
      data,
      ACCOUNT_ID,
      parsed([dupe, { ...dupe }]),
      "march.csv",
      111,
    );
    expect(staged.dedupeOccurred).toBe(true);
    // Only the first copy lands; the second is the skipped duplicate.
    expect(staged.newEntries).toHaveLength(1);
  });

  it("opens reconciliation when a budget row matches a new entry", () => {
    // Row dated 3 days before the entry, same amount — inside the
    // reconciliation match band (see reconciliation_test).
    const data = makeData({
      rows: [row({ id: "r1", date: "2026-03-27", amount: -5252 })],
    });
    const staged = stageHistoryImport(
      data,
      ACCOUNT_ID,
      parsed([{ date: "2026-03-30", description: "SIMPLEKO", amount: -5252 }]),
      "march.csv",
      111,
    );
    expect(staged.outcome.kind).toBe("reconciliation");
    if (staged.outcome.kind !== "reconciliation") return;
    expect(staged.outcome.candidates).toHaveLength(1);
    expect(staged.outcome.candidates[0]!.rowId).toBe("r1");
  });

  it("opens the rename predictor on the quiet path when a pattern matches", () => {
    const desc = "SIMPLEKO STOCKHOLM";
    const patterns: RenamePatternStore = {
      [ACCOUNT_ID]: {
        [normaliseDescription(desc)]: {
          suggestedDescription: "Rent",
          hitCount: 3,
          lastUsedAt: 5,
        },
      },
    };
    const data = makeData({ renamePatterns: patterns });
    const staged = stageHistoryImport(
      data,
      ACCOUNT_ID,
      parsed([{ date: "2026-03-30", description: desc, amount: -5252 }]),
      "march.csv",
      111,
    );
    expect(staged.outcome.kind).toBe("renamePredictor");
    if (staged.outcome.kind !== "renamePredictor") return;
    expect(staged.outcome.suggestions).toHaveLength(1);
    expect(staged.outcome.suggestions[0]!.suggestedDescription).toBe("Rent");
  });

  it("prefers reconciliation over rename prediction when both apply", () => {
    const desc = "SIMPLEKO STOCKHOLM";
    const patterns: RenamePatternStore = {
      [ACCOUNT_ID]: {
        [normaliseDescription(desc)]: {
          suggestedDescription: "Rent",
          hitCount: 3,
          lastUsedAt: 5,
        },
      },
    };
    const data = makeData({
      rows: [row({ id: "r1", date: "2026-03-27", amount: -5252 })],
      renamePatterns: patterns,
    });
    const staged = stageHistoryImport(
      data,
      ACCOUNT_ID,
      parsed([{ date: "2026-03-30", description: desc, amount: -5252 }]),
      "march.csv",
      111,
    );
    // Reconciliation runs first; rename prediction is deferred until
    // after the reconciliation modal applies.
    expect(staged.outcome.kind).toBe("reconciliation");
  });

  it("carries the bank-extracted clearing / account number into pendingImport", () => {
    const data = makeData();
    const file: ParsedBankFile = {
      bankParserId: "skandia-xlsx",
      bankClearing: "9159",
      bankAccountNumber: "1234567",
      entries: [{ date: "2026-03-30", description: "SIMPLEKO", amount: -5252 }],
    };
    const staged = stageHistoryImport(data, ACCOUNT_ID, file, "x.xlsx", 9);
    expect(staged.pendingImport.bankClearing).toBe("9159");
    expect(staged.pendingImport.bankAccountNumber).toBe("1234567");
    expect(staged.pendingImport.now).toBe(9);
  });
});
