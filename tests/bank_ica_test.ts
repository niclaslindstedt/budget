import { describe, expect, it } from "vitest";

import {
  computeOpeningBalanceFromEntries,
  makeBankFile,
  mergeHistory,
  parseBankFile,
} from "../src/storage/bank-parsers";
import { parseSwedishAmount } from "../src/storage/bank-ica";

// Synthetic ICA Banken csv mirroring the shape of a real export:
// semicolon separator, CRLF line endings, Swedish-locale amounts with
// the " kr" suffix, trailing empty cells on the header line, and a
// "Reserverat belopp" row with no Saldo column.
const SAMPLE = [
  "Datum;Text;Typ;Belopp;Saldo;;",
  "2026-05-18;Test Cafe   Anytown    Se ;Reserverat belopp;-150,00 kr;;",
  "2026-05-17;Generic Store            ;Korttransaktion;-1 234,56 kr;5 000,00 kr;",
  "2026-05-15;Salary Deposit           ;Insättning;25 000,00 kr;6 234,56 kr;",
].join("\r\n");

function makeCsvFile(name: string, body: string) {
  const bytes = new TextEncoder().encode(body);
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  return makeBankFile(name, ab);
}

describe("bank-ica", () => {
  it("parses the sample statement and skips pending rows", async () => {
    const parsed = await parseBankFile(makeCsvFile("ica-sample.csv", SAMPLE));
    expect(parsed.bankParserId).toBe("ica-banken-csv");
    expect(parsed.entries.length).toBe(2);

    const [first, second] = parsed.entries;
    expect(first.date).toBe("2026-05-17");
    expect(first.description).toBe("Generic Store");
    expect(first.amount).toBeCloseTo(-1234.56, 2);
    expect(first.balance).toBeCloseTo(5000, 2);

    expect(second.date).toBe("2026-05-15");
    expect(second.description).toBe("Salary Deposit");
    expect(second.amount).toBeCloseTo(25000, 2);
    expect(second.balance).toBeCloseTo(6234.56, 2);
  });

  it("collapses internal whitespace in descriptions", async () => {
    const body = [
      "Datum;Text;Typ;Belopp;Saldo",
      "2026-05-10;Foo   Bar     Baz   ;Korttransaktion;-10,00 kr;100,00 kr",
    ].join("\r\n");
    const parsed = await parseBankFile(makeCsvFile("ica.csv", body));
    expect(parsed.entries[0].description).toBe("Foo Bar Baz");
  });

  it("tolerates a UTF-8 BOM at the start of the file", async () => {
    const parsed = await parseBankFile(makeCsvFile("ica.csv", "﻿" + SAMPLE));
    expect(parsed.entries.length).toBe(2);
  });

  it("rejects files that do not match the ICA header", async () => {
    const body = "Date,Description,Amount\r\n2026-05-10,Foo,-10";
    await expect(parseBankFile(makeCsvFile("other.csv", body))).rejects.toThrow(
      /No parser matched/,
    );
  });

  it("dedups on re-import with mergeHistory", async () => {
    const file = makeCsvFile("ica-sample.csv", SAMPLE);
    const parsed = await parseBankFile(file);
    const first = mergeHistory([], parsed.entries, 1000);
    expect(first.addedCount).toBe(2);
    expect(first.duplicateCount).toBe(0);
    const second = mergeHistory(first.merged, parsed.entries, 2000);
    expect(second.addedCount).toBe(0);
    expect(second.duplicateCount).toBe(2);
    expect(second.merged.length).toBe(2);
  });

  it("anchors opening balance to the earliest parsed entry", async () => {
    const parsed = await parseBankFile(makeCsvFile("ica.csv", SAMPLE));
    // Earliest: 2026-05-15, amount +25000, balance 6234.56 → opening
    // -18765.44 (what the account held the day before that deposit).
    const opening = computeOpeningBalanceFromEntries(parsed.entries);
    expect(opening).toBeCloseTo(-18765.44, 2);
  });
});

describe("parseSwedishAmount", () => {
  it("handles the common shapes", () => {
    expect(parseSwedishAmount("-310,16 kr")).toBeCloseTo(-310.16, 2);
    expect(parseSwedishAmount("3 222,58 kr")).toBeCloseTo(3222.58, 2);
    expect(parseSwedishAmount("1 234 567,89 kr")).toBeCloseTo(1234567.89, 2);
    expect(parseSwedishAmount("100,00")).toBeCloseTo(100, 2);
    expect(parseSwedishAmount("0,00 kr")).toBe(0);
  });

  it("accepts non-breaking spaces as thousands separators", () => {
    expect(parseSwedishAmount("1 234,56 kr")).toBeCloseTo(1234.56, 2);
  });

  it("returns null for unparseable input", () => {
    expect(parseSwedishAmount("")).toBeNull();
    expect(parseSwedishAmount("   ")).toBeNull();
    expect(parseSwedishAmount("not a number")).toBeNull();
  });
});
