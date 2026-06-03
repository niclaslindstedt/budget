import { describe, expect, it } from "vitest";

import {
  computeOpeningBalanceFromEntries,
  historyEntryId,
  makeBankFile,
  mergeHistory,
  parseBankFile,
} from "../src/storage/banks";
import { parseAccountCell } from "../src/storage/banks/parsers/skandia";

import { buildXlsx, type XlsxCell } from "./fixtures/build-xlsx";

// Synthesises a Skandiabanken-shaped xlsx in memory matching the
// layout described at the top of src/storage/banks/parsers/skandia.ts:
//   Row 1: A="Kontonummer",  B="<clearing>-<account>"
//   Row 2: A="Period",       B="YYYY-MM-DD - YYYY-MM-DD"
//   Row 3: blank
//   Row 4: header — A="Bokf. datum", B="Beskrivning", C="Belopp", D="Saldo"
//   Row 5+: data rows
const SAMPLE_ROWS: readonly (readonly XlsxCell[])[] = [
  ["Kontonummer", "9169-123.456-7"],
  ["Period", "2026-05-17 - 2026-05-18"],
  [],
  ["Bokf. datum", "Beskrivning", "Belopp", "Saldo"],
  ["2026-05-18", "Swish till Amazon Sweden", -1346, 21280.51],
  ["2026-05-18", "2026-05-15 APPLE.COM/BILL, 020100529", -39, 22626.51],
  ["2026-05-18", "EL12-257 PRYLAR", 2942, 22665.51],
  ["2026-05-18", "Swish till Tradera", -576, 19723.51],
];

function sampleFile(name = "skandia.xlsx") {
  return makeBankFile(name, buildXlsx(SAMPLE_ROWS));
}

describe("bank-skandia", () => {
  it("parses the sample statement", async () => {
    const parsed = await parseBankFile(sampleFile());
    expect(parsed.bankParserId).toBe("skandia-xlsx");
    expect(parsed.bankClearing).toBe("9169");
    expect(parsed.bankAccountNumber).toBe("123.456-7");
    expect(parsed.entries.length).toBe(4);
    const first = parsed.entries[0];
    expect(first.date).toBe("2026-05-18");
    expect(first.description).toBe("Swish till Amazon Sweden");
    expect(first.amount).toBe(-1346);
    expect(first.balance).toBeCloseTo(21280.51, 2);
  });

  it("splits a Skandia account cell", () => {
    expect(parseAccountCell("9169-123.456-7")).toEqual({
      clearing: "9169",
      accountNumber: "123.456-7",
    });
    expect(parseAccountCell("  9169-123.456-7  ")).toEqual({
      clearing: "9169",
      accountNumber: "123.456-7",
    });
    expect(parseAccountCell("")).toEqual({});
    expect(parseAccountCell("123456")).toEqual({ accountNumber: "123456" });
  });

  it("splits on the first dash only, keeping dashes in the account part", () => {
    // The account-number portion routinely carries its own dash; only
    // the clearing/account boundary (the first dash) should split.
    expect(parseAccountCell("9169-123-456-7")).toEqual({
      clearing: "9169",
      accountNumber: "123-456-7",
    });
  });

  it("treats a leading-dash cell as an account number, not a clearing", () => {
    // dashIdx === 0 → there is no clearing segment to the left, so the
    // whole (trimmed) cell is the account number.
    expect(parseAccountCell("-123.456-7")).toEqual({
      accountNumber: "-123.456-7",
    });
    expect(parseAccountCell("  -123.456-7  ")).toEqual({
      accountNumber: "-123.456-7",
    });
  });

  it("dedups on re-import with mergeHistory", async () => {
    const parsed = await parseBankFile(sampleFile());
    const first = mergeHistory([], parsed.entries, 1000);
    expect(first.addedCount).toBe(4);
    expect(first.duplicateCount).toBe(0);
    expect(first.merged.length).toBe(4);
    // Re-importing the same entries against the result must be a no-op.
    const second = mergeHistory(first.merged, parsed.entries, 2000);
    expect(second.addedCount).toBe(0);
    expect(second.duplicateCount).toBe(4);
    expect(second.merged.length).toBe(4);
    // Original importedAt is preserved (existing wins on collision).
    expect(second.merged[0].importedAt).toBe(1000);
  });

  it("sorts merged entries by ascending date", () => {
    const result = mergeHistory(
      [],
      [
        {
          date: "2026-05-18",
          description: "later",
          amount: -10,
          balance: 100,
        },
        {
          date: "2026-05-01",
          description: "earlier",
          amount: 50,
          balance: 110,
        },
      ],
      0,
    );
    expect(result.merged.map((e) => e.date)).toEqual([
      "2026-05-01",
      "2026-05-18",
    ]);
  });

  it("computes opening balance from the earliest entry", () => {
    // earliest: date 2026-05-01, amount +50, balance 110 → opening 60.
    const opening = computeOpeningBalanceFromEntries([
      { date: "2026-05-18", description: "x", amount: -10, balance: 100 },
      { date: "2026-05-01", description: "y", amount: 50, balance: 110 },
    ]);
    expect(opening).toBe(60);
  });

  it("hashes entries consistently regardless of whitespace", () => {
    const a = historyEntryId({
      date: "2026-05-01",
      description: "Swish till  Tradera",
      amount: -100,
      balance: 200,
    });
    const b = historyEntryId({
      date: "2026-05-01",
      description: "  swish till tradera  ",
      amount: -100,
      balance: 200,
    });
    expect(a).toBe(b);
  });
});
