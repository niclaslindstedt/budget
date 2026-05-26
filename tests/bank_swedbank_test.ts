import { describe, expect, it } from "vitest";

import {
  computeOpeningBalanceFromEntries,
  historyEntryId,
  makeBankFile,
  mergeHistory,
  parseBankFile,
} from "../src/storage/banks";
import { numericCell } from "../src/storage/banks/helpers";
import { readAccountIds } from "../src/storage/banks/parsers/swedbank";

import { buildXlsx, type XlsxCell } from "./fixtures/build-xlsx";

// Mirrors the rows visible in the user-supplied screenshot. Rows are
// newest-first the way Swedbank exports them; the parser should keep
// them as-is and let `mergeHistory` do the chronological sort.
const HEADER_ROW: readonly XlsxCell[] = [
  "Radnummer",
  "Bokföringsdag",
  "Transaktionsdag",
  "Valutadag",
  "Referens",
  "Beskrivning",
  "Belopp",
  "Bokfört saldo",
];

const SAMPLE_ROWS: readonly (readonly XlsxCell[])[] = [
  ["Transaktioner Lön"],
  ["Ägaren Äggström"],
  ["Skapad 2026-05-18 15:49 CEST", "", "", "Alla insättningar och uttag"],
  ["Valuta: SEK", "", "", "2026-05-12 till 2026-05-18"],
  ["Clearingnummer: 81874"],
  ["Kontonummer: 1234567890"],
  [],
  HEADER_ROW,
  [
    1,
    "2026-05-18",
    "2026-05-16",
    "2026-05-18",
    "",
    "Swish mottagen +464814418",
    179,
    1219.8,
  ],
  [
    2,
    "2026-05-15",
    "2026-05-14",
    "2026-05-14",
    "",
    "Swish skickad +4615415144",
    -331,
    1040.8,
  ],
  [
    3,
    "2026-05-15",
    "2026-05-14",
    "2026-05-14",
    "hjlhbjnlh",
    "Överföring via internet",
    1000,
    1371.8,
  ],
  [
    4,
    "2026-05-13",
    "2026-05-12",
    "2026-05-12",
    "",
    "Swish skickad +465151551",
    -10,
    371.8,
  ],
];

function sampleFile(name = "Transaktioner_2026-05-18_15-49-44.xlsx") {
  return makeBankFile(name, buildXlsx(SAMPLE_ROWS));
}

describe("bank-swedbank", () => {
  it("parses the sample statement", async () => {
    const parsed = await parseBankFile(sampleFile());
    expect(parsed.bankParserId).toBe("swedbank-xlsx");
    expect(parsed.bankClearing).toBe("81874");
    expect(parsed.bankAccountNumber).toBe("1234567890");
    expect(parsed.entries.length).toBe(4);

    const newest = parsed.entries[0];
    expect(newest.date).toBe("2026-05-18");
    expect(newest.description).toBe("Swish mottagen +464814418");
    expect(newest.amount).toBe(179);
    expect(newest.balance).toBeCloseTo(1219.8, 2);

    const oldest = parsed.entries[3];
    expect(oldest.date).toBe("2026-05-13");
    expect(oldest.description).toBe("Swish skickad +465151551");
    expect(oldest.amount).toBe(-10);
    expect(oldest.balance).toBeCloseTo(371.8, 2);
  });

  it("uses Bokföringsdag (col B), not Transaktionsdag, as the entry date", async () => {
    const parsed = await parseBankFile(sampleFile());
    // The sample row's Bokföringsdag is 2026-05-18 but
    // Transaktionsdag is 2026-05-16 — the parser must pick the
    // booking date so the balance anchors are consistent.
    expect(parsed.entries[0].date).toBe("2026-05-18");
  });

  it("sniff rejects non-xlsx names", async () => {
    const wrongExtension = makeBankFile(
      "Transaktioner.csv",
      buildXlsx(SAMPLE_ROWS),
    );
    await expect(parseBankFile(wrongExtension)).rejects.toThrow(
      /No parser matched/,
    );
  });

  it("sniff rejects xlsx files without the Swedbank header", async () => {
    const otherSheet = buildXlsx([
      ["Some other report"],
      ["Date", "Description", "Amount", "Balance"],
      ["2026-05-18", "x", 1, 1],
    ]);
    const file = makeBankFile("other.xlsx", otherSheet);
    await expect(parseBankFile(file)).rejects.toThrow(/No parser matched/);
  });

  it("dedups on re-import with mergeHistory", async () => {
    const parsed = await parseBankFile(sampleFile());
    const first = mergeHistory([], parsed.entries, 1000);
    expect(first.addedCount).toBe(4);
    expect(first.duplicateCount).toBe(0);
    expect(first.merged.length).toBe(4);
    const second = mergeHistory(first.merged, parsed.entries, 2000);
    expect(second.addedCount).toBe(0);
    expect(second.duplicateCount).toBe(4);
    expect(second.merged[0].importedAt).toBe(1000);
  });

  it("computes opening balance from the earliest entry", async () => {
    const parsed = await parseBankFile(sampleFile());
    // earliest: 2026-05-13, amount -10, balance 371.80 → opening 381.80
    const opening = computeOpeningBalanceFromEntries(parsed.entries);
    expect(opening).toBeCloseTo(381.8, 2);
  });

  it("produces a stable history id for the same row across re-imports", async () => {
    const a = await parseBankFile(sampleFile("export-a.xlsx"));
    const b = await parseBankFile(sampleFile("export-b.xlsx"));
    expect(historyEntryId(a.entries[0])).toBe(historyEntryId(b.entries[0]));
  });

  it("reads clearing and account from prefixed cells", () => {
    expect(
      readAccountIds([
        new Map<number, string>([[0, "Clearingnummer: 81874"]]),
        new Map<number, string>([[0, "Kontonummer: 1234567890"]]),
      ]),
    ).toEqual({ clearing: "81874", accountNumber: "1234567890" });

    // Whitespace in the prefixed cell is tolerated.
    expect(
      readAccountIds([
        new Map<number, string>([[0, "  Clearingnummer:   8187  "]]),
      ]),
    ).toEqual({ clearing: "8187" });

    // No prefixes anywhere → both fields absent.
    expect(
      readAccountIds([new Map<number, string>([[0, "Other stuff"]])]),
    ).toEqual({});
  });

  it("falls back to Swedish-formatted numeric strings", () => {
    expect(numericCell("1 219,80")).toBeCloseTo(1219.8, 2);
    expect(numericCell("-331,00")).toBe(-331);
    expect(numericCell(" 0,00 ")).toBe(0);
    expect(numericCell("")).toBeNull();
    expect(numericCell("abc")).toBeNull();
    expect(numericCell(undefined)).toBeNull();
  });
});
