import { describe, expect, it } from "vitest";

import { sortHistoryByBalance } from "../src/data/accounts/history-order";
import type { HistoryEntry } from "../src/data/types";

function entry(over: Partial<HistoryEntry> & { id: string }): HistoryEntry {
  return {
    date: "2026-05-03",
    description: "Row",
    amount: -100,
    importedAt: 0,
    ...over,
  };
}

const ids = (entries: HistoryEntry[]) => entries.map((e) => e.id);

describe("sortHistoryByBalance", () => {
  it("reorders same-day rows the bank listed out of balance order", () => {
    // A day opens at 20315 and runs 20315 → 20098 → 19820, but the export
    // stored the two same-day rows reversed (the -278 before the -217). The
    // util threads them back into the order whose balance chains.
    const entries: HistoryEntry[] = [
      entry({ id: "open", date: "2026-05-02", amount: -100, balance: 20315 }),
      entry({ id: "second", date: "2026-05-03", amount: -278, balance: 19820 }),
      entry({ id: "first", date: "2026-05-03", amount: -217, balance: 20098 }),
    ];
    expect(ids(sortHistoryByBalance(entries))).toEqual([
      "open",
      "first",
      "second",
    ]);
  });

  it("threads a longer scrambled day into the chaining order", () => {
    // 5000 → 4900 → 4600 → 4550, stored shuffled.
    const entries: HistoryEntry[] = [
      entry({ id: "c", amount: -50, balance: 4550 }),
      entry({ id: "a", amount: -100, balance: 4900 }),
      entry({ id: "b", amount: -300, balance: 4600 }),
      entry({ id: "anchor", date: "2026-05-02", amount: 0, balance: 5000 }),
    ];
    expect(ids(sortHistoryByBalance(entries))).toEqual([
      "anchor",
      "a",
      "b",
      "c",
    ]);
  });

  it("orients the day off the previous day's closing balance", () => {
    // Two same-day rows could chain in either direction on their own; the
    // incoming balance (4000) picks the one that actually follows it.
    const entries: HistoryEntry[] = [
      entry({ id: "prev", date: "2026-05-02", amount: 0, balance: 4000 }),
      entry({ id: "y", amount: -100, balance: 3700 }),
      entry({ id: "x", amount: -200, balance: 3800 }),
    ];
    // 4000 → 3800 (-200) → 3700 (-100): x then y.
    expect(ids(sortHistoryByBalance(entries))).toEqual(["prev", "x", "y"]);
  });

  it("keeps the original order when a day cannot be cleanly chained", () => {
    // The balances don't form one chain (a gap inside the day), so the util
    // leaves the import order untouched rather than guess.
    const entries: HistoryEntry[] = [
      entry({ id: "p", date: "2026-05-02", amount: 0, balance: 9000 }),
      entry({ id: "g1", amount: -100, balance: 5000 }),
      entry({ id: "g2", amount: -100, balance: 3000 }),
    ];
    expect(ids(sortHistoryByBalance(entries))).toEqual(["p", "g1", "g2"]);
  });

  it("leaves a balance-less day in import order", () => {
    const entries: HistoryEntry[] = [
      entry({ id: "b1", balance: undefined }),
      entry({ id: "b2", balance: undefined }),
    ];
    expect(ids(sortHistoryByBalance(entries))).toEqual(["b1", "b2"]);
  });

  it("is a no-op for a single-row-per-day history", () => {
    const entries: HistoryEntry[] = [
      entry({ id: "a", date: "2026-05-01", balance: 100 }),
      entry({ id: "b", date: "2026-05-02", balance: 50 }),
    ];
    expect(ids(sortHistoryByBalance(entries))).toEqual(["a", "b"]);
  });
});
