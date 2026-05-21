// Bank Norwegian xlsx parser (credit-card statement).
//
// File layout: one header row at the top of the sheet, followed by
// data rows. All in English:
//
//   A: TransactionDate   (Excel date serial)
//   B: Text              (merchant description; shared string)
//   C: Type              ("Köp" or "Betalning"; shared string)
//   D: Currency Amount   (signed, in the transaction's currency)
//   E: Currency Rate     (1 for SEK; FX rate otherwise)
//   F: Currency          ("SEK" / "USD" / "EUR" / …; shared string)
//   G: Amount            (signed, in the account currency — SEK)
//   H: Merchant Area     (merchant identifier; shared string)
//   I: Merchant Category (MCC description; shared string)
//   J: BookDate          (Excel date serial)
//   K: ValueDate         (Excel date serial)
//
// Notes:
//   - Dates are stored as numeric Excel serials with a date-styled
//     `s` attribute. The xlsx-reader deliberately doesn't decode them
//     — it would need to walk styles.xml to know which cells are
//     dates. We decode here using the standard Dec 30, 1899 epoch.
//   - The parser keys entries off `TransactionDate` (when the user
//     used the card), not `BookDate` (when the bank booked it on the
//     statement). For a credit card the transaction date matches the
//     user's mental model of when they spent.
//   - There is no per-row running balance in this export, so
//     `ParsedBankEntry.balance` is left undefined and the import
//     flow leaves `Account.openingBalance` untouched (the user can
//     set it via "update balance" on the Accounts page).
//   - Shared strings come back with trailing spaces — descriptions
//     are trimmed and inner whitespace collapsed for a clean key.

import { createLogger } from "../utils/logger";
import { registerBankParser, type ParsedBankFile } from "./bank-import";
import {
  collapseWhitespace,
  numericCell,
  rowMatchesHeaders,
  stringCell,
  tryReadFirstSheet,
} from "./bank-helpers";
import { readFirstSheet, type XlsxCellValue } from "./xlsx-reader";

// Re-exported for tests; the shared implementation lives in
// `bank-helpers.ts`.
export { numericCell } from "./bank-helpers";

const PARSER_ID = "bank-norwegian-xlsx";
const log = createLogger("bank-norwegian");

const HEADERS = [
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
] as const;

const COL_TXDATE = 0;
const COL_TEXT = 1;
const COL_AMOUNT = 6;

registerBankParser({
  id: PARSER_ID,
  name: "Bank Norwegian (xlsx)",
  async sniff(file) {
    if (!file.name.toLowerCase().endsWith(".xlsx")) return false;
    const sheet = await tryReadFirstSheet(file, log);
    return sheet !== null && rowMatchesHeaders(sheet.rows[0], HEADERS);
  },
  async parse(file) {
    const sheet = await readFirstSheet(file.bytes);
    if (!rowMatchesHeaders(sheet.rows[0], HEADERS))
      throw new Error(
        "File does not look like a Bank Norwegian statement (header row mismatch).",
      );

    const entries: ParsedBankFile["entries"] = [];
    for (let i = 1; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];
      const date = excelDateSerialToISO(row.get(COL_TXDATE));
      const description = stringCell(row.get(COL_TEXT));
      const amount = numericCell(row.get(COL_AMOUNT));
      if (date === null) continue;
      if (description === null) continue;
      if (amount === null) continue;
      entries.push({
        date,
        description: collapseWhitespace(description),
        amount,
      });
    }

    return { bankParserId: PARSER_ID, entries };
  },
});

// Excel stores dates as serial numbers — the count of days since the
// epoch Dec 30, 1899 (UTC). For any date past Mar 1, 1900 this lines
// up with Excel's own display exactly (the 1900-leap-year bug only
// affects serials < 60, which no bank export emits). Returns `null`
// for non-numeric or non-finite cells.
export function excelDateSerialToISO(
  v: XlsxCellValue | undefined,
): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const ms = Date.UTC(1899, 11, 30) + v * 86400 * 1000;
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}
