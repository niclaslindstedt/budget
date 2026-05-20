import { describe, expect, it } from "vitest";

import {
  buildAccountsExport,
  serializeAccountsExport,
} from "../src/data/accounts-export";
import type { Account, Transaction } from "../src/data/types";

const ACC_A: Account = {
  id: "a",
  name: "Lönekonto",
  bank: "Skandia",
  clearing: "9150",
  accountNumber: "1234567",
  iban: "SE001",
  color: "#abc",
  openingBalance: 1000,
};
const ACC_B: Account = {
  id: "b",
  name: "Sparkonto",
  bank: "ICA",
  openingBalance: 500,
};

const TX_AB: Transaction = {
  id: "tx1",
  date: "2026-05-01",
  description: "Transfer",
  amount: 200,
  fromAccountId: "a",
  toAccountId: "b",
};

const TX_AX: Transaction = {
  id: "tx2",
  date: "2026-05-02",
  description: "External",
  amount: 50,
  fromAccountId: "a",
  toAccountId: "external",
};

describe("buildAccountsExport", () => {
  it("includes only selected accounts", () => {
    const payload = buildAccountsExport({
      accounts: [ACC_A, ACC_B],
      transactions: [],
      selectedAccountIds: ["a"],
      accountInfo: { a: true },
      includeTransactions: false,
    });
    expect(payload.accounts.length).toBe(1);
    expect(payload.accounts[0].id).toBe("a");
    expect(payload.transactions).toBeUndefined();
  });

  it("trims bank details when accountInfo is off", () => {
    const payload = buildAccountsExport({
      accounts: [ACC_A],
      transactions: [],
      selectedAccountIds: ["a"],
      accountInfo: { a: false },
      includeTransactions: false,
    });
    const entry = payload.accounts[0];
    expect(entry.id).toBe("a");
    expect(entry.name).toBe("Lönekonto");
    expect(entry.color).toBe("#abc");
    expect(entry.openingBalance).toBe(1000);
    // Bank, clearing, IBAN must be excluded when account info is off.
    expect(entry.bank).toBeUndefined();
    expect(entry.clearing).toBeUndefined();
    expect(entry.iban).toBeUndefined();
  });

  it("includes bank details when accountInfo is on", () => {
    const payload = buildAccountsExport({
      accounts: [ACC_A],
      transactions: [],
      selectedAccountIds: ["a"],
      accountInfo: { a: true },
      includeTransactions: false,
    });
    expect(payload.accounts[0].bank).toBe("Skandia");
    expect(payload.accounts[0].clearing).toBe("9150");
    expect(payload.accounts[0].iban).toBe("SE001");
  });

  it("filters transactions to those touching a selected account", () => {
    const payload = buildAccountsExport({
      accounts: [ACC_A, ACC_B],
      transactions: [TX_AB, TX_AX],
      selectedAccountIds: ["a", "b"],
      accountInfo: { a: true, b: true },
      includeTransactions: true,
    });
    expect(payload.transactions?.length).toBe(2);
    expect(payload.transactions?.map((t) => t.id)).toEqual(["tx1", "tx2"]);
  });

  it("emits an empty transactions array when none touch selected accounts", () => {
    const payload = buildAccountsExport({
      accounts: [ACC_A],
      transactions: [TX_AB],
      // Only b is selected — TX_AB still touches b.
      selectedAccountIds: ["b"],
      accountInfo: { b: true },
      includeTransactions: true,
    });
    expect(payload.transactions?.length).toBe(1);
    expect(payload.transactions?.[0].id).toBe("tx1");
  });
});

describe("serializeAccountsExport", () => {
  it("produces pretty-printed JSON with a trailing newline", () => {
    const payload = buildAccountsExport({
      accounts: [ACC_B],
      transactions: [],
      selectedAccountIds: ["b"],
      accountInfo: { b: true },
      includeTransactions: false,
    });
    const text = serializeAccountsExport(payload);
    expect(text.endsWith("\n")).toBe(true);
    const reparsed = JSON.parse(text);
    expect(reparsed.accounts[0].name).toBe("Sparkonto");
  });
});
