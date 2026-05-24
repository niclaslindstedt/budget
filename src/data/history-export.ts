// Shared schema + writers for an account's imported bank history.
// Owns the column constant that both the writer (used by HistoryModal
// in the read-only viewer) and the matching bank parser
// (`src/storage/bank-budget-history.ts`) refer to. Keeping the
// constant in one place is the user-stated contract: updates to one
// side land on the other automatically.

import { rowsToCsv } from "./budget-export";
import { resolveEntryLabels } from "./sheet";
import type {
  Category,
  EntryType,
  HistoryEntry,
  MatchRule,
  MerchantHint,
  Settings,
} from "./types";
import { buildXlsx } from "../utils/xlsx";
import { budgetExportFormats } from "../utils/xlsx-format";

// Fixed English column headers. Lower-case-insensitive on the parser
// side so manual edits don't break re-import. The 6-token sequence is
// disjoint from every existing bank parser's signature (Skandia /
// ICA / Swedbank use Swedish; Bank Norwegian has 11 cols starting
// with "TransactionDate"). See AGENTS.md plan for the comparison.
export const HISTORY_EXPORT_HEADERS = [
  "Date",
  "Description",
  "Amount",
  "Balance",
  "Type",
  "Category",
] as const;

export type HistoryExportRow = {
  date: string;
  description: string;
  amount: number;
  // null on credit-card exports where the bank never published a
  // running balance per row.
  balance: number | null;
  type: string;
  category: string;
};

export type BuildHistoryExportArgs = {
  entries: readonly HistoryEntry[];
  types: readonly EntryType[];
  categories: readonly Category[];
  merchantHints: Readonly<Record<string, MerchantHint>>;
  matchRules: readonly MatchRule[];
  // Hidden entries are excluded by default — they belong to the
  // user's noise pile, matching `buildBudgetExportRows`. Pass
  // `includeHidden: true` to override (currently unused; reserved).
  includeHidden?: boolean;
};

// Flatten history entries into a chronologically sorted row stream
// with resolved labels. Splits (one bank row → many categorised
// parts) are expanded into one export row per split so the file
// mirrors what the user sees in HistoryModal; the balance is
// attached to the last split row only (matches the running-balance
// anchor convention).
export function buildHistoryExportRows(
  args: BuildHistoryExportArgs,
): HistoryExportRow[] {
  const {
    entries,
    types,
    categories,
    merchantHints,
    matchRules,
    includeHidden,
  } = args;
  const typesById = new Map<string, EntryType>();
  for (const t of types) typesById.set(t.id, t);
  const categoriesById = new Map<string, Category>();
  for (const c of categories) categoriesById.set(c.id, c);

  const sorted = [...entries].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  const out: HistoryExportRow[] = [];
  for (const entry of sorted) {
    if (entry.hidden && !includeHidden) continue;
    const { description, typeId } = resolveEntryLabels(
      entry,
      merchantHints,
      matchRules,
    );

    if (entry.splits && entry.splits.length > 0) {
      const lastIdx = entry.splits.length - 1;
      for (let i = 0; i < entry.splits.length; i++) {
        const split = entry.splits[i];
        const splitType = split.typeId
          ? (typesById.get(split.typeId) ?? null)
          : null;
        const splitCategory = splitType
          ? (categoriesById.get(splitType.categoryId) ?? null)
          : null;
        out.push({
          date: entry.date,
          description:
            split.description.trim() !== "" ? split.description : description,
          amount: split.amount,
          balance: i === lastIdx ? (entry.balance ?? null) : null,
          type: splitType ? splitType.name : "",
          category: splitCategory ? splitCategory.name : "",
        });
      }
      continue;
    }

    const type = typeId ? (typesById.get(typeId) ?? null) : null;
    const category = type
      ? (categoriesById.get(type.categoryId) ?? null)
      : null;
    out.push({
      date: entry.date,
      description,
      amount: entry.amount,
      balance: entry.balance ?? null,
      type: type ? type.name : "",
      category: category ? category.name : "",
    });
  }
  return out;
}

// Convert export rows into the 2-D shape `rowsToCsv` / `buildXlsx`
// consume. Header order matches `HISTORY_EXPORT_HEADERS`. Pass a
// non-empty `currencySuffix` to annotate the Amount/Balance headers
// (CSV path only — XLSX encodes currency per-cell via number formats).
export function historyRowsToTable(
  rows: readonly HistoryExportRow[],
  currencySuffix?: string,
): (string | number | null)[][] {
  const amountHeader =
    currencySuffix && currencySuffix !== ""
      ? `Amount (${currencySuffix})`
      : "Amount";
  const balanceHeader =
    currencySuffix && currencySuffix !== ""
      ? `Balance (${currencySuffix})`
      : "Balance";
  const out: (string | number | null)[][] = [
    [
      HISTORY_EXPORT_HEADERS[0],
      HISTORY_EXPORT_HEADERS[1],
      amountHeader,
      balanceHeader,
      HISTORY_EXPORT_HEADERS[4],
      HISTORY_EXPORT_HEADERS[5],
    ],
  ];
  for (const r of rows) {
    out.push([r.date, r.description, r.amount, r.balance, r.type, r.category]);
  }
  return out;
}

export function writeHistoryCsv(
  rows: readonly HistoryExportRow[],
  currencySuffix?: string,
): string {
  return rowsToCsv(historyRowsToTable(rows, currencySuffix));
}

export type WriteHistoryXlsxArgs = {
  rows: readonly HistoryExportRow[];
  accountName: string;
  settings: Settings;
};

export function writeHistoryXlsx(args: WriteHistoryXlsxArgs): Uint8Array {
  const { rows, accountName, settings } = args;
  // Unsuffixed headers — XLSX renders currency through per-cell
  // number formats instead of header text.
  const table = historyRowsToTable(rows);
  return buildXlsx([
    {
      name: accountName,
      rows: table,
      // Order mirrors `historyRowsToTable`: date, description,
      // amount, balance, type, category.
      columnFormats: [
        { kind: "date" },
        { kind: "general" },
        { kind: "currency" },
        { kind: "currency", alwaysTwoDecimals: true },
        { kind: "general" },
        { kind: "general" },
      ],
      formats: budgetExportFormats(settings),
      asTable: true,
    },
  ]);
}
