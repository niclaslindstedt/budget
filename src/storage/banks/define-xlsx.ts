// Declarative builder for xlsx-backed bank parsers.
//
// A parser module invokes `defineXlsxParser(spec)` exactly once at
// import time. The builder produces a `tryParse` that:
//
//   1. Checks the file extension (default `.xlsx`); mismatch → null.
//   2. Reads the sheet via the BankFile's memoised loader; null → null.
//   3. Locates the header row (fixed index or search); mismatch → null.
//   4. Extracts account identifiers from the rows above the header.
//   5. Iterates data rows, decoding columns via the spec, and skips
//      rows whose required cells fail their decoders.
//   6. Returns a `ParsedBankFile` with the entries.
//
// Each spec field maps to one piece of a hand-rolled parser — only
// the bank-specific bits (header tokens, column indices, account-id
// extraction, optional row filters) need to differ.

import {
  registerBankParser,
  type BankFile,
  type ParsedBankEntry,
  type ParsedBankFile,
} from "./core";
import {
  collapseWhitespace,
  findHeaderRow,
  rowMatchesHeaders,
  type HeaderMatchMode,
} from "./helpers";
import type { XlsxCellValue } from "../xlsx-reader";

export type XlsxRow = Map<number, XlsxCellValue>;
export type XlsxCellDecoder<T> = (cell: XlsxCellValue | undefined) => T | null;

export type XlsxColumnSpec<T> = {
  index: number;
  decode: XlsxCellDecoder<T>;
};

export type XlsxParserSpec = {
  id: string;
  name: string;
  // Human-readable bank name without the format suffix carried by
  // `name` (e.g. "Skandiabanken" vs "Skandiabanken (xlsx)"). Surfaced
  // on `ParsedBankFile.bankName` so the import flow can back-fill an
  // account's `bank` field. Omit when the statement doesn't identify a
  // bank cleanly.
  bankName?: string;
  // Default ".xlsx". Banks that export uncompressed sheets under a
  // different extension can override this.
  fileExtension?: string;
  // Header tokens, in column order starting at column A (index 0).
  headers: readonly string[];
  // How each header cell is compared. Default "exact" trims and
  // requires the full token; "startsWith" accepts trailing junk.
  headerMode?: HeaderMatchMode;
  // Fixed header row index (0-based). Omit to search every row for a
  // match — exports with a variable-length preamble (e.g. Swedbank).
  headerRow?: number;
  // Maps each output field to its source column. `balance` is
  // optional so credit-card exports without a per-row running total
  // can omit it.
  columns: {
    date: XlsxColumnSpec<string>;
    description: XlsxColumnSpec<string>;
    amount: XlsxColumnSpec<number>;
    balance?: XlsxColumnSpec<number>;
  };
  // Optional. Receives the rows above the located header row (a
  // typical bank statement has clearing / account numbers in this
  // block). Return `{}` when nothing is extractable — the import
  // flow leaves `Account.{clearing, accountNumber}` untouched.
  accountIds?: (rowsAboveHeader: readonly XlsxRow[]) => {
    clearing?: string;
    accountNumber?: string;
  };
  // Optional per-row skip predicate. Returns `true` to drop the row
  // before cell extraction — typical use is filtering by a column
  // that isn't one of the four required outputs.
  filterRow?: (raw: XlsxRow) => boolean;
};

export function defineXlsxParser(spec: XlsxParserSpec): void {
  const extension = (spec.fileExtension ?? ".xlsx").toLowerCase();
  const headerMode = spec.headerMode ?? "exact";

  registerBankParser({
    id: spec.id,
    name: spec.name,
    async tryParse(file: BankFile): Promise<ParsedBankFile | null> {
      if (!file.name.toLowerCase().endsWith(extension)) return null;
      const sheet = await file.readXlsxSheet();
      if (!sheet) return null;

      let headerIdx: number;
      if (spec.headerRow !== undefined) {
        if (
          !rowMatchesHeaders(
            sheet.rows[spec.headerRow],
            spec.headers,
            headerMode,
          )
        ) {
          return null;
        }
        headerIdx = spec.headerRow;
      } else {
        headerIdx = findHeaderRow(sheet.rows, spec.headers, headerMode);
        if (headerIdx < 0) return null;
      }

      const accountIds = spec.accountIds
        ? spec.accountIds(sheet.rows.slice(0, headerIdx))
        : {};

      const entries: ParsedBankEntry[] = [];
      for (let i = headerIdx + 1; i < sheet.rows.length; i++) {
        const row = sheet.rows[i];
        if (spec.filterRow && spec.filterRow(row)) continue;

        const date = spec.columns.date.decode(row.get(spec.columns.date.index));
        if (date === null || date === "") continue;
        const description = spec.columns.description.decode(
          row.get(spec.columns.description.index),
        );
        if (description === null) continue;
        const amount = spec.columns.amount.decode(
          row.get(spec.columns.amount.index),
        );
        if (amount === null) continue;

        const entry: ParsedBankEntry = {
          date,
          description: collapseWhitespace(description),
          amount,
        };
        if (spec.columns.balance) {
          const balance = spec.columns.balance.decode(
            row.get(spec.columns.balance.index),
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
