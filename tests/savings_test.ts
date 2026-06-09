import { describe, expect, it } from "vitest";

import { detectTransferCandidates } from "../src/data/accounts/transfer-collapse";
import { LATEST_VERSION, migrate } from "../src/data/migrations";
import { reducer } from "../src/data/reducer";
import {
  applyImportedSavingBalances,
  currentSavingBalance,
} from "../src/data/savings/value";
import { newId } from "../src/data/sheet";
import type {
  HistoryEntry,
  Saving,
  Transfer,
  UserData,
} from "../src/data/types";
import { validateUserData } from "../src/data/validate";
import { freshUserData } from "../src/storage/local";

function makeSaving(overrides: Partial<Saving> = {}): Saving {
  return {
    id: "sav-1",
    kind: "savings",
    name: "Buffer",
    balanceHistory: [],
    ...overrides,
  };
}

function entry(overrides: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: newId(),
    date: "2026-05-01",
    description: "x",
    amount: 0,
    importedAt: 0,
    ...overrides,
  };
}

describe("currentSavingBalance", () => {
  it("returns the latest point by date", () => {
    const saving = makeSaving({
      balanceHistory: [
        { id: "p1", date: "2026-01-01", value: 100 },
        { id: "p3", date: "2026-03-01", value: 300 },
        { id: "p2", date: "2026-02-01", value: 200 },
      ],
    });
    expect(currentSavingBalance(saving)).toBe(300);
  });

  it("is undefined when no balance is recorded", () => {
    expect(currentSavingBalance(makeSaving())).toBeUndefined();
  });
});

describe("savings reducer", () => {
  it("creates, updates, and deletes savings accounts", () => {
    const base = freshUserData();
    const saving = makeSaving({ name: "Buffer", bank: "Bank" });
    const afterCreate = reducer(base, { type: "createSaving", saving });
    expect(afterCreate.savings).toHaveLength(1);

    const afterEdit = reducer(afterCreate, {
      type: "updateSaving",
      savingId: saving.id,
      patch: { name: "Renamed", bank: undefined },
    });
    expect(afterEdit.savings[0].name).toBe("Renamed");
    // `undefined` patch deletes the key, matching a reloaded record.
    expect("bank" in afterEdit.savings[0]).toBe(false);

    const afterDelete = reducer(afterEdit, {
      type: "deleteSaving",
      savingId: saving.id,
    });
    expect(afterDelete.savings).toHaveLength(0);
  });

  it("appends and removes dated balance points", () => {
    const base = reducer(freshUserData(), {
      type: "createSaving",
      saving: makeSaving(),
    });
    const withPoint = reducer(base, {
      type: "addSavingBalance",
      savingId: "sav-1",
      point: { id: "p1", date: "2026-05-01", value: 5000 },
    });
    expect(currentSavingBalance(withPoint.savings[0])).toBe(5000);

    const removed = reducer(withPoint, {
      type: "deleteSavingBalance",
      savingId: "sav-1",
      pointId: "p1",
    });
    expect(removed.savings[0].balanceHistory).toHaveLength(0);
  });

  it("cutting history restores the partner leg of a removed collapsed transfer", () => {
    // A collapsed transfer ties a leg on the everyday account to a leg
    // on the savings account, both hidden + backref'd to the transfer.
    // Cutting the savings account's history drops the transfer (it
    // predates the cutoff) — the partner leg on the everyday account
    // must come back, not be stranded hidden with a dangling backref.
    let state: UserData = reducer(freshUserData(), {
      type: "createSaving",
      saving: makeSaving({ id: "sav-1" }),
    });
    state = {
      ...state,
      accounts: [{ id: "acc-1", name: "Checking" }],
      history: {
        "acc-1": [
          entry({
            id: "h-acc",
            amount: -100,
            hidden: true,
            collapsedIntoTransferId: "t1",
          }),
        ],
        "sav-1": [
          entry({
            id: "h-sav",
            amount: 100,
            hidden: true,
            collapsedIntoTransferId: "t1",
          }),
        ],
      },
      transfers: [
        {
          id: "t1",
          date: "2026-05-01",
          description: "to buffer",
          amount: 100,
          fromAccountId: "acc-1",
          toAccountId: "sav-1",
        },
      ],
    };

    const after = reducer(state, {
      type: "cutAccountHistory",
      accountId: "sav-1",
      cutoffDate: "2026-06-01",
    });

    // The transfer is gone and the savings-side leg trimmed.
    expect(after.transfers).toHaveLength(0);
    expect(after.history["sav-1"]).toHaveLength(0);
    // The everyday-account partner leg is back — visible and detectable.
    const partner = after.history["acc-1"][0];
    expect(partner.id).toBe("h-acc");
    expect(partner.hidden).toBeUndefined();
    expect(partner.collapsedIntoTransferId).toBeUndefined();

    // And it now re-pairs: a fresh savings-side import would surface a
    // candidate again rather than finding nothing.
    const candidates = detectTransferCandidates({
      history: {
        ...after.history,
        "sav-1": [entry({ id: "h-sav2", amount: 100 })],
      },
    });
    expect(candidates).toHaveLength(1);
  });

  it("deleting a savings account cascades its history and transfers", () => {
    let state: UserData = reducer(freshUserData(), {
      type: "createSaving",
      saving: makeSaving({ id: "sav-1" }),
    });
    state = {
      ...state,
      history: { ...state.history, "sav-1": [entry({ amount: 100 })] },
      transfers: [
        {
          id: "t1",
          date: "2026-05-01",
          description: "to buffer",
          amount: 100,
          fromAccountId: "acc-x",
          toAccountId: "sav-1",
        },
      ],
    };
    const after = reducer(state, { type: "deleteSaving", savingId: "sav-1" });
    expect(after.history["sav-1"]).toBeUndefined();
    expect(after.transfers).toHaveLength(0);
  });
});

describe("applyImportedSavingBalances", () => {
  let counter = 0;
  const mint = () => `gen-${counter++}`;

  it("records one closing-balance point per date (last of day)", () => {
    counter = 0;
    const points = applyImportedSavingBalances(
      [],
      [
        entry({ date: "2026-05-01", amount: 100, balance: 1100 }),
        entry({ date: "2026-05-02", amount: 50, balance: 1150 }),
        entry({ date: "2026-05-02", amount: -30, balance: 1120 }),
      ],
      mint,
    );
    expect(points).toEqual([
      { id: "gen-0", date: "2026-05-01", value: 1100 },
      { id: "gen-1", date: "2026-05-02", value: 1120 },
    ]);
  });

  it("collapses same-day entries regardless of input order", () => {
    counter = 0;
    const points = applyImportedSavingBalances(
      [],
      [
        entry({ date: "2026-05-02", amount: -30, balance: 1120 }),
        entry({ date: "2026-05-02", amount: 50, balance: 1150 }),
        entry({ date: "2026-05-01", amount: 100, balance: 1100 }),
      ],
      mint,
    );
    // Stable sort keeps intra-day input order, so the day's closing
    // balance is the last entry on that date as it appears in the file.
    // Ids are minted while walking the date-sorted map, so the earliest
    // date gets the first minted id.
    expect(points).toEqual([
      { id: "gen-0", date: "2026-05-01", value: 1100 },
      { id: "gen-1", date: "2026-05-02", value: 1150 },
    ]);
  });

  it("ignores entries without a running balance", () => {
    const points = applyImportedSavingBalances(
      [{ id: "m1", date: "2026-04-01", value: 999 }],
      [entry({ date: "2026-05-01", amount: 100 })],
      mint,
    );
    expect(points).toEqual([{ id: "m1", date: "2026-04-01", value: 999 }]);
  });

  it("preserves manual points on uncovered dates and reuses ids on covered ones", () => {
    counter = 0;
    const points = applyImportedSavingBalances(
      [
        { id: "manual-keep", date: "2026-04-01", value: 500 },
        { id: "manual-override", date: "2026-05-01", value: 1 },
      ],
      [entry({ date: "2026-05-01", amount: 100, balance: 1100 })],
      mint,
    );
    expect(points).toEqual([
      { id: "manual-keep", date: "2026-04-01", value: 500 },
      // Covered date: id reused, value replaced by the bank's closing balance.
      { id: "manual-override", date: "2026-05-01", value: 1100 },
    ]);
  });
});

describe("importing into a savings account seeds balanceHistory", () => {
  it("derives daily closing balances from the imported statement", () => {
    const base = reducer(freshUserData(), {
      type: "createSaving",
      saving: makeSaving({ id: "sav-1" }),
    });
    const after = reducer(base, {
      type: "importBankHistory",
      accountId: "sav-1",
      bankParserId: "test",
      filename: "buffer.csv",
      entries: [
        {
          date: "2026-05-01",
          description: "deposit",
          amount: 100,
          balance: 1100,
        },
        {
          date: "2026-05-02",
          description: "deposit",
          amount: 50,
          balance: 1150,
        },
        { date: "2026-05-02", description: "fee", amount: -30, balance: 1120 },
      ],
      now: 1,
    });
    const saving = after.savings.find((s) => s.id === "sav-1");
    expect(saving?.balanceHistory).toEqual([
      { id: expect.any(String), date: "2026-05-01", value: 1100 },
      { id: expect.any(String), date: "2026-05-02", value: 1120 },
    ]);
    expect(currentSavingBalance(saving!)).toBe(1120);
    // The transactions still land in the shared history id-space.
    expect(after.history["sav-1"]).toHaveLength(3);
  });

  it("leaves a regular account's savings untouched on import", () => {
    let state: UserData = reducer(freshUserData(), {
      type: "createSaving",
      saving: makeSaving({ id: "sav-1" }),
    });
    state = { ...state, accounts: [{ id: "acc-1", name: "Checking" }] };
    const after = reducer(state, {
      type: "importBankHistory",
      accountId: "acc-1",
      bankParserId: "test",
      filename: "checking.csv",
      entries: [
        { date: "2026-05-01", description: "x", amount: 100, balance: 1100 },
      ],
      now: 1,
    });
    expect(after.savings[0].balanceHistory).toEqual([]);
  });
});

describe("validateUserData — savings as transfer endpoints", () => {
  function workspaceWith(extra: Partial<UserData>): unknown {
    const base = freshUserData();
    return { ...base, ...extra };
  }

  it("keeps a savings-keyed history bucket through validation", () => {
    const raw = workspaceWith({
      savings: [makeSaving({ id: "sav-1" })],
      history: { "sav-1": [entry({ id: "h1", amount: 250 })] },
    });
    const result = validateUserData(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.history["sav-1"]).toHaveLength(1);
    }
  });

  it("accepts a transfer whose endpoint is a savings account", () => {
    const transfer: Transfer = {
      id: "t1",
      date: "2026-05-01",
      description: "to buffer",
      amount: 100,
      fromAccountId: "acc-1",
      toAccountId: "sav-1",
    };
    const raw = workspaceWith({
      accounts: [{ id: "acc-1", name: "Checking" }],
      savings: [makeSaving({ id: "sav-1" })],
      transfers: [transfer],
    });
    const result = validateUserData(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.transfers).toHaveLength(1);
  });
});

describe("detectTransferCandidates — account ↔ savings", () => {
  it("pairs a regular account entry with a savings entry of the opposite sign", () => {
    const history = {
      "acc-1": [
        entry({ id: "a", amount: -100, description: "Överföring buffert" }),
      ],
      "sav-1": [entry({ id: "b", amount: 100, description: "Insättning" })],
    };
    const candidates = detectTransferCandidates({ history });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].fromAccountId).toBe("acc-1");
    expect(candidates[0].toAccountId).toBe("sav-1");
  });
});

describe("migration v69 → v70", () => {
  it("seeds an empty savings array", () => {
    const v69 = { version: 69 } as { version: number };
    const { data } = migrate(v69);
    expect((data as { savings: unknown[] }).savings).toEqual([]);
    expect(data.version).toBe(LATEST_VERSION);
  });
});
