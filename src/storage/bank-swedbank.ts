// Swedbank xlsx parser.
//
// File layout (observed on a single-account "Transaktioner" export):
//
//   Rows 1..N (header block, column A unless noted):
//     "Transaktioner <name>"
//     "Ägaren <name>"
//     "Skapad <YYYY-MM-DD HH:MM CEST>"  (with "Alla insättningar och uttag"
//                                        in a later column)
//     "Valuta: SEK"                     (with "<from> till <to>" in a
//                                        later column)
//     "Clearingnummer: <clearing>"
//     "Kontonummer: <account>"
//     (blank row)
//
//   Header row: A="Radnummer", B="Bokföringsdag", C="Transaktionsdag",
//               D="Valutadag",  E="Referens",     F="Beskrivning",
//               G="Belopp",     H="Bokfört saldo"
//
//   Data rows in the same column order, ordered newest-first by the bank.
//
// Notes:
//   - Dates are ISO strings; the parser uses Bokföringsdag because
//     that's the date the running balance reconciles against.
//   - The number cells are usually plain numerics, but a string
//     fallback handles Swedish-formatted "1 219,80" just in case a
//     future export quotes them.
//   - We don't hardcode row indices for the header — the header block
//     above the table varies between exports (different accounts add
//     or skip lines like "Skapad" / "Valuta"), so we search for the
//     "Radnummer" row instead.

import { registerBankParser, type ParsedBankFile } from "./bank-import";
import { readFirstSheet, type XlsxCellValue } from "./xlsx-reader";

const PARSER_ID = "swedbank-xlsx";

const HEADERS = [
  "Radnummer",
  "Bokföringsdag",
  "Transaktionsdag",
  "Valutadag",
  "Referens",
  "Beskrivning",
  "Belopp",
  "Bokfört saldo",
] as const;

const COL_DATE = 1;
const COL_DESCRIPTION = 5;
const COL_AMOUNT = 6;
const COL_BALANCE = 7;

const CLEARING_PREFIX = "Clearingnummer:";
const ACCOUNT_PREFIX = "Kontonummer:";

registerBankParser({
  id: PARSER_ID,
  name: "Swedbank (xlsx)",
  async sniff(file) {
    if (!file.name.toLowerCase().endsWith(".xlsx")) return false;
    try {
      const sheet = await readFirstSheet(file.bytes);
      return findHeaderRow(sheet.rows) >= 0;
    } catch {
      return false;
    }
  },
  async parse(file) {
    const sheet = await readFirstSheet(file.bytes);
    const headerIdx = findHeaderRow(sheet.rows);
    if (headerIdx < 0)
      throw new Error(
        "File does not look like a Swedbank statement (header row not found).",
      );

    const { clearing, accountNumber } = readAccountIds(
      sheet.rows.slice(0, headerIdx),
    );

    const entries: ParsedBankFile["entries"] = [];
    for (let i = headerIdx + 1; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];
      const date = stringCell(row.get(COL_DATE));
      const description = stringCell(row.get(COL_DESCRIPTION));
      const amount = numericCell(row.get(COL_AMOUNT));
      const balance = numericCell(row.get(COL_BALANCE));
      if (date === null || date === "") continue;
      if (description === null) continue;
      if (amount === null || balance === null) continue;
      entries.push({
        date,
        description: description.trim().replace(/\s+/g, " "),
        amount,
        balance,
      });
    }

    return {
      bankParserId: PARSER_ID,
      bankClearing: clearing,
      bankAccountNumber: accountNumber,
      entries,
    };
  },
});

function findHeaderRow(rows: readonly Map<number, XlsxCellValue>[]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    let match = true;
    for (let c = 0; c < HEADERS.length; c++) {
      const v = row.get(c);
      if (typeof v !== "string" || v.trim() !== HEADERS[c]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

export function readAccountIds(rows: readonly Map<number, XlsxCellValue>[]): {
  clearing?: string;
  accountNumber?: string;
} {
  let clearing: string | undefined;
  let accountNumber: string | undefined;
  for (const row of rows) {
    const cell = row.get(0);
    if (typeof cell !== "string") continue;
    const trimmed = cell.trim();
    if (trimmed.startsWith(CLEARING_PREFIX)) {
      const value = trimmed.slice(CLEARING_PREFIX.length).trim();
      if (value !== "") clearing = value;
    } else if (trimmed.startsWith(ACCOUNT_PREFIX)) {
      const value = trimmed.slice(ACCOUNT_PREFIX.length).trim();
      if (value !== "") accountNumber = value;
    }
  }
  return { clearing, accountNumber };
}

function stringCell(v: XlsxCellValue | undefined): string | null {
  if (typeof v === "string") return v;
  return null;
}

// Numeric cells are usually plain numbers in xlsx, but accept a
// Swedish-formatted string fallback ("1 219,80" → 1219.80) so a
// future export that quotes amounts still parses cleanly.
export function numericCell(v: XlsxCellValue | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/\s/g, "").replace(",", ".");
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
