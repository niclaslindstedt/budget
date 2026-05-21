// Skandiabanken xlsx parser.
//
// File layout (observed on a single-account export):
//
//   Row 1: A="Kontonummer", B="<clearing>-<account>"  (e.g. "9150-897.480-4")
//   Row 2: A="Period",      B="YYYY-MM-DD - YYYY-MM-DD"
//   Row 3: blank
//   Row 4: headers — A="Bokf. datum", B="Beskrivning",
//                    C="Belopp",      D="Saldo"
//   Row 5+: data rows in the same column order.
//
// Dates are ISO strings (`t="str"`); amount and balance are plain
// numbers; descriptions are inline strings. There is no
// `xl/sharedStrings.xml` part in the file, no styles, and no
// formulas — the minimal xlsx reader handles everything we need.

import { createLogger } from "../utils/logger";
import { registerBankParser, type ParsedBankFile } from "./bank-import";
import { readFirstSheet } from "./xlsx-reader";

const PARSER_ID = "skandia-xlsx";
const log = createLogger("bank-skandia");

// Header tokens we expect on row 4. Used both for sniffing (a file
// matches when these strings appear in the first ~2 KB of the
// uncompressed sheet XML) and for the runtime parser's sanity check.
const HEADERS = ["Bokf. datum", "Beskrivning", "Belopp", "Saldo"] as const;

registerBankParser({
  id: PARSER_ID,
  name: "Skandiabanken (xlsx)",
  async sniff(file) {
    if (!file.name.toLowerCase().endsWith(".xlsx")) return false;
    // Read the first sheet and check for the canonical header set.
    // Doing a full parse here is wasted work but the files are tiny
    // (a year of daily entries is ~50 KB) so it's not worth a
    // separate "peek at the bytes" code path.
    try {
      const sheet = await readFirstSheet(file.bytes);
      return matchesHeader(sheet.rows);
    } catch (err) {
      log.warn("sniff: readFirstSheet threw — treating as no match", err);
      return false;
    }
  },
  async parse(file) {
    const sheet = await readFirstSheet(file.bytes);
    if (!matchesHeader(sheet.rows))
      throw new Error(
        "File does not look like a Skandiabanken statement (header row mismatch).",
      );

    // Row indices are 0-based here; the canonical xlsx rows are
    // 1-based. Row 0 ("Kontonummer") carries the account id; row 1
    // ("Period") the range; row 3 is the header; rows 4..N the data.
    const accountCell = sheet.rows[0]?.get(1);
    const { clearing, accountNumber } = parseAccountCell(
      typeof accountCell === "string" ? accountCell : "",
    );

    const entries: ParsedBankFile["entries"] = [];
    for (let i = 4; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];
      const date = row.get(0);
      const description = row.get(1);
      const amount = row.get(2);
      const balance = row.get(3);
      // Empty trailing rows are skipped silently. A row with a date
      // but a missing amount or balance is treated as malformed
      // because every legitimate Skandia row has all four.
      if (typeof date !== "string" || date === "") continue;
      if (typeof description !== "string") continue;
      if (typeof amount !== "number" || !Number.isFinite(amount)) continue;
      if (typeof balance !== "number" || !Number.isFinite(balance)) continue;
      entries.push({
        date,
        description: description.trim(),
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

function matchesHeader(rows: readonly Map<number, unknown>[]): boolean {
  const header = rows[3];
  if (!header) return false;
  for (let i = 0; i < HEADERS.length; i++) {
    const v = header.get(i);
    if (typeof v !== "string" || !v.startsWith(HEADERS[i])) return false;
  }
  return true;
}

// "9150-897.480-4" → { clearing: "9150", accountNumber: "897.480-4" }.
// We don't normalise the account-number portion: different statements
// from the same bank format it differently and the user can edit the
// field manually if needed.
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
