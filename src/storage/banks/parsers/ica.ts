// ICA Banken csv parser.
//
// File layout (semicolon-separated, CRLF line endings, Swedish locale):
//
//   Row 0: Datum;Text;Typ;Belopp;Saldo
//   Row 1+: <date>;<description>;<type>;<amount> kr;<balance> kr
//
// Notable shapes the parser handles:
//
//   - Date is ISO `YYYY-MM-DD`.
//   - Amounts use a comma decimal separator and an optional regular
//     or non-breaking space as thousands separator, suffixed with
//     " kr" — e.g. `-1 234,56 kr`.
//   - "Reserverat belopp" (pending card auths) rows have no Saldo.
//     They're skipped: they have no balance to anchor a running
//     total against, and they reappear as posted "Korttransaktion"
//     rows once cleared.
//   - Files exported from the bank's web UI sometimes start with a
//     UTF-8 BOM and have trailing empty cells on the header row;
//     `defineCsvParser` handles both.

import { defineCsvParser } from "../define-csv";
import { parseSwedishAmount } from "../helpers";

const PENDING_TYPE = "Reserverat belopp";

defineCsvParser({
  id: "ica-banken-csv",
  name: "ICA Banken (csv)",
  bankName: "ICA Banken",
  headers: ["Datum", "Text", "Typ", "Belopp", "Saldo"],
  columns: {
    date: { index: 0, decode: (s) => (s ?? "").trim() || null },
    description: { index: 1, decode: (s) => s ?? null },
    amount: { index: 3, decode: (s) => parseSwedishAmount(s ?? "") },
    // Empty balance cell (e.g. a stray pending row not caught by the
    // type filter) skips the row — the import flow needs a balance
    // anchor on every kept entry.
    balance: { index: 4, decode: (s) => parseSwedishAmount(s ?? "") },
  },
  filterRow: (fields) => (fields[2] ?? "").trim() === PENDING_TYPE,
});
