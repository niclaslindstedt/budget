import { describe, expect, it } from "vitest";

import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import { normaliseDescription } from "../src/data/description-normaliser";
import { importOverlap, stageHistoryImport } from "../src/data/import-staging";
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

function he(date: string, id = date): HistoryEntry {
  return { id, date, description: "x", amount: -1, importedAt: 0 };
}

describe("importOverlap", () => {
  it("returns null with no existing history or nothing new to add", () => {
    expect(importOverlap([], [he("2026-02-01")])).toBeNull();
    expect(importOverlap([he("2026-02-01")], [])).toBeNull();
  });

  it("returns null for a clean continuation or a small overlap", () => {
    // existing January, new February onward — disjoint.
    expect(
      importOverlap(
        [he("2026-01-01"), he("2026-01-31")],
        [he("2026-02-01"), he("2026-02-28")],
      ),
    ).toBeNull();
    // existing through Feb 5, new from Feb 1 — a 4-day overlap, within slack.
    expect(
      importOverlap(
        [he("2026-01-01"), he("2026-02-05")],
        [he("2026-02-01"), he("2026-03-01")],
      ),
    ).toBeNull();
  });

  it("flags an overlap beyond the slack with the overlapping range", () => {
    // existing through Feb 20, new from Feb 1 — a 19-day overlap.
    expect(
      importOverlap(
        [he("2026-01-01"), he("2026-02-20")],
        [he("2026-02-01"), he("2026-03-01")],
      ),
    ).toEqual({ start: "2026-02-01", end: "2026-02-20" });
  });

  it("flags a statement whose whole range is already covered", () => {
    // existing spans Jan–June; importing a March statement into it.
    expect(
      importOverlap(
        [he("2026-01-01"), he("2026-06-30")],
        [he("2026-03-01"), he("2026-03-31")],
      ),
    ).toEqual({ start: "2026-03-01", end: "2026-03-31" });
  });
});

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
      bankName: undefined,
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

  it("auto-moves a past-dated one-off prediction past the latest date", () => {
    // Bracketing entries (Jan 31 + Mar 30) make February covered. A
    // one-off prediction dated Feb 15 that never posted is moved to the
    // day after the latest transaction, silently — no modal.
    const data = makeData({
      rows: [row({ id: "r1", date: "2026-02-15", amount: -999 })],
    });
    data.settings.startOfMonth = 1; // calendar months for a simple boundary
    const staged = stageHistoryImport(
      data,
      ACCOUNT_ID,
      parsed([
        { date: "2026-01-31", description: "OPENING", amount: -1 },
        { date: "2026-03-30", description: "SIMPLEKO", amount: -5252 },
      ]),
      "q1.csv",
      111,
    );
    expect(staged.outcome.kind).toBe("commit");
    expect(staged.autoOrphanMoves).toEqual([
      { rowId: "r1", toDate: "2026-03-31" },
    ]);
  });

  it("prompts (doesn't auto-move) a recurring entry that would leapfrog its next occurrence", () => {
    // Feb + Mar predicted in series s1; bracketing entries cover Feb but
    // not Mar (latest is Mar 30). Moving the Feb occurrence forward would
    // pass the Mar occurrence, so it stays a modal prompt, not a silent
    // move.
    const data = makeData({
      rows: [
        {
          ...row({ id: "rFeb", date: "2026-02-01", amount: -5252 }),
          seriesId: "s1",
        },
        {
          ...row({ id: "rMar", date: "2026-03-01", amount: -5252 }),
          seriesId: "s1",
        },
      ],
    });
    data.settings.startOfMonth = 1; // calendar months for a simple boundary
    const staged = stageHistoryImport(
      data,
      ACCOUNT_ID,
      parsed([
        { date: "2026-01-31", description: "OPENING", amount: -1 },
        { date: "2026-03-30", description: "OTHER", amount: -10 },
      ]),
      "q1.csv",
      111,
    );
    expect(staged.outcome.kind).toBe("reconciliation");
    expect(staged.autoOrphanMoves).toHaveLength(0);
    if (staged.outcome.kind !== "reconciliation") return;
    expect(staged.outcome.orphans.map((o) => o.rowId)).toEqual(["rFeb"]);
  });

  it("carries the bank-extracted name / clearing / account number into pendingImport", () => {
    const data = makeData();
    const file: ParsedBankFile = {
      bankParserId: "skandia-xlsx",
      bankName: "Skandiabanken",
      bankClearing: "9169",
      bankAccountNumber: "1234567",
      entries: [{ date: "2026-03-30", description: "SIMPLEKO", amount: -5252 }],
    };
    const staged = stageHistoryImport(data, ACCOUNT_ID, file, "x.xlsx", 9);
    expect(staged.pendingImport.bankName).toBe("Skandiabanken");
    expect(staged.pendingImport.bankClearing).toBe("9169");
    expect(staged.pendingImport.bankAccountNumber).toBe("1234567");
    expect(staged.pendingImport.now).toBe(9);
  });
});
