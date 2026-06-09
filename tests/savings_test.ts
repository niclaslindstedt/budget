import { describe, expect, it } from "vitest";

import { detectTransferCandidates } from "../src/data/accounts/transfer-collapse";
import { migrate } from "../src/data/migrations";
import { reducer } from "../src/data/reducer";
import { currentSavingBalance } from "../src/data/savings/value";
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
    expect(data.version).toBe(70);
  });
});
