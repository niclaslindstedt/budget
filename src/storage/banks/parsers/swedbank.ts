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
//   - The parser keys entries off Bokföringsdag because that's the
//     date the running balance reconciles against, not Transaktionsdag.
//   - Number cells are usually plain numerics, but `numericCell`
//     falls back to `parseSwedishAmount` if a future export ever
//     quotes them as "1 219,80".
//   - We don't hardcode the header row index — the block above the
//     header varies between exports — so we leave `headerRow` unset
//     and `findHeaderRow` locates "Radnummer" instead.

import { defineXlsxParser, type XlsxRow } from "../define-xlsx";
import { numericCell, stringCell } from "../helpers";

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

const CLEARING_PREFIX = "Clearingnummer:";
const ACCOUNT_PREFIX = "Kontonummer:";

defineXlsxParser({
  id: "swedbank-xlsx",
  name: "Swedbank (xlsx)",
  bankName: "Swedbank",
  headers: HEADERS,
  columns: {
    date: { index: 1, decode: stringCell }, // Bokföringsdag
    description: { index: 5, decode: stringCell },
    amount: { index: 6, decode: numericCell },
    balance: { index: 7, decode: numericCell },
  },
  accountIds: readAccountIds,
});

export function readAccountIds(rows: readonly XlsxRow[]): {
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
