import { describe, expect, it } from "vitest";

import {
  buildAccountsExport,
  serializeAccountsExport,
} from "../src/data/accounts/export";
import type { Account, HistoryEntry, Sheet, Transfer } from "../src/data/types";

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

const TRANSFER_AB: Transfer = {
  id: "tx1",
  date: "2026-05-01",
  description: "Transfer",
  amount: 200,
  fromAccountId: "a",
  toAccountId: "b",
};

const TRANSFER_AX: Transfer = {
  id: "tx2",
  date: "2026-05-02",
  description: "External",
  amount: 50,
  fromAccountId: "a",
  toAccountId: "external",
};

const HIST_A1: HistoryEntry = {
  id: "h1",
  date: "2026-04-15",
  description: "ICA Maxi",
  amount: -120,
  balance: 880,
  importedAt: 1714000000000,
};

const HIST_B1: HistoryEntry = {
  id: "h2",
  date: "2026-04-20",
  description: "Salary",
  amount: 25000,
  balance: 25500,
  importedAt: 1714200000000,
};

const TODAY = "2026-05-15";

const EMPTY_OPTS = {
  sheets: [] as Sheet[],
  transactions: {} as Record<string, HistoryEntry[]>,
  transfers: [] as Transfer[],
  today: TODAY,
  includeUnconfirmed: false,
  includeFuture: false,
  dateFormat: "YYYY-MM-DD" as const,
  lang: "en" as const,
};

describe("buildAccountsExport", () => {
  it("includes only selected accounts", () => {
    const payload = buildAccountsExport({
      ...EMPTY_OPTS,
      accounts: [ACC_A, ACC_B],
      selectedAccountIds: ["a"],
      accountInfo: { a: true },
      accountTransactions: { a: true },
      includeTransactions: false,
    });
    expect(payload.accounts.length).toBe(1);
    expect(payload.accounts[0].id).toBe("a");
    expect(payload.transactions).toBeUndefined();
    expect(payload.transfers).toBeUndefined();
  });

  it("trims bank details when accountInfo is off", () => {
    const payload = buildAccountsExport({
      ...EMPTY_OPTS,
      accounts: [ACC_A],
      selectedAccountIds: ["a"],
      accountInfo: { a: false },
      accountTransactions: { a: true },
      includeTransactions: false,
    });
    const entry = payload.accounts[0];
    expect(entry.id).toBe("a");
    expect(entry.name).toBe("Lönekonto");
    expect(entry.color).toBe("#abc");
    expect(entry.openingBalance).toBe(1000);
    expect(entry.bank).toBeUndefined();
    expect(entry.clearing).toBeUndefined();
    expect(entry.iban).toBeUndefined();
  });

  it("includes bank details when accountInfo is on", () => {
    const payload = buildAccountsExport({
      ...EMPTY_OPTS,
      accounts: [ACC_A],
      selectedAccountIds: ["a"],
      accountInfo: { a: true },
      accountTransactions: { a: true },
      includeTransactions: false,
    });
    expect(payload.accounts[0].bank).toBe("Skandia");
    expect(payload.accounts[0].clearing).toBe("9150");
    expect(payload.accounts[0].iban).toBe("SE001");
  });

  it("emits per-account transactions from history", () => {
    const payload = buildAccountsExport({
      ...EMPTY_OPTS,
      accounts: [ACC_A, ACC_B],
      transactions: { a: [HIST_A1], b: [HIST_B1] },
      selectedAccountIds: ["a", "b"],
      accountInfo: { a: true, b: true },
      accountTransactions: { a: true, b: true },
      includeTransactions: true,
    });
    expect(payload.transactions).toBeDefined();
    expect(payload.transactions?.a?.length).toBe(1);
    expect(payload.transactions?.a?.[0].id).toBe("h1");
    expect(payload.transactions?.b?.[0].description).toBe("Salary");
  });

  it("drops a per-account transactions entry when accountTransactions is off", () => {
    const payload = buildAccountsExport({
      ...EMPTY_OPTS,
      accounts: [ACC_A, ACC_B],
      transactions: { a: [HIST_A1], b: [HIST_B1] },
      selectedAccountIds: ["a", "b"],
      accountInfo: { a: true, b: true },
      accountTransactions: { a: false, b: true },
      includeTransactions: true,
    });
    expect(payload.transactions?.a).toBeUndefined();
    expect(payload.transactions?.b?.[0].id).toBe("h2");
  });

  it("includes cross-account transfers touching an allowed account", () => {
    const payload = buildAccountsExport({
      ...EMPTY_OPTS,
      accounts: [ACC_A, ACC_B],
      transfers: [TRANSFER_AB, TRANSFER_AX],
      selectedAccountIds: ["a", "b"],
      accountInfo: { a: true, b: true },
      accountTransactions: { a: true, b: true },
      includeTransactions: true,
    });
    expect(payload.transfers?.length).toBe(2);
    expect(payload.transfers?.map((t) => t.id)).toEqual(["tx1", "tx2"]);
  });

  it("drops both transactions and transfers when includeTransactions is off", () => {
    const payload = buildAccountsExport({
      ...EMPTY_OPTS,
      accounts: [ACC_A, ACC_B],
      transactions: { a: [HIST_A1] },
      transfers: [TRANSFER_AB],
      selectedAccountIds: ["a", "b"],
      accountInfo: { a: true, b: true },
      accountTransactions: { a: true, b: true },
      includeTransactions: false,
    });
    expect(payload.transactions).toBeUndefined();
    expect(payload.transfers).toBeUndefined();
  });

  it("emits confirmed past budget entries by default", () => {
    const sheet: Sheet = {
      id: "s1",
      name: "Wallet",
      type: "budget",
      glyph: "wallet",
      color: "#fff",
      description: "",
      items: [
        {
          id: "i1",
          type: "accountBudget",
          accountId: "a",
          columns: [
            { id: "c-date", type: "date", label: "Date" },
            { id: "c-desc", type: "description", label: "Description" },
            { id: "c-amt", type: "amount", label: "Amount" },
            { id: "c-ok", type: "completed", label: "Done" },
          ],
          rows: [
            {
              id: "r-past-ok",
              cells: {
                "c-date": "2026-04-01",
                "c-desc": "Confirmed past",
                "c-amt": -50,
                "c-ok": true,
              },
            },
            {
              id: "r-past-no",
              cells: {
                "c-date": "2026-04-02",
                "c-desc": "Unconfirmed past",
                "c-amt": -25,
                "c-ok": false,
              },
            },
            {
              id: "r-future-ok",
              cells: {
                "c-date": "2026-06-01",
                "c-desc": "Confirmed future",
                "c-amt": -10,
                "c-ok": true,
              },
            },
          ],
        },
      ],
    };
    const payload = buildAccountsExport({
      ...EMPTY_OPTS,
      accounts: [ACC_A],
      sheets: [sheet],
      selectedAccountIds: ["a"],
      accountInfo: { a: true },
      accountTransactions: { a: true },
      includeTransactions: false,
    });
    expect(payload.budgetEntries?.a?.length).toBe(1);
    expect(payload.budgetEntries?.a?.[0].id).toBe("r-past-ok");
  });

  it("widens the budget filter when unconfirmed + future toggles are on", () => {
    const sheet: Sheet = {
      id: "s1",
      name: "Wallet",
      type: "budget",
      glyph: "wallet",
      color: "#fff",
      description: "",
      items: [
        {
          id: "i1",
          type: "accountBudget",
          accountId: "a",
          columns: [
            { id: "c-date", type: "date", label: "Date" },
            { id: "c-desc", type: "description", label: "Description" },
            { id: "c-amt", type: "amount", label: "Amount" },
            { id: "c-ok", type: "completed", label: "Done" },
          ],
          rows: [
            {
              id: "r-past-ok",
              cells: {
                "c-date": "2026-04-01",
                "c-desc": "Confirmed past",
                "c-amt": -50,
                "c-ok": true,
              },
            },
            {
              id: "r-past-no",
              cells: {
                "c-date": "2026-04-02",
                "c-desc": "Unconfirmed past",
                "c-amt": -25,
                "c-ok": false,
              },
            },
            {
              id: "r-future-ok",
              cells: {
                "c-date": "2026-06-01",
                "c-desc": "Confirmed future",
                "c-amt": -10,
                "c-ok": true,
              },
            },
          ],
        },
      ],
    };
    const payload = buildAccountsExport({
      ...EMPTY_OPTS,
      accounts: [ACC_A],
      sheets: [sheet],
      selectedAccountIds: ["a"],
      accountInfo: { a: true },
      accountTransactions: { a: true },
      includeTransactions: false,
      includeUnconfirmed: true,
      includeFuture: true,
    });
    expect(payload.budgetEntries?.a?.length).toBe(3);
  });

  it("skips budget entries for unselected accounts", () => {
    const sheet: Sheet = {
      id: "s1",
      name: "Wallet",
      type: "budget",
      glyph: "wallet",
      color: "#fff",
      description: "",
      items: [
        {
          id: "i1",
          type: "accountBudget",
          accountId: "b",
          columns: [
            { id: "c-date", type: "date", label: "Date" },
            { id: "c-amt", type: "amount", label: "Amount" },
            { id: "c-ok", type: "completed", label: "Done" },
          ],
          rows: [
            {
              id: "r",
              cells: { "c-date": "2026-04-01", "c-amt": -50, "c-ok": true },
            },
          ],
        },
      ],
    };
    const payload = buildAccountsExport({
      ...EMPTY_OPTS,
      accounts: [ACC_A, ACC_B],
      sheets: [sheet],
      selectedAccountIds: ["a"],
      accountInfo: { a: true },
      accountTransactions: { a: true },
      includeTransactions: false,
    });
    expect(payload.budgetEntries).toBeUndefined();
  });
});

describe("buildAccountsExport formatting", () => {
  it("rounds opening balance / amount / balance to two decimals", () => {
    const drifty: Account = {
      id: "a",
      name: "Drift",
      openingBalance: 251.92999999999998,
    };
    const driftyHist: HistoryEntry = {
      id: "h1",
      date: "2026-04-15",
      description: "Tail",
      amount: -77.90000000000001,
      balance: 35347.41000000001,
      importedAt: 1714000000000,
    };
    const driftyTransfer: Transfer = {
      id: "tx1",
      date: "2026-05-01",
      description: "Move",
      amount: 100.10000000000001,
      fromAccountId: "a",
      toAccountId: "b",
    };
    const payload = buildAccountsExport({
      ...EMPTY_OPTS,
      accounts: [drifty],
      transactions: { a: [driftyHist] },
      transfers: [driftyTransfer],
      selectedAccountIds: ["a"],
      accountInfo: { a: true },
      accountTransactions: { a: true },
      includeTransactions: true,
    });
    expect(payload.accounts[0].openingBalance).toBe(251.93);
    expect(payload.transactions?.a?.[0].amount).toBe(-77.9);
    expect(payload.transactions?.a?.[0].balance).toBe(35347.41);
    expect(payload.transfers?.[0].amount).toBe(100.1);
  });

  it("formats importedAt as a date string using the user's dateFormat", () => {
    // 2024-04-25 in local time for any reasonable TZ offset; we
    // assert via the same local-date conversion the formatter does.
    const ms = 1714000000000;
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    const iso = buildAccountsExport({
      ...EMPTY_OPTS,
      accounts: [ACC_A],
      transactions: { a: [{ ...HIST_A1, importedAt: ms }] },
      selectedAccountIds: ["a"],
      accountInfo: { a: true },
      accountTransactions: { a: true },
      includeTransactions: true,
      dateFormat: "YYYY-MM-DD",
      lang: "en",
    });
    expect(iso.transactions?.a?.[0].importedAt).toBe(`${y}-${m}-${day}`);

    const swedish = buildAccountsExport({
      ...EMPTY_OPTS,
      accounts: [ACC_A],
      transactions: { a: [{ ...HIST_A1, importedAt: ms }] },
      selectedAccountIds: ["a"],
      accountInfo: { a: true },
      accountTransactions: { a: true },
      includeTransactions: true,
      dateFormat: "DD.MM.YYYY",
      lang: "sv",
    });
    expect(swedish.transactions?.a?.[0].importedAt).toBe(`${day}.${m}.${y}`);
  });
});

describe("serializeAccountsExport", () => {
  it("produces pretty-printed JSON with a trailing newline", () => {
    const payload = buildAccountsExport({
      ...EMPTY_OPTS,
      accounts: [ACC_B],
      selectedAccountIds: ["b"],
      accountInfo: { b: true },
      accountTransactions: { b: true },
      includeTransactions: false,
    });
    const text = serializeAccountsExport(payload);
    expect(text.endsWith("\n")).toBe(true);
    const reparsed = JSON.parse(text);
    expect(reparsed.accounts[0].name).toBe("Sparkonto");
  });
});
