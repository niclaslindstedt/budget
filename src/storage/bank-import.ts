// Bank-statement import pipeline. The public surface is small:
//
//   - `BankParser` — registry entry describing a bank's file format.
//   - `parseBankFile(file)` — runs registered parsers' `sniff` checks
//     in order and delegates to the first match.
//   - `mergeHistory(existing, parsed)` — merges parsed entries into
//     an account's history with content-hash dedup.
//   - `historyEntryId(...)` — exported so callers can compute the
//     same hash a parser would (used by promote-to-recurring later).
//
// The shape is intentionally generic. The first concrete parser is
// Skandiabanken's xlsx export, registered in `bank-skandia.ts`. New
// banks slot in by adding another module and pushing it to the
// registry.

import type { HistoryEntry } from "../data/types";
import { debug } from "../utils/debug";

const log = debug("bank-import");

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
  // "skandia-xlsx". Persisted on `HistoryImport` so a future
  // re-parse / migration can see which bank a file came from.
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

export type BankParser = {
  id: string;
  name: string;
  // Cheap content sniff. The sniff function may inspect the raw
  // bytes (for binary formats like xlsx) and a decoded string
  // (for text formats like csv). Returning `true` commits this
  // parser to the file.
  sniff: (file: BankFile) => Promise<boolean> | boolean;
  parse: (file: BankFile) => Promise<ParsedBankFile>;
};

export type BankFile = {
  name: string;
  bytes: ArrayBuffer;
  // Lazily-decoded UTF-8 view of `bytes`. Computed once on first
  // access so the xlsx parsers can skip the decode cost.
  text(): string;
};

export function makeBankFile(name: string, bytes: ArrayBuffer): BankFile {
  let cached: string | null = null;
  return {
    name,
    bytes,
    text() {
      if (cached === null) cached = new TextDecoder("utf-8").decode(bytes);
      return cached;
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
  log.log(
    `parseBankFile: ${file.name} bytes=${file.bytes.byteLength} parsers=${registry.length}`,
  );
  for (const parser of registry) {
    const sniffStart = performance.now();
    let matched = false;
    try {
      matched = await parser.sniff(file);
    } catch (err) {
      log.warn(`sniff[${parser.id}] threw — treating as no match`, err);
    }
    const sniffMs = (performance.now() - sniffStart).toFixed(0);
    log.log(
      `sniff[${parser.id}]: ${matched ? "match" : "skip"} (${sniffMs}ms)`,
    );
    if (matched) {
      const parseStart = performance.now();
      try {
        const result = await parser.parse(file);
        const parseMs = (performance.now() - parseStart).toFixed(0);
        log.log(
          `parse[${parser.id}]: ${result.entries.length} entries (${parseMs}ms)`,
        );
        return result;
      } catch (err) {
        const parseMs = (performance.now() - parseStart).toFixed(0);
        log.error(`parse[${parser.id}]: failed (${parseMs}ms)`, err);
        throw err;
      }
    }
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
  const desc = entry.description.trim().replace(/\s+/g, " ").toLowerCase();
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
  log.log(
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
export function computeOpeningBalanceFromEntries(
  entries: readonly ParsedBankEntry[],
): number | null {
  if (entries.length === 0) return null;
  // Entries may arrive in any order; find the one with the earliest
  // (lex-comparable ISO) date.
  let earliest = entries[0];
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].date < earliest.date) earliest = entries[i];
  }
  if (earliest.balance === undefined) return null;
  return earliest.balance - earliest.amount;
}

// Same idea, but reads from already-stored history entries (used
// when the import flow has just merged with prior entries and we
// need the anchor for the combined set). Picking the *globally*
// earliest entry — not just the newly-imported ones — keeps the
// opening balance correct as the user imports older statements
// after newer ones.
export function computeOpeningBalanceFromHistory(
  entries: readonly HistoryEntry[],
): number | null {
  if (entries.length === 0) return null;
  let earliest = entries[0];
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].date < earliest.date) earliest = entries[i];
  }
  if (earliest.balance === undefined) return null;
  return earliest.balance - earliest.amount;
}
