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
//     — we decode here via the shared `excelDateSerialToISO` helper.
//   - The parser keys entries off `TransactionDate` (col A), not
//     `BookDate` (col J). For a credit card the transaction date
//     matches the user's mental model of when they spent.
//   - The SEK figure is in `Amount` (col G), not `Currency Amount`
//     (col D); the latter is the foreign-currency amount for FX rows.
//   - There is no per-row running balance in this export, so
//     `columns.balance` is omitted and the import flow leaves
//     `Account.openingBalance` untouched.

import { defineXlsxParser } from "../define-xlsx";
import { excelDateSerialToISO, numericCell, stringCell } from "../helpers";

defineXlsxParser({
  id: "bank-norwegian-xlsx",
  name: "Bank Norwegian (xlsx)",
  headers: [
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
  ],
  headerRow: 0,
  columns: {
    date: { index: 0, decode: excelDateSerialToISO },
    description: { index: 1, decode: stringCell },
    amount: { index: 6, decode: numericCell },
  },
});
