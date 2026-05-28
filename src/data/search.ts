import { allCategories, allTypes } from "./presets/merge";
import { buildVisibleRows } from "./budget/rows";
import { findColumnByType } from "./sheet";
import type {
  AccountBudget,
  Category,
  Company,
  EntryType,
  HistoryEntry,
  Row,
  RowKind,
  Sheet,
  UserData,
} from "./types";
import type { TFunction } from "../i18n";
import { displayCategoryName, displayTypeName } from "../i18n/preset-names";
import { parseAmount } from "../utils/format";

// Flattened, search-friendly projection of one row that the user sees
// inside a sheet. The index keys by `(sheetId, itemId, rowId)` because
// a single Transfer may render on two sheets (from-account and
// to-account) under the same row id, so `rowId` alone isn't unique
// across the workspace.
export type SearchEntry = {
  sheetId: string;
  sheetName: string;
  sheetColor: string;
  sheetGlyph: string;
  itemId: string;
  rowId: string;
  // ISO date pulled from the row's date cell (empty string for undated
  // rows). Needed by the navigation flow so BudgetPage can expand its
  // history window to include the target row's month.
  iso: string;
  description: string;
  typeName: string;
  categoryName: string;
  companyName: string;
  // Raw bank-statement memo for rows synthesized from imported history
  // entries. The visible description on a historic row is the user
  // override, matching rule, merchant hint, company name, or type
  // name (in that priority chain) — the original bank text is hidden
  // once any tag attaches. Indexing it separately lets the user find
  // a row by what the bank reported even when none of the visible
  // fields contain that string. Empty for non-historic rows.
  bankDescription: string;
  amount: number | null;
  // Row kind + transfer flag, mirrored from the synthesized Row so the
  // filter popover can drop bank-history rows ("historic"), synthesized
  // transfer rows ("transfer"), or rows flagged as inter-account
  // transfers without re-deriving anything at query time. `isTransfer`
  // folds in the implicit `kind === "transfer"` case at build time so
  // the predicate stays a single boolean check.
  kind: RowKind;
  isTransfer: boolean;
  // Pre-lowercased mirrors of the searchable string fields, built once
  // in `buildSearchIndex` so `runSearch` does a plain `indexOf` on the
  // cached form per keystroke.
  descriptionLc: string;
  typeNameLc: string;
  categoryNameLc: string;
  companyNameLc: string;
  bankDescriptionLc: string;
};

// Where the match landed and the offset / length inside the matched
// string for substring highlighting. `amount` matches don't carry a
// range because the score is distance-based, not substring-based.
export type SearchMatch =
  | {
      field:
        | "description"
        | "typeName"
        | "categoryName"
        | "companyName"
        | "bankDescription";
      start: number;
      end: number;
    }
  | { field: "amount"; distance: number };

export type SearchResult = {
  entry: SearchEntry;
  // Primary match used for ranking; secondary matches (other fields
  // that also hit) are not surfaced today but the shape leaves room.
  match: SearchMatch;
};

// Caller-selected ordering applied after the relevance scoring pass.
// `relevance` (default) keeps the score-sorted order; the date /
// amount variants re-sort by the corresponding cell value, pushing
// rows without that value to the bottom so they stay reachable
// without dominating the list. Amount sorts compare magnitudes
// (|amount|) so "Highest first" means biggest spend / biggest
// income — not the most-positive number, which would otherwise
// rank a -744 row ahead of a -944 row.
export type SearchSort =
  | "relevance"
  | "date-asc"
  | "date-desc"
  | "amount-asc"
  | "amount-desc";

// Caller-selected refinements applied on top of the query inside
// `runSearch`, BEFORE the MAX_RESULTS cap so a deliberately narrowed
// range can't be starved by 50 unrelated rows scoring higher. An
// all-default filter is a no-op; `isFilterActive` detects that to drive
// the accent highlight on the Filter glyph and to keep the empty-query
// "start typing" hint.
export type SearchFilter = {
  // Drop synthesized transfer rows + rows flagged as inter-account
  // transfers.
  excludeTransfers: boolean;
  // Drop synthesized bank-history rows (kind: "historic").
  excludeHistory: boolean;
  // Keep ONLY bank-history rows — everything that isn't imported bank
  // history counts as "unconfirmed".
  excludeUnconfirmed: boolean;
  // Inclusive absolute-amount band. null = that side is unbounded. The
  // comparison is on |amount| so a band matches both income and spend
  // of the same magnitude, mirroring amount-sort / amount-match.
  amountMin: number | null;
  amountMax: number | null;
  // Inclusive ISO date band. null = that side is unbounded. ISO strings
  // compare lexically, which matches chronological order.
  dateMin: string | null;
  dateMax: string | null;
  // Restrict to these sheet ids. Empty = every budget sheet (default).
  sheetIds: readonly string[];
};

export const EMPTY_FILTER: SearchFilter = {
  excludeTransfers: false,
  excludeHistory: false,
  excludeUnconfirmed: false,
  amountMin: null,
  amountMax: null,
  dateMin: null,
  dateMax: null,
  sheetIds: [],
};

export function isFilterActive(filter: SearchFilter): boolean {
  return (
    filter.excludeTransfers ||
    filter.excludeHistory ||
    filter.excludeUnconfirmed ||
    filter.amountMin !== null ||
    filter.amountMax !== null ||
    filter.dateMin !== null ||
    filter.dateMax !== null ||
    filter.sheetIds.length > 0
  );
}

// Natural min/max of the absolute amounts and ISO dates present in the
// index, used by the filter popover to seed the range sliders. A null
// bound means the index carries no amounts / no dates, so the caller
// can hide that slider. Computed once per index via `useMemo` upstream.
export type IndexBounds = {
  amountMin: number | null;
  amountMax: number | null;
  dateMin: string | null;
  dateMax: string | null;
};

export function indexBounds(index: readonly SearchEntry[]): IndexBounds {
  let amountMin: number | null = null;
  let amountMax: number | null = null;
  let dateMin: string | null = null;
  let dateMax: string | null = null;
  for (const entry of index) {
    if (entry.amount !== null) {
      const v = Math.abs(entry.amount);
      if (amountMin === null || v < amountMin) amountMin = v;
      if (amountMax === null || v > amountMax) amountMax = v;
    }
    if (entry.iso !== "") {
      if (dateMin === null || entry.iso < dateMin) dateMin = entry.iso;
      if (dateMax === null || entry.iso > dateMax) dateMax = entry.iso;
    }
  }
  return { amountMin, amountMax, dateMin, dateMax };
}

// Build a flat searchable list across every sheet the user has. Pulls
// in user-authored rows plus the same synthesized rows that
// `BudgetPage` renders — `buildVisibleRows` is the single source of
// truth so the index and the visible UI can't drift. Each row is
// projected to its searchable fields: description, type name,
// category name, amount. Computed once per `UserData` snapshot via
// `useMemo` upstream.
//
// Preset type / category names are stored as the seeding Swedish
// baseline (e.g. `name: "Apoteket"` for `pharmacy`); the displayed
// name routes through `displayTypeName` / `displayCategoryName` so
// the user sees the catalog translation for the active language.
// The search has to index that translated form so a user searching
// "pharmacy" finds rows of preset type `preset-type-pharmacy` —
// hence the `t` parameter. User-added types and categories carry
// their own name verbatim and route through `t` no-op-style.
export function buildSearchIndex(data: UserData, t: TFunction): SearchEntry[] {
  const entries: SearchEntry[] = [];
  const types = allTypes(data);
  const categories = allCategories(data);
  const typesById = new Map<string, EntryType>();
  for (const t of types) typesById.set(t.id, t);
  const categoriesById = new Map<string, Category>();
  for (const c of categories) categoriesById.set(c.id, c);
  const companiesById = new Map<string, Company>();
  for (const c of data.companies) companiesById.set(c.id, c);
  const accountsById = new Map<string, string>();
  for (const a of data.accounts) accountsById.set(a.id, a.name);

  for (const sheet of data.sheets) {
    for (const item of sheet.items) {
      if (item.type !== "accountBudget") continue;
      const accountBudget = item as AccountBudget;
      const rows = visibleRowsFor(accountBudget, sheet, data, accountsById);
      const dateColId = findColumnByType(accountBudget.columns, "date")?.id;
      const descColId = findColumnByType(
        accountBudget.columns,
        "description",
      )?.id;
      const amountColId = findColumnByType(accountBudget.columns, "amount")?.id;
      // Index the underlying HistoryEntry by id so each historic row
      // can attach its raw bank memo. Built per-item so the lookup
      // stays bounded by the account's own history length.
      const historyById = historyEntriesFor(accountBudget, data);
      for (const row of rows) {
        const iso =
          dateColId !== undefined && typeof row.cells[dateColId] === "string"
            ? (row.cells[dateColId] as string)
            : "";
        const description =
          descColId !== undefined && typeof row.cells[descColId] === "string"
            ? (row.cells[descColId] as string)
            : "";
        const amount =
          amountColId !== undefined &&
          typeof row.cells[amountColId] === "number"
            ? (row.cells[amountColId] as number)
            : null;
        const type =
          row.typeId !== undefined ? typesById.get(row.typeId) : undefined;
        const category = type ? categoriesById.get(type.categoryId) : undefined;
        const company =
          row.companyId !== undefined
            ? companiesById.get(row.companyId)
            : undefined;
        const typeName = type ? displayTypeName(type, t) : "";
        const categoryName = category ? displayCategoryName(category, t) : "";
        const companyName = company?.name ?? "";
        const bankDescription =
          row.kind === "historic"
            ? (historyById.get(row.historyEntryId)?.description ?? "")
            : "";
        entries.push({
          sheetId: sheet.id,
          sheetName: sheet.name,
          sheetColor: sheet.color,
          sheetGlyph: sheet.glyph,
          itemId: item.id,
          rowId: row.id,
          iso,
          description,
          typeName,
          categoryName,
          companyName,
          bankDescription,
          amount,
          kind: row.kind,
          isTransfer: row.kind === "transfer" || row.isTransfer === true,
          descriptionLc: description.toLowerCase(),
          typeNameLc: typeName.toLowerCase(),
          categoryNameLc: categoryName.toLowerCase(),
          companyNameLc: companyName.toLowerCase(),
          bankDescriptionLc: bankDescription.toLowerCase(),
        });
      }
    }
  }

  return entries;
}

const EMPTY_HISTORY_BY_ID: ReadonlyMap<string, HistoryEntry> = new Map();

function historyEntriesFor(
  item: AccountBudget,
  data: UserData,
): ReadonlyMap<string, HistoryEntry> {
  if (!item.accountId) return EMPTY_HISTORY_BY_ID;
  const history = data.history[item.accountId];
  if (!history || history.length === 0) return EMPTY_HISTORY_BY_ID;
  const map = new Map<string, HistoryEntry>();
  for (const e of history) map.set(e.id, e);
  return map;
}

function visibleRowsFor(
  item: AccountBudget,
  _sheet: Sheet,
  data: UserData,
  accountsById: ReadonlyMap<string, string>,
): Row[] {
  const history = item.accountId ? (data.history[item.accountId] ?? []) : [];
  return buildVisibleRows(
    item,
    data.transfers,
    history,
    accountsById,
    data.merchantHints,
    data.matchRules,
    data.companies,
    data.types,
  );
}

// Amount matches accept any row whose amount sits within ±20% of the
// queried value. Picked over a fixed band ("within 50") because both
// 5 and 50000 should have a sensible window. Tweak via this constant
// if it ever feels too loose or too tight.
const AMOUNT_TOLERANCE = 0.2;

// Score weights for text matches, lower = better. Description hits
// outrank everything else — it's the most specific identifier on a
// row — followed by company name, type name, and category name in
// that order. Company sits above type / category because the
// merchant the row paid is a more specific signal than the bucket
// it falls into, but below description because the user's own
// words on the row beat a tag they share with every other row to
// the same merchant. Bank description sits at the bottom of the
// text tier: it's a fallback signal for historic rows whose
// visible description got replaced by a company / type tag, so a
// hit there should only surface when none of the visible fields
// match.
const FIELD_WEIGHT: Record<
  | "description"
  | "companyName"
  | "typeName"
  | "categoryName"
  | "bankDescription",
  number
> = {
  description: 0,
  companyName: 1,
  typeName: 2,
  categoryName: 3,
  bankDescription: 4,
};

// Cap the result list so a query like "a" doesn't render thousands of
// rows. The modal shows the top hits ordered by relevance; in
// practice the user refines the query when they don't see what they
// want.
const MAX_RESULTS = 50;

// Placeholder match for filter-only browsing (empty query): there's no
// matched substring to highlight, and a zero-length range renders no
// <mark>. The field is "description" purely to satisfy the union — the
// ResultRow's bank-label branch keys off "bankDescription" so this
// stays inert.
const NEUTRAL_MATCH: SearchMatch = { field: "description", start: 0, end: 0 };

// Filter predicate applied before scoring so the result cap counts only
// rows the user wants to see. See `SearchFilter` for per-field meaning.
function matchesFilter(entry: SearchEntry, filter: SearchFilter): boolean {
  if (filter.excludeUnconfirmed && entry.kind !== "historic") return false;
  if (filter.excludeHistory && entry.kind === "historic") return false;
  if (filter.excludeTransfers && entry.isTransfer) return false;
  if (filter.sheetIds.length > 0 && !filter.sheetIds.includes(entry.sheetId))
    return false;
  if (filter.amountMin !== null || filter.amountMax !== null) {
    // A row without an amount can't satisfy an amount band — drop it
    // rather than letting it slip past a deliberate narrowing.
    if (entry.amount === null) return false;
    const v = Math.abs(entry.amount);
    if (filter.amountMin !== null && v < filter.amountMin) return false;
    if (filter.amountMax !== null && v > filter.amountMax) return false;
  }
  if (filter.dateMin !== null || filter.dateMax !== null) {
    if (entry.iso === "") return false;
    if (filter.dateMin !== null && entry.iso < filter.dateMin) return false;
    if (filter.dateMax !== null && entry.iso > filter.dateMax) return false;
  }
  return true;
}

export function runSearch(
  index: readonly SearchEntry[],
  query: string,
  sortBy: SearchSort = "relevance",
  filter: SearchFilter = EMPTY_FILTER,
): SearchResult[] {
  const trimmed = query.trim();
  if (trimmed === "") {
    // Filter-only browsing: with no query there's nothing to score, so
    // surface the filtered rows directly (a no-op match keeps the
    // SearchResult shape without highlighting anything). When the filter
    // is also default we return [] so the modal shows its "start
    // typing" hint instead of dumping the entire workspace.
    if (!isFilterActive(filter)) return [];
    const browsed: SearchResult[] = [];
    for (const entry of index) {
      if (!matchesFilter(entry, filter)) continue;
      browsed.push({ entry, match: NEUTRAL_MATCH });
    }
    const ordered =
      sortBy === "relevance" ? browsed : reorderResults(browsed, sortBy);
    return ordered.slice(0, MAX_RESULTS);
  }
  const needle = trimmed.toLowerCase();
  const parsedAmount = parseAmount(trimmed);

  type Scored = { result: SearchResult; score: number };
  const scored: Scored[] = [];

  // Pull the lowercase haystacks out of an array literal once per
  // iteration. The previous loop body lowercased every haystack on
  // every keystroke; `buildSearchIndex` now caches the lc forms so
  // each text-match check collapses to a plain `indexOf`.
  const TEXT_FIELDS: {
    name:
      | "description"
      | "typeName"
      | "categoryName"
      | "companyName"
      | "bankDescription";
    lcKey:
      | "descriptionLc"
      | "typeNameLc"
      | "categoryNameLc"
      | "companyNameLc"
      | "bankDescriptionLc";
  }[] = [
    { name: "description", lcKey: "descriptionLc" },
    { name: "companyName", lcKey: "companyNameLc" },
    { name: "typeName", lcKey: "typeNameLc" },
    { name: "categoryName", lcKey: "categoryNameLc" },
    { name: "bankDescription", lcKey: "bankDescriptionLc" },
  ];
  for (const entry of index) {
    if (!matchesFilter(entry, filter)) continue;
    let best: { match: SearchMatch; score: number } | null = null;

    // Text matches first — find earliest hit across fields, weighted
    // by field priority.
    for (const field of TEXT_FIELDS) {
      const haystackLc = entry[field.lcKey];
      if (haystackLc === "") continue;
      const idx = haystackLc.indexOf(needle);
      if (idx === -1) continue;
      // Score: field weight (×1000 so it dominates) + position inside
      // the field. Earlier matches and higher-priority fields rank
      // first; ties break on insertion order via stable sort.
      const score = FIELD_WEIGHT[field.name] * 1000 + idx;
      if (best === null || score < best.score) {
        best = {
          match: { field: field.name, start: idx, end: idx + needle.length },
          score,
        };
      }
    }

    // Amount match — kicks in when the query parses as a number AND
    // the row carries an amount within the tolerance band. Distance-
    // based score; exact match lands at 0 and beats any text hit on
    // a row that matches both ways. Comparison is on absolute value
    // so "100" matches both income (+100) and expense (-100) rows —
    // users typically remember the magnitude, not the sign.
    if (parsedAmount !== null && entry.amount !== null) {
      const queryAbs = Math.abs(parsedAmount);
      const rowAbs = Math.abs(entry.amount);
      const distance = Math.abs(rowAbs - queryAbs);
      const band = Math.max(queryAbs * AMOUNT_TOLERANCE, 0.01);
      if (distance <= band) {
        // Amount distance is on a different scale than text scores;
        // map it into the same range so a near-exact amount can
        // outrank a mid-field text hit. Exact match → 0; full-band
        // → 999 (just under the next field weight tier).
        const amountScore = Math.round((distance / band) * 999);
        if (best === null || amountScore < best.score) {
          best = {
            match: { field: "amount", distance },
            score: amountScore,
          };
        }
      }
    }

    if (best !== null) {
      scored.push({
        result: { entry, match: best.match },
        score: best.score,
      });
    }
  }

  // Stable sort by score (Array.prototype.sort is stable per ES2019),
  // then take the top N. Equal scores keep their input order, which
  // happens to be the row order inside each sheet — newest rows last,
  // which is fine for a transaction ledger.
  scored.sort((a, b) => a.score - b.score);
  const top = scored.slice(0, MAX_RESULTS).map((s) => s.result);
  if (sortBy === "relevance") return top;
  return reorderResults(top, sortBy);
}

// Re-sort the relevance-trimmed list by the user-picked field. Rows
// missing the field's value (no date, no amount) drop to the bottom
// regardless of direction — promoting them would surface
// least-informative hits first and bury the rows the user can
// actually compare.
function reorderResults(
  results: SearchResult[],
  sortBy: Exclude<SearchSort, "relevance">,
): SearchResult[] {
  const reordered = results.slice();
  reordered.sort((a, b) => {
    const av = fieldValue(a.entry, sortBy);
    const bv = fieldValue(b.entry, sortBy);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const direction = sortBy.endsWith("-asc") ? 1 : -1;
    if (av === bv) return 0;
    return av < bv ? -1 * direction : 1 * direction;
  });
  return reordered;
}

function fieldValue(
  entry: SearchEntry,
  sortBy: Exclude<SearchSort, "relevance">,
): number | string | null {
  if (sortBy === "date-asc" || sortBy === "date-desc") {
    return entry.iso === "" ? null : entry.iso;
  }
  // Compare amounts by magnitude so "Highest first" surfaces the
  // biggest spend or biggest income regardless of sign — the user's
  // mental model when scanning a transaction list is size, not the
  // mathematical position on the number line that would rank -744
  // ahead of -944.
  return entry.amount === null ? null : Math.abs(entry.amount);
}
