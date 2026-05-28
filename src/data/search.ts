import { allCategories, allTypes } from "./presets/merge";
import { buildVisibleRows } from "./budget/rows";
import { findColumnByType } from "./sheet";
import type {
  AccountBudget,
  Category,
  Company,
  EntryType,
  Row,
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
  amount: number | null;
  // Pre-lowercased mirrors of the searchable string fields.
  // `runSearch` previously lowercased every haystack on every
  // keystroke; hoisting the work into `buildSearchIndex` collapses
  // the per-keystroke cost to a plain `indexOf` on the cached form.
  descriptionLc: string;
  typeNameLc: string;
  categoryNameLc: string;
  companyNameLc: string;
};

// Where the match landed and the offset / length inside the matched
// string for substring highlighting. `amount` matches don't carry a
// range because the score is distance-based, not substring-based.
export type SearchMatch =
  | {
      field: "description" | "typeName" | "categoryName" | "companyName";
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
          amount,
          descriptionLc: description.toLowerCase(),
          typeNameLc: typeName.toLowerCase(),
          categoryNameLc: categoryName.toLowerCase(),
          companyNameLc: companyName.toLowerCase(),
        });
      }
    }
  }

  return entries;
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
// the same merchant.
const FIELD_WEIGHT: Record<
  "description" | "companyName" | "typeName" | "categoryName",
  number
> = {
  description: 0,
  companyName: 1,
  typeName: 2,
  categoryName: 3,
};

// Cap the result list so a query like "a" doesn't render thousands of
// rows. The modal shows the top hits ordered by relevance; in
// practice the user refines the query when they don't see what they
// want.
const MAX_RESULTS = 50;

export function runSearch(
  index: readonly SearchEntry[],
  query: string,
): SearchResult[] {
  const trimmed = query.trim();
  if (trimmed === "") return [];
  const needle = trimmed.toLowerCase();
  const parsedAmount = parseAmount(trimmed);

  type Scored = { result: SearchResult; score: number };
  const scored: Scored[] = [];

  // Pull the lowercase haystacks out of an array literal once per
  // iteration. The previous loop body lowercased every haystack on
  // every keystroke; `buildSearchIndex` now caches the lc forms so
  // each text-match check collapses to a plain `indexOf`.
  const TEXT_FIELDS: {
    name: "description" | "typeName" | "categoryName" | "companyName";
    lcKey: "descriptionLc" | "typeNameLc" | "categoryNameLc" | "companyNameLc";
  }[] = [
    { name: "description", lcKey: "descriptionLc" },
    { name: "companyName", lcKey: "companyNameLc" },
    { name: "typeName", lcKey: "typeNameLc" },
    { name: "categoryName", lcKey: "categoryNameLc" },
  ];
  for (const entry of index) {
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
  return scored.slice(0, MAX_RESULTS).map((s) => s.result);
}
