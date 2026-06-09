// Declarative builder for csv-backed bank parsers.
//
// Mirrors `defineXlsxParser` for text files. The spec captures:
//
//   - File extension (default ".csv") and delimiter (default ";").
//   - Header tokens; required at the first non-blank line.
//   - Column indices + decoders for date / description / amount and
//     optionally balance.
//   - Optional account-id extractor reading the rows above the
//     header (most csv exports have no such block, so this is rarely
//     used).
//   - Optional `filterRow` predicate to drop rows by some other
//     column (e.g. ICA skips "Reserverat belopp" pending auths).
//
// UTF-8 BOM stripping and CRLF tolerance are always on — bank csv
// exports routinely emit both.

import {
  registerBankParser,
  type BankFile,
  type ParsedBankEntry,
  type ParsedBankFile,
} from "./core";
import { collapseWhitespace } from "./helpers";

export type CsvFields = readonly string[];
export type CsvCellDecoder<T> = (cell: string | undefined) => T | null;

export type CsvColumnSpec<T> = {
  index: number;
  decode: CsvCellDecoder<T>;
};

export type CsvParserSpec = {
  id: string;
  name: string;
  // Human-readable bank name without the format suffix carried by
  // `name` (e.g. "ICA Banken" vs "ICA Banken (csv)"). Surfaced on
  // `ParsedBankFile.bankName` so the import flow can back-fill an
  // account's `bank` field. Omit when the statement doesn't identify a
  // bank cleanly.
  bankName?: string;
  fileExtension?: string; // default ".csv"
  delimiter?: string; // default ";"
  headers: readonly string[];
  columns: {
    date: CsvColumnSpec<string>;
    description: CsvColumnSpec<string>;
    amount: CsvColumnSpec<number>;
    balance?: CsvColumnSpec<number>;
  };
  accountIds?: (rowsAboveHeader: readonly CsvFields[]) => {
    clearing?: string;
    accountNumber?: string;
  };
  filterRow?: (raw: CsvFields) => boolean;
};

export function defineCsvParser(spec: CsvParserSpec): void {
  const extension = (spec.fileExtension ?? ".csv").toLowerCase();
  const delimiter = spec.delimiter ?? ";";

  registerBankParser({
    id: spec.id,
    name: spec.name,
    async tryParse(file: BankFile): Promise<ParsedBankFile | null> {
      if (!file.name.toLowerCase().endsWith(extension)) return null;
      const lines = splitLines(file.text());

      // The first non-blank line is the header. Skipping leading
      // blanks lets exports prefix their statement with empty lines
      // without breaking detection.
      let headerIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() !== "") {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx < 0) return null;
      const headerFields = lines[headerIdx].split(delimiter);
      if (!matchesHeader(headerFields, spec.headers)) return null;

      const above: CsvFields[] = lines
        .slice(0, headerIdx)
        .map((l) => l.split(delimiter));
      const accountIds = spec.accountIds ? spec.accountIds(above) : {};

      const entries: ParsedBankEntry[] = [];
      for (let i = headerIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === "") continue;
        const fields = line.split(delimiter);
        if (spec.filterRow && spec.filterRow(fields)) continue;

        const date = spec.columns.date.decode(fields[spec.columns.date.index]);
        if (date === null || date === "") continue;
        const description = spec.columns.description.decode(
          fields[spec.columns.description.index],
        );
        if (description === null || description === "") continue;
        const amount = spec.columns.amount.decode(
          fields[spec.columns.amount.index],
        );
        if (amount === null) continue;

        const entry: ParsedBankEntry = {
          date,
          description: collapseWhitespace(description),
          amount,
        };
        if (spec.columns.balance) {
          const balance = spec.columns.balance.decode(
            fields[spec.columns.balance.index],
          );
          if (balance === null) continue;
          entry.balance = balance;
        }
        entries.push(entry);
      }

      const result: ParsedBankFile = { bankParserId: spec.id, entries };
      if (spec.bankName !== undefined) result.bankName = spec.bankName;
      if (accountIds.clearing !== undefined)
        result.bankClearing = accountIds.clearing;
      if (accountIds.accountNumber !== undefined)
        result.bankAccountNumber = accountIds.accountNumber;
      return result;
    },
  });
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function splitLines(text: string): string[] {
  return stripBom(text).split(/\r?\n/);
}

function matchesHeader(
  fields: readonly string[],
  headers: readonly string[],
): boolean {
  // Header may carry trailing empty cells (some banks pad the row),
  // so we only require the leading `headers.length` to match.
  if (fields.length < headers.length) return false;
  for (let i = 0; i < headers.length; i++) {
    if (fields[i].trim() !== headers[i]) return false;
  }
  return true;
}
