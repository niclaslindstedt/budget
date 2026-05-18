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
//     They are skipped: they have no balance to anchor a running
//     total against, and they reappear as posted "Korttransaktion"
//     rows once cleared — including both would either corrupt the
//     opening-balance computation or produce near-duplicates.
//   - Files exported from the bank's web UI sometimes start with a
//     UTF-8 BOM and have trailing empty cells on the header row.

import {
  registerBankParser,
  type BankFile,
  type ParsedBankFile,
} from "./bank-import";

const PARSER_ID = "ica-banken-csv";

const HEADER_FIELDS = ["Datum", "Text", "Typ", "Belopp", "Saldo"] as const;
const PENDING_TYPE = "Reserverat belopp";

registerBankParser({
  id: PARSER_ID,
  name: "ICA Banken (csv)",
  sniff(file: BankFile) {
    if (!file.name.toLowerCase().endsWith(".csv")) return false;
    return headerMatches(firstLine(file.text()));
  },
  async parse(file: BankFile) {
    const lines = splitLines(file.text());
    if (lines.length === 0 || !headerMatches(lines[0]))
      throw new Error(
        "File does not look like an ICA Banken statement (header row mismatch).",
      );
    const entries: ParsedBankFile["entries"] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === "") continue;
      const fields = line.split(";");
      if (fields.length < 5) continue;
      const date = fields[0].trim();
      const description = fields[1].trim().replace(/\s+/g, " ");
      const type = fields[2].trim();
      const balanceStr = fields[4].trim();
      if (type === PENDING_TYPE) continue;
      if (balanceStr === "") continue;
      const amount = parseSwedishAmount(fields[3]);
      const balance = parseSwedishAmount(balanceStr);
      if (date === "" || description === "") continue;
      if (amount === null || balance === null) continue;
      entries.push({ date, description, amount, balance });
    }
    return { bankParserId: PARSER_ID, entries };
  },
});

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function splitLines(text: string): string[] {
  return stripBom(text).split(/\r?\n/);
}

function firstLine(text: string): string {
  const s = stripBom(text);
  const nl = s.search(/\r?\n/);
  return nl === -1 ? s : s.slice(0, nl);
}

// Header may carry trailing empty cells (e.g. "...;Saldo;;") so we
// only require the first five fields to match.
function headerMatches(line: string): boolean {
  const fields = line.split(";");
  if (fields.length < HEADER_FIELDS.length) return false;
  for (let i = 0; i < HEADER_FIELDS.length; i++) {
    if (fields[i].trim() !== HEADER_FIELDS[i]) return false;
  }
  return true;
}

// "-1 234,56 kr" → -1234.56. The Swedish locale separates thousands
// with a regular or non-breaking space and uses a comma decimal
// point. The " kr" suffix is stripped if present. Returns `null` for
// strings that don't parse as a finite number so the caller can skip
// the row instead of inserting a `NaN`.
export function parseSwedishAmount(s: string): number | null {
  const trimmed = s.replace(/\s*kr\s*$/i, "").trim();
  if (trimmed === "") return null;
  const normalised = trimmed.replace(/\s/g, "").replace(",", ".");
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}
