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

import { debug } from "../utils/debug";
import { registerBankParser, type ParsedBankFile } from "./bank-import";
import { readFirstSheet, type XlsxCellValue } from "./xlsx-reader";

const PARSER_ID = "bank-norwegian-xlsx";
const log = debug("bank-norwegian");

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
    try {
      const sheet = await readFirstSheet(file.bytes);
      return matchesHeader(sheet.rows[0]);
    } catch (err) {
      log.warn("sniff: readFirstSheet threw — treating as no match", err);
      return false;
    }
  },
  async parse(file) {
    const sheet = await readFirstSheet(file.bytes);
    if (!matchesHeader(sheet.rows[0]))
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
        description: description.trim().replace(/\s+/g, " "),
        amount,
      });
    }

    return { bankParserId: PARSER_ID, entries };
  },
});

function matchesHeader(row: Map<number, XlsxCellValue> | undefined): boolean {
  if (!row) return false;
  for (let i = 0; i < HEADERS.length; i++) {
    const v = row.get(i);
    if (typeof v !== "string" || v.trim() !== HEADERS[i]) return false;
  }
  return true;
}

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

function stringCell(v: XlsxCellValue | undefined): string | null {
  if (typeof v === "string") return v;
  return null;
}

// Numeric cells are plain numbers in this export. Accept a
// Swedish-formatted string fallback ("-189,00") just in case a
// future variant quotes amounts; mirrors what the Swedbank parser
// does.
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
