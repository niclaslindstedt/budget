import { describe, expect, it } from "vitest";

import {
  computeOpeningBalanceFromEntries,
  computeOpeningBalanceFromHistory,
  historyEntryId,
  makeBankFile,
  mergeHistory,
  parseBankFile,
} from "../src/storage/banks";
import {
  excelDateSerialToISO,
  numericCell,
} from "../src/storage/banks/helpers";

import { buildXlsx, type XlsxCell } from "./fixtures/build-xlsx";

// Mirrors the column layout described at the top of
// src/storage/banks/parsers/norwegian.ts. Dates are Excel serial numbers; the
// builder writes plain numeric cells (no `t` attribute), which the
// xlsx-reader returns as numbers — exactly what the bank's real
// exports look like over the wire.
const HEADER_ROW: readonly XlsxCell[] = [
  "TransactionDate",
  "Text",
  "Type",
  "Currency Amount",
  "Currency Rate",
  "Currency",
  "Amount",
  "Merchant Area",
  "Merchant Category",
  "BookDate",
  "ValueDate",
];

// Serial 46126 = 2026-04-14, 46130 = 2026-04-18, etc. Computed once
// here so a future test reading the raw row stays readable.
const SAMPLE_ROWS: readonly (readonly XlsxCell[])[] = [
  HEADER_ROW,
  // Plain SEK purchase.
  [
    46126,
    "PAYPAL *BATTLE.NET EU3288",
    "Köp",
    -189,
    1,
    "SEK",
    -189,
    "35314369001",
    "Digital Games Digital Goods – Games",
    46130,
    46170,
  ],
  // Plain SEK purchase with whitespace padding the bank's shared
  // strings tend to add — the parser must trim them.
  [
    46127,
    "CRV*Systembolaget Soln   ",
    "Köp",
    -114,
    1,
    "SEK",
    -114,
    "CRV*",
    "Package Stores",
    46131,
    46170,
  ],
  // Incoming transfer (Betalning) — positive amount.
  [
    46136,
    "From Joachim Lindström",
    "Betalning",
    12000,
    1,
    "SEK",
    12000,
    "",
    "",
    46136,
    46136,
  ],
  // FX purchase: -8.39 USD at rate 9.481525626 → -79.55 SEK.
  // The parser must read the SEK Amount column (col G), not the
  // Currency Amount column (col D).
  [
    46140,
    "BACKBLAZE INC",
    "Köp",
    -8.39,
    9.481525626,
    "USD",
    -79.55,
    "BACKBLAZE.COM",
    "Computer Programming",
    46141,
    46170,
  ],
];

function sampleFile(name = "Statement.xlsx") {
  return makeBankFile(name, buildXlsx(SAMPLE_ROWS));
}

describe("bank-norwegian", () => {
  it("parses the sample statement", async () => {
    const parsed = await parseBankFile(sampleFile());
    expect(parsed.bankParserId).toBe("bank-norwegian-xlsx");
    // Credit-card files carry no clearing / account number pair, so
    // the import flow leaves Account.{clearing, accountNumber} alone.
    expect(parsed.bankClearing).toBeUndefined();
    expect(parsed.bankAccountNumber).toBeUndefined();
    expect(parsed.entries.length).toBe(4);

    const first = parsed.entries[0];
    expect(first.date).toBe("2026-04-14");
    expect(first.description).toBe("PAYPAL *BATTLE.NET EU3288");
    expect(first.amount).toBe(-189);
    // Credit-card exports carry no per-row balance.
    expect(first.balance).toBeUndefined();
  });

  it("keys entries off TransactionDate (col A), not BookDate (col J)", async () => {
    const parsed = await parseBankFile(sampleFile());
    // The FX row in the sample has TransactionDate 46140 (2026-04-28)
    // and BookDate 46141 (2026-04-29). The parser must pick the
    // transaction date.
    const fx = parsed.entries.find((e) => e.description === "BACKBLAZE INC");
    expect(fx).toBeDefined();
    expect(fx!.date).toBe("2026-04-28");
  });

  it("decodes FX rows using the SEK Amount column (col G), not Currency Amount", async () => {
    const parsed = await parseBankFile(sampleFile());
    const fx = parsed.entries.find((e) => e.description === "BACKBLAZE INC");
    expect(fx).toBeDefined();
    // 9.48 * -8.39 ≈ -79.55 SEK — that's the bank's converted figure.
    expect(fx!.amount).toBeCloseTo(-79.55, 2);
  });

  it("trims and collapses whitespace in descriptions", async () => {
    const parsed = await parseBankFile(sampleFile());
    // The row with "CRV*Systembolaget Soln   " has trailing spaces;
    // the parser must trim and collapse runs of whitespace.
    const systembolaget = parsed.entries.find((e) =>
      e.description.startsWith("CRV*Systembolaget"),
    );
    expect(systembolaget).toBeDefined();
    expect(systembolaget!.description).toBe("CRV*Systembolaget Soln");
  });

  it("sniff rejects non-xlsx names", async () => {
    const wrongExtension = makeBankFile(
      "Statement.csv",
      buildXlsx(SAMPLE_ROWS),
    );
    await expect(parseBankFile(wrongExtension)).rejects.toThrow(
      /No parser matched/,
    );
  });

  it("sniff rejects xlsx files without the Bank Norwegian header", async () => {
    const otherSheet = buildXlsx([
      ["Some other report"],
      ["Date", "Description", "Amount"],
      ["2026-05-18", "x", 1],
    ]);
    const file = makeBankFile("other.xlsx", otherSheet);
    await expect(parseBankFile(file)).rejects.toThrow(/No parser matched/);
  });

  it("hashes balance-less entries without a balance segment", () => {
    const id = historyEntryId({
      date: "2026-04-14",
      description: "PAYPAL *BATTLE.NET EU3288",
      amount: -189,
    });
    const id2 = historyEntryId({
      date: "2026-04-14",
      description: "  PAYPAL *BATTLE.NET EU3288  ",
      amount: -189,
    });
    expect(id).toBe(id2);
    // And a balance-bearing entry with the same date/amount/desc
    // hashes differently — the two segments are not interchangeable.
    const idWithBal = historyEntryId({
      date: "2026-04-14",
      description: "PAYPAL *BATTLE.NET EU3288",
      amount: -189,
      balance: 0,
    });
    expect(id).not.toBe(idWithBal);
  });

  it("dedups on re-import with mergeHistory", async () => {
    const parsed = await parseBankFile(sampleFile());
    const first = mergeHistory([], parsed.entries, 1000);
    expect(first.addedCount).toBe(parsed.entries.length);
    expect(first.duplicateCount).toBe(0);
    const second = mergeHistory(first.merged, parsed.entries, 2000);
    expect(second.addedCount).toBe(0);
    expect(second.duplicateCount).toBe(parsed.entries.length);
    // Merged entries should not have a `balance` field — the parser
    // delivered none, so mergeHistory must not invent one.
    for (const e of second.merged) {
      expect(e.balance).toBeUndefined();
    }
  });

  it("does not anchor opening balance when entries carry none", async () => {
    const parsed = await parseBankFile(sampleFile());
    expect(computeOpeningBalanceFromEntries(parsed.entries)).toBeNull();
    const merged = mergeHistory([], parsed.entries, 0).merged;
    expect(computeOpeningBalanceFromHistory(merged)).toBeNull();
  });

  it("decodes Excel date serials with the Dec 30, 1899 epoch", () => {
    expect(excelDateSerialToISO(46126)).toBe("2026-04-14");
    expect(excelDateSerialToISO(46130)).toBe("2026-04-18");
    expect(excelDateSerialToISO(46170)).toBe("2026-05-28");
    expect(excelDateSerialToISO(undefined)).toBeNull();
    expect(excelDateSerialToISO("46126")).toBeNull();
    expect(excelDateSerialToISO(Number.NaN)).toBeNull();
  });

  it("accepts Swedish-formatted numeric strings as a fallback", () => {
    expect(numericCell(-79.55)).toBe(-79.55);
    expect(numericCell("-79,55")).toBeCloseTo(-79.55, 2);
    expect(numericCell("")).toBeNull();
    expect(numericCell(undefined)).toBeNull();
  });
});
