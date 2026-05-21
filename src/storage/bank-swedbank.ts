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

import { createLogger } from "../utils/logger";
import { registerBankParser, type ParsedBankFile } from "./bank-import";
import {
  collapseWhitespace,
  findHeaderRow,
  numericCell,
  stringCell,
  tryReadFirstSheet,
} from "./bank-helpers";
import { readFirstSheet, type XlsxCellValue } from "./xlsx-reader";

// Re-exported for tests; the shared implementation lives in
// `bank-helpers.ts`.
export { numericCell } from "./bank-helpers";

const PARSER_ID = "swedbank-xlsx";
const log = createLogger("bank-swedbank");

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
    const sheet = await tryReadFirstSheet(file, log);
    return sheet !== null && findHeaderRow(sheet.rows, HEADERS) >= 0;
  },
  async parse(file) {
    const sheet = await readFirstSheet(file.bytes);
    const headerIdx = findHeaderRow(sheet.rows, HEADERS);
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
        description: collapseWhitespace(description),
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
