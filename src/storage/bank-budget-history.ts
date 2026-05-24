// Re-importer for the app's own HistoryModal export. Sniffs CSV and
// XLSX files whose first row matches the canonical `HISTORY_EXPORT_HEADERS`
// constant from `src/data/history-export.ts` — that constant is the
// single source of truth, so updates to the export schema land here
// automatically.
//
// The parser only restores the four dedup-relevant fields (date,
// description, amount, balance) because `historyEntryId` in
// `bank-import.ts` hashes exactly those. The Type / Category columns
// are read for sanity but not threaded into the import; on display
// they'll be re-resolved by the user's merchant-hint and match-rule
// chain (same path that produced them on export). That keeps the
// re-import a true bank-statement reconciliation, not a backup-restore.

import { HISTORY_EXPORT_HEADERS } from "../data/history-export";
import { createLogger } from "../utils/logger";
import {
  collapseWhitespace,
  numericCell,
  tryReadFirstSheet,
} from "./bank-helpers";
import {
  registerBankParser,
  type BankFile,
  type ParsedBankFile,
} from "./bank-import";
import { readFirstSheet, type XlsxCellValue } from "./xlsx-reader";

const PARSER_ID = "budget-history";
const log = createLogger("bank-budget-history");

// Pre-lowered once so sniff comparisons are case-insensitive without
// touching the shared `rowMatchesHeaders` helper.
const HEADERS_LOWER: readonly string[] = HISTORY_EXPORT_HEADERS.map((h) =>
  h.toLowerCase(),
);

registerBankParser({
  id: PARSER_ID,
  name: "Budget account history (csv/xlsx)",
  async sniff(file: BankFile) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx")) {
      const sheet = await tryReadFirstSheet(file, log);
      if (!sheet) return false;
      return headerRowMatches(sheet.rows[0]);
    }
    if (name.endsWith(".csv")) {
      return csvHeaderMatches(firstLine(file.text()));
    }
    return false;
  },
  async parse(file: BankFile) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx")) return parseXlsx(file);
    return parseCsv(file);
  },
});

async function parseXlsx(file: BankFile): Promise<ParsedBankFile> {
  const sheet = await readFirstSheet(file.bytes);
  if (!headerRowMatches(sheet.rows[0])) {
    throw new Error(
      "File does not look like a budget account-history export (header row mismatch).",
    );
  }
  const entries: ParsedBankFile["entries"] = [];
  for (let i = 1; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    const date = readDateCell(row.get(0));
    const description = cellAsString(row.get(1));
    const amount = numericCell(row.get(2));
    const balanceRaw = row.get(3);
    if (date === null || date === "") continue;
    if (description === null) continue;
    if (amount === null) continue;
    const cleanedDesc = collapseWhitespace(description);
    if (cleanedDesc === "") continue;
    const balance =
      balanceRaw === undefined || balanceRaw === null || balanceRaw === ""
        ? undefined
        : (numericCell(balanceRaw) ?? undefined);
    entries.push(
      balance === undefined
        ? { date, description: cleanedDesc, amount }
        : { date, description: cleanedDesc, amount, balance },
    );
  }
  return { bankParserId: PARSER_ID, entries };
}

// Excel stores dates as serial numbers (days since 1899-12-30) when
// the writer applied a date number-format. Our exporter does exactly
// that via `columnFormats: [{ kind: "date" }, …]` so a re-import has
// to convert back to ISO. Mirror the epoch constant from
// `src/utils/xlsx-format.ts:14`.
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

function readDateCell(v: XlsxCellValue | undefined): string | null {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = EXCEL_EPOCH_UTC + Math.round(v) * MS_PER_DAY;
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
}

async function parseCsv(file: BankFile): Promise<ParsedBankFile> {
  const lines = splitLines(file.text());
  if (lines.length === 0 || !csvHeaderMatches(lines[0])) {
    throw new Error(
      "File does not look like a budget account-history export (header row mismatch).",
    );
  }
  const entries: ParsedBankFile["entries"] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const fields = parseCsvLine(line);
    if (fields.length < 4) continue;
    const date = fields[0].trim();
    const description = collapseWhitespace(fields[1]);
    const amount = parseNumberField(fields[2]);
    const balanceStr = fields[3].trim();
    if (date === "" || description === "") continue;
    if (amount === null) continue;
    const balance =
      balanceStr === "" ? undefined : parseNumberField(balanceStr);
    entries.push(
      balance === undefined || balance === null
        ? { date, description, amount }
        : { date, description, amount, balance },
    );
  }
  return { bankParserId: PARSER_ID, entries };
}

function headerRowMatches(
  row: Map<number, XlsxCellValue> | undefined,
): boolean {
  if (!row) return false;
  for (let i = 0; i < HEADERS_LOWER.length; i++) {
    const v = row.get(i);
    if (typeof v !== "string") return false;
    if (v.trim().toLowerCase() !== HEADERS_LOWER[i]) return false;
  }
  return true;
}

function csvHeaderMatches(line: string): boolean {
  const fields = parseCsvLine(line);
  if (fields.length < HEADERS_LOWER.length) return false;
  for (let i = 0; i < HEADERS_LOWER.length; i++) {
    // The writer wraps every string in quotes and may have annotated
    // Amount/Balance with a currency suffix in parens — accept either
    // bare or "(<suffix>)" forms so a CSV round-trip works.
    const got = fields[i].trim().toLowerCase();
    const want = HEADERS_LOWER[i];
    if (got === want) continue;
    if (got.startsWith(`${want} (`) && got.endsWith(")")) continue;
    return false;
  }
  return true;
}

// Minimal RFC-4180 splitter — handles double-quoted fields with
// embedded commas / quotes ("" → "). The writer (`rowsToCsv`) only
// ever produces this subset, so a full streaming parser would be
// overkill.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

// CSV writer (`rowsToCsv`) emits numbers as plain `String(n)` with a
// `.` decimal regardless of locale, so a plain `Number()` is correct.
function parseNumberField(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function cellAsString(v: XlsxCellValue | undefined): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return null;
}

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
