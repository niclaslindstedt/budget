// Bank-statement import pipeline. The public surface is small:
//
//   - `BankParser` — registry entry with a single `tryParse` method.
//   - `parseBankFile(file)` — runs registered parsers in order and
//     returns the first non-null result.
//   - `mergeHistory(existing, parsed)` — merges parsed entries into
//     an account's history with content-hash dedup.
//   - `historyEntryId(...)` — exported so callers can compute the
//     same hash a parser would.
//
// Concrete parsers live in `./parsers/*.ts` and are auto-discovered
// by `./parsers/index.ts`. Each parser file builds its registration
// via `defineXlsxParser` / `defineCsvParser` so the per-bank module
// shrinks to a small declarative spec.

import type { HistoryEntry } from "../../data/types";
import { createLogger } from "../../utils/logger";
import { readFirstSheet, type XlsxSheet } from "../xlsx-reader";
import { collapseWhitespace } from "./helpers";

const log = createLogger("bank-import");

export type ParsedBankEntry = {
  date: string;
  description: string;
  amount: number;
  // Optional because credit-card exports (e.g. Bank Norwegian) carry
  // only a signed amount per row, with no per-row running balance.
  // Checking-account parsers (Skandia, Swedbank, ICA) always populate
  // it so the import flow can anchor `Account.openingBalance`.
  balance?: number;
};

export type ParsedBankFile = {
  // Stable identifier for the parser that produced this result, e.g.
  // "skandia-xlsx". Persisted on `HistoryImport` so a future re-parse
  // / migration can see which bank a file came from.
  bankParserId: string;
  // Bank-extracted account identifiers, if present in the file
  // header. The import flow uses these to pre-fill an account's
  // `clearing` and `accountNumber` when the existing record is
  // missing them. Both are free-form strings; banks vary in
  // formatting (with/without dashes, etc.) so we keep them raw and
  // only do equality-trimmed comparisons elsewhere.
  bankClearing?: string;
  bankAccountNumber?: string;
  entries: ParsedBankEntry[];
};

// One method per parser. `tryParse` returns the parsed file or `null`
// if this parser doesn't recognise the file (filename extension
// mismatch, header mismatch, malformed archive). The orchestrator
// tries each parser in registration order and returns the first
// non-null result. Throwing is reserved for genuine parse failures
// once a parser has committed to a file.
export type BankParser = {
  id: string;
  name: string;
  tryParse: (file: BankFile) => Promise<ParsedBankFile | null>;
};

export type BankFile = {
  name: string;
  bytes: ArrayBuffer;
  // Lazily-decoded UTF-8 view of `bytes`. Computed once on first
  // access so CSV parsers don't pay the decode cost more than once.
  text(): string;
  // Memoised xlsx-sheet read. Returns `null` (and logs a warning
  // once) if `bytes` isn't a valid xlsx archive — so non-xlsx files
  // don't throw past the parser registry. All xlsx parsers share
  // the same parsed sheet across `tryParse` invocations, eliminating
  // the N-times-re-read worst case when several parsers gate on the
  // `.xlsx` extension.
  readXlsxSheet(): Promise<XlsxSheet | null>;
};

export function makeBankFile(name: string, bytes: ArrayBuffer): BankFile {
  let textCache: string | null = null;
  let sheetPromise: Promise<XlsxSheet | null> | null = null;
  return {
    name,
    bytes,
    text() {
      if (textCache === null) {
        textCache = new TextDecoder("utf-8").decode(bytes);
      }
      return textCache;
    },
    readXlsxSheet() {
      if (sheetPromise === null) {
        sheetPromise = readFirstSheet(bytes).catch((err) => {
          log.warn(`readXlsxSheet: ${name} is not a readable xlsx`, err);
          return null;
        });
      }
      return sheetPromise;
    },
  };
}

const registry: BankParser[] = [];

export function registerBankParser(p: BankParser): void {
  registry.push(p);
}

export function listBankParsers(): readonly BankParser[] {
  return registry;
}

export async function parseBankFile(file: BankFile): Promise<ParsedBankFile> {
  log.info(
    `parseBankFile: ${file.name} bytes=${file.bytes.byteLength} parsers=${registry.length}`,
  );
  for (const parser of registry) {
    const start = performance.now();
    let result: ParsedBankFile | null;
    try {
      result = await parser.tryParse(file);
    } catch (err) {
      const ms = (performance.now() - start).toFixed(0);
      log.error(`tryParse[${parser.id}]: failed (${ms}ms)`, err);
      throw err;
    }
    const ms = (performance.now() - start).toFixed(0);
    if (result !== null) {
      log.info(
        `tryParse[${parser.id}]: ${result.entries.length} entries (${ms}ms)`,
      );
      return result;
    }
    log.info(`tryParse[${parser.id}]: skip (${ms}ms)`);
  }
  log.error("parseBankFile: no parser matched", {
    name: file.name,
    parsers: registry.map((p) => p.id),
  });
  throw new Error(
    "No parser matched this file. Supported: " +
      registry.map((p) => p.name).join(", "),
  );
}

// Content-hash id for a history entry. Stable across re-imports so
// an overlapping statement turns into a no-op merge. We round the
// numeric fields to two decimals before hashing because spreadsheet
// round-trips occasionally introduce a stray 1e-13 jitter that would
// otherwise change the hash; the normalised description collapses
// whitespace and lower-cases so re-exports with cosmetic tweaks dedup.
//
// When the bank export carries no per-row balance (credit-card
// statements), the hash omits that segment entirely — which keeps
// existing checking-account ids unchanged (they still hash
// `date|amt|bal|desc`) while giving balance-less rows a stable id of
// their own (`date|amt|desc`).
export function historyEntryId(entry: ParsedBankEntry): string {
  const desc = collapseWhitespace(entry.description).toLowerCase();
  const amt = Math.round(entry.amount * 100) / 100;
  if (entry.balance === undefined)
    return hashString(`${entry.date}|${amt}|${desc}`);
  const bal = Math.round(entry.balance * 100) / 100;
  return hashString(`${entry.date}|${amt}|${bal}|${desc}`);
}

// Tiny non-cryptographic hash (FNV-1a 32-bit, hex). We don't need
// collision resistance — dedup keys live within a single account's
// few-thousand-row history. Hex output keeps the id readable in
// dev-tools and short enough to not bloat the on-disk snapshot.
function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export type MergeResult = {
  merged: HistoryEntry[];
  addedCount: number;
  duplicateCount: number;
  // Ids of the entries that were added in this merge (i.e. parsed
  // entries that weren't already present in `existing`). The
  // reconciliation flow scopes its matcher to these so a re-import
  // doesn't re-prompt for entries the user has already triaged.
  addedIds: Set<string>;
};

// Combine existing history with newly-parsed entries. Entries are
// kept in ascending-date order so balance-anchored math (and the
// History modal) can rely on the ordering without re-sorting. Dupes
// are detected by `historyEntryId`; the existing entry wins so an
// `importedAt` from the original import stays put.
export function mergeHistory(
  existing: readonly HistoryEntry[],
  parsed: readonly ParsedBankEntry[],
  now: number,
): MergeResult {
  const byId = new Map<string, HistoryEntry>();
  for (const e of existing) byId.set(e.id, e);
  let addedCount = 0;
  let duplicateCount = 0;
  const addedIds = new Set<string>();
  for (const p of parsed) {
    const id = historyEntryId(p);
    if (byId.has(id)) {
      duplicateCount++;
      continue;
    }
    const entry: HistoryEntry = {
      id,
      date: p.date,
      description: p.description,
      amount: p.amount,
      importedAt: now,
    };
    if (p.balance !== undefined) entry.balance = p.balance;
    byId.set(id, entry);
    addedIds.add(id);
    addedCount++;
  }
  const merged = Array.from(byId.values()).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  log.info(
    `mergeHistory: existing=${existing.length} parsed=${parsed.length} added=${addedCount} duplicates=${duplicateCount}`,
  );
  return { merged, addedCount, duplicateCount, addedIds };
}

// The earliest balance in `entries` minus that entry's amount —
// what the account held the day before the statement started. The
// import flow stashes this on `Account.openingBalance` so the
// running balance computed from history rows reconciles with what
// the bank says. Returns `null` if entries is empty, or if the
// earliest entry has no `balance` (credit-card exports) — without an
// authoritative anchor on the earliest row the import flow leaves
// `Account.openingBalance` untouched and the user can set it
// manually via the "update balance" affordance.
//
// Generic over the entry shape so the same logic serves both freshly
// parsed `ParsedBankEntry`s and already-stored `HistoryEntry`s — the
// import flow uses both: parsed-only when seeding a new account, and
// the merged set when the user imports older statements on top of
// newer ones (picking the *globally* earliest keeps the anchor
// correct in either order).
function computeOpeningBalance<
  T extends { date: string; amount: number; balance?: number },
>(entries: readonly T[]): number | null {
  if (entries.length === 0) return null;
  let earliest = entries[0];
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].date < earliest.date) earliest = entries[i];
  }
  if (earliest.balance === undefined) return null;
  return earliest.balance - earliest.amount;
}

export function computeOpeningBalanceFromEntries(
  entries: readonly ParsedBankEntry[],
): number | null {
  return computeOpeningBalance(entries);
}

export function computeOpeningBalanceFromHistory(
  entries: readonly HistoryEntry[],
): number | null {
  return computeOpeningBalance(entries);
}
