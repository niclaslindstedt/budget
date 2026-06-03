// Skandiabanken xlsx parser.
//
// File layout (observed on a single-account export):
//
//   Row 1: A="Kontonummer", B="<clearing>-<account>"  (e.g. "9169-123.456-7")
//   Row 2: A="Period",      B="YYYY-MM-DD - YYYY-MM-DD"
//   Row 3: blank
//   Row 4: headers — A="Bokf. datum", B="Beskrivning",
//                    C="Belopp",      D="Saldo"
//   Row 5+: data rows in the same column order.
//
// Header cells append a long-form description to the column name
// (e.g. "Belopp\nThe transaction amount…"), so we match with
// `startsWith`. Dates arrive as ISO strings; amount and balance as
// plain numbers.

import { defineXlsxParser } from "../define-xlsx";
import { numericCell, stringCell } from "../helpers";

defineXlsxParser({
  id: "skandia-xlsx",
  name: "Skandiabanken (xlsx)",
  headers: ["Bokf. datum", "Beskrivning", "Belopp", "Saldo"],
  headerMode: "startsWith",
  headerRow: 3,
  columns: {
    date: { index: 0, decode: stringCell },
    description: { index: 1, decode: stringCell },
    amount: { index: 2, decode: numericCell },
    balance: { index: 3, decode: numericCell },
  },
  accountIds: (rowsAbove) =>
    parseAccountCell(stringCell(rowsAbove[0]?.get(1)) ?? ""),
});

// "9169-123.456-7" → { clearing: "9169", accountNumber: "123.456-7" }.
// Only the first dash splits clearing from account: the account-number
// portion can itself contain dashes and dots, which we leave raw and
// let the user edit manually if a given statement formats it oddly.
export function parseAccountCell(s: string): {
  clearing?: string;
  accountNumber?: string;
} {
  const trimmed = s.trim();
  if (trimmed === "") return {};
  const dashIdx = trimmed.indexOf("-");
  if (dashIdx <= 0) return { accountNumber: trimmed };
  return {
    clearing: trimmed.slice(0, dashIdx),
    accountNumber: trimmed.slice(dashIdx + 1),
  };
}
