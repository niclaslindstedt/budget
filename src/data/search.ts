import {
  DEFAULT_SEARCH_RANKING,
  SEARCH_FIELD_WEIGHT_MAX,
} from "./constants/defaults";
import { allCategories, allTypes } from "./presets/merge";
import { buildVisibleRows } from "./budget/rows";
import { findColumnByType } from "./sheet";
import type {
  AccountBudget,
  HistoryEntry,
  Row,
  RowKind,
  SearchRankingSettings,
  Sheet,
  Tag,
  UserData,
} from "./types";
import type { TFunction } from "../i18n";
import { displayCategoryName, displayTypeName } from "../i18n/preset-names";
import { todayIso } from "../utils/date";
import { parseAmount } from "../utils/format";
import { indexById } from "../utils/indexById";

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
  // Glyph + colour of the row's `EntryType`, mirrored so the result row
  // can render the type's pictogram before its name without re-resolving
  // the type at render time. Empty string / "" when the row has no type.
  typeGlyph: string;
  typeColor: string;
  categoryName: string;
  // Glyph + colour of the row's `Category`, mirrored like the type pair
  // so the filter popover can render a category option without
  // re-resolving the catalog. Empty when the row has no type / category.
  categoryGlyph: string;
  categoryColor: string;
  companyName: string;
  // Ids of the row's type / category / company, kept alongside the
  // display names so the filter popover can match on identity (an
  // empty string when the row carries none). Filtering by id rather
  // than name avoids collapsing two same-named-but-distinct entries.
  typeId: string;
  categoryId: string;
  companyId: string;
  // Space-joined names of the row's tags. Tags never render on the
  // sheet, so this field exists purely to make a tagged row findable
  // by a tag's name even when no visible field contains the query.
  tagNames: string;
  // Resolved tags carried by the row ({id, name, color}), in row order.
  // Backs the tag filter's identity match and the coloured option chips
  // in the filter popover — a structured form is needed because tag
  // names can contain spaces, so the joined `tagNames` can't be split
  // back apart reliably.
  tags: readonly { id: string; name: string; color: string }[];
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
  // True when the row belongs to a recurrence series (`row.seriesId` is
  // set). Mirrored here so the result row can show a "recurring" glyph
  // for the entry without reaching back into the source row.
  isRecurring: boolean;
  // Pre-lowercased mirrors of the searchable string fields, built once
  // in `buildSearchIndex` so `runSearch` does a plain `indexOf` on the
  // cached form per keystroke.
  descriptionLc: string;
  typeNameLc: string;
  categoryNameLc: string;
  companyNameLc: string;
  tagNamesLc: string;
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
        | "tagNames"
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

// What `runSearch` returns: the capped, sorted list the modal renders
// plus the total number of matches before the cap, so the modal can
// show a "{total} hits, showing {results.length}" count row.
export type SearchOutcome = {
  results: SearchResult[];
  total: number;
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
// `runSearch`, BEFORE the result cap so a deliberately narrowed
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
  // "Exclude data older than N calendar years" — a coarser, quick-pick
  // companion to the `dateMin` slider. Counts calendar years to keep,
  // current year inclusive: 1 = this year only, 2 = this year + last,
  // and so on. Resolved against today into an inclusive Jan-1 ISO floor
  // (see `ageFloorIso`); rows dated before it — and undated rows — drop
  // out. null = no age limit (default). Unlike the date slider, this
  // survives as a stable intent ("the last two years") rather than a
  // fixed date, so it stays correct as the calendar rolls over.
  maxAgeYears: number | null;
  // Restrict to these sheet ids. Empty = every budget sheet (default).
  sheetIds: readonly string[];
  // Restrict to rows carrying one of these company / type / category
  // ids. Empty = no constraint on that axis (default). A row whose id
  // is absent (no company / no type) never satisfies a non-empty
  // constraint, so picking a company narrows to rows that have it.
  companyIds: readonly string[];
  typeIds: readonly string[];
  categoryIds: readonly string[];
  // Restrict to rows carrying these tag ids. `tagMatchAll` toggles the
  // combinator: false (default) keeps rows with ANY of the picked tags,
  // true keeps only rows carrying ALL of them (the "&&" mode).
  tagIds: readonly string[];
  tagMatchAll: boolean;
};

export const EMPTY_FILTER: SearchFilter = {
  excludeTransfers: false,
  excludeHistory: false,
  excludeUnconfirmed: false,
  amountMin: null,
  amountMax: null,
  dateMin: null,
  dateMax: null,
  maxAgeYears: null,
  sheetIds: [],
  companyIds: [],
  typeIds: [],
  categoryIds: [],
  tagIds: [],
  tagMatchAll: false,
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
    filter.maxAgeYears !== null ||
    filter.sheetIds.length > 0 ||
    filter.companyIds.length > 0 ||
    filter.typeIds.length > 0 ||
    filter.categoryIds.length > 0 ||
    filter.tagIds.length > 0
  );
}

// Inclusive ISO floor for the `maxAgeYears` filter, or null when no age
// limit is set. `maxAgeYears` counts calendar years to keep with the
// current year inclusive (1 = this year only, 2 = this year + last, …),
// so the floor is Jan 1 of `currentYear - (maxAgeYears - 1)`. Resolved
// against `referenceIso` (today) so the window tracks the calendar
// rather than freezing to the date the user picked it.
export function ageFloorIso(
  maxAgeYears: number | null,
  referenceIso: string,
): string | null {
  if (maxAgeYears === null) return null;
  const year = Number(referenceIso.slice(0, 4));
  const floorYear = year - (maxAgeYears - 1);
  return `${String(floorYear).padStart(4, "0")}-01-01`;
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

// Amount / date extents of the rows the current query and the
// categorical filters (the exclude toggles + sheet selection) would
// surface — what the filter popover seeds its range sliders from.
// Unlike `indexBounds`, which spans the entire workspace, this tracks
// what the user is actually looking at: searching "Meds" with four
// 100–500 kr hits collapses the amount slider to 100–500 instead of
// 0–981K, and the date slider to those four rows' span.
//
// The amount/date range bounds of `filter` are deliberately ignored
// here — folding a slider's own value back into its domain would let
// it collapse onto itself as the user drags. The exclude toggles and
// sheet selection ARE honoured, since those genuinely change which
// rows are "in the search".
export function searchBounds(
  index: readonly SearchEntry[],
  query: string,
  filter: SearchFilter,
  ranking: SearchRankingSettings = DEFAULT_SEARCH_RANKING,
  referenceIso: string = todayIso(),
): IndexBounds {
  // Strip the slider range constraints; keep the categorical ones. The
  // `maxAgeYears` quick-pick is kept too — it's a coarse calendar window,
  // not a draggable slider, so honouring it narrows the date slider's
  // domain to the visible window without the self-collapse the slider's
  // own bounds would cause.
  const categorical: SearchFilter = {
    ...filter,
    amountMin: null,
    amountMax: null,
    dateMin: null,
    dateMax: null,
  };
  const ageFloor = ageFloorIso(categorical.maxAgeYears, referenceIso);
  const trimmed = query.trim();
  // No query → bounds over every categorically-matching row (matches
  // the old whole-index seeding for empty-query filter browsing, but
  // narrowed by any active exclude / sheet filter).
  if (trimmed === "") {
    const matched = index.filter((e) =>
      matchesFilter(e, categorical, ageFloor),
    );
    return indexBounds(matched);
  }
  const needle = trimmed.toLowerCase();
  const parsedAmount = parseAmount(trimmed);
  const matched: SearchEntry[] = [];
  for (const entry of index) {
    if (!matchesFilter(entry, categorical, ageFloor)) continue;
    if (scoreEntry(entry, needle, parsedAmount, ranking) !== null)
      matched.push(entry);
  }
  return indexBounds(matched);
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
  const typesById = indexById(types);
  const categoriesById = indexById(categories);
  const companiesById = indexById(data.companies);
  const tagsById = indexById(data.tags);
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
        const typeGlyph = type ? type.glyph : "";
        const typeColor = type ? type.color : "";
        const categoryName = category ? displayCategoryName(category, t) : "";
        const categoryGlyph = category ? category.icon : "";
        const categoryColor = category ? category.color : "";
        const companyName = company?.name ?? "";
        const tags =
          row.tagIds && row.tagIds.length > 0
            ? row.tagIds
                .map((tagId) => tagsById.get(tagId))
                .filter((tag): tag is Tag => tag !== undefined)
                .map((tag) => ({
                  id: tag.id,
                  name: tag.name,
                  color: tag.color,
                }))
            : [];
        const tagNames = tags.map((tag) => tag.name).join(" ");
        const bankDescription =
          row.kind === "historic"
            ? (historyById.get(row.historyEntryId)?.description ?? "")
            : "";
        // On a synthesized history row with no user-authored
        // description, the description cell is a fallback echo of the
        // company or type name (resolveEntryLabels' chain:
        // userDescription → companyName → typeName → bank text;
        // `descriptionPlaceholder` is set exactly in that fallback
        // case). Indexing that echo in the top-priority `description`
        // field would let a substring of the *type* name — "car" inside
        // "Childcare" — outrank a row the user deliberately tagged
        // `car`. Suppress the description-tier match when the cell
        // merely repeats the company or type name; the dedicated
        // `companyName` / `typeName` fields still surface the row at
        // their own (lower) priority, so a tag (weight 2) beats a type
        // (weight 3) as the user expects. A raw-bank-text fallback is
        // left indexed — that memo is the row's only human-readable
        // description, so it earns the description tier.
        const descriptionIsLabelEcho =
          row.kind === "historic" &&
          row.descriptionPlaceholder !== undefined &&
          description !== "" &&
          ((company !== undefined && description === company.name) ||
            (type !== undefined && description === type.name));
        const descriptionLc = descriptionIsLabelEcho
          ? ""
          : description.toLowerCase();
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
          typeGlyph,
          typeColor,
          categoryName,
          categoryGlyph,
          categoryColor,
          companyName,
          typeId: type?.id ?? "",
          categoryId: category?.id ?? "",
          companyId: company?.id ?? "",
          tagNames,
          tags,
          bankDescription,
          amount,
          kind: row.kind,
          isTransfer: row.kind === "transfer" || row.isTransfer === true,
          isRecurring: !!row.seriesId,
          descriptionLc,
          typeNameLc: typeName.toLowerCase(),
          categoryNameLc: categoryName.toLowerCase(),
          companyNameLc: companyName.toLowerCase(),
          tagNamesLc: tagNames.toLowerCase(),
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

// The searchable text fields paired with their pre-lowercased mirror
// and the `SearchFieldWeights` key the user's importance slider lives
// under. Hoisted to module scope so the scorer shares one allocation
// instead of rebuilding the literal per call.
const TEXT_FIELDS: {
  name:
    | "description"
    | "typeName"
    | "categoryName"
    | "companyName"
    | "tagNames"
    | "bankDescription";
  lcKey:
    | "descriptionLc"
    | "typeNameLc"
    | "categoryNameLc"
    | "companyNameLc"
    | "tagNamesLc"
    | "bankDescriptionLc";
  weightKey: keyof SearchRankingSettings["fieldWeights"];
}[] = [
  { name: "description", lcKey: "descriptionLc", weightKey: "description" },
  { name: "companyName", lcKey: "companyNameLc", weightKey: "company" },
  { name: "tagNames", lcKey: "tagNamesLc", weightKey: "tag" },
  { name: "typeName", lcKey: "typeNameLc", weightKey: "type" },
  { name: "categoryName", lcKey: "categoryNameLc", weightKey: "category" },
  {
    name: "bankDescription",
    lcKey: "bankDescriptionLc",
    weightKey: "bankDescription",
  },
];

// Composite-score magnitudes (lower = better). The dominant axis gets
// PRIMARY, the secondary axis SECONDARY; position-within-field sits
// below both so it only ever breaks a quality+field tie. The bands are
// spaced so no lower tier can ever bleed into a higher one: field tiers
// span 0..10 → max 10 × SECONDARY = 10_000 < PRIMARY, quality spans
// 0..3 → max 3 × SECONDARY = 3_000 < PRIMARY, and position is capped at
// 999 < SECONDARY.
const PRIMARY = 1_000_000;
const SECONDARY = 1_000;
const MAX_POSITION = 999;

// Match-quality tiers (lower = cleaner). A whole-word hit reads as more
// relevant than the same letters buried mid-word, so "car" as its own
// word beats "car" inside "Carlo".
const QUALITY_EXACT = 0; // the whole field equals the needle
const QUALITY_WHOLE_WORD = 1; // needle bounded by word edges on both sides
const QUALITY_WORD_PREFIX = 2; // needle starts a word but the word continues
const QUALITY_SUBSTRING = 3; // mid-word / suffix

// Recency decays over five years: a hit that old contributes a full
// unit of "oldness", anything older clamps to the same. Recent /
// future-dated rows clamp to 0. Used only to order rows the ranking
// otherwise ties (or, in "boost" mode, to let a recent row edge out a
// slightly stronger older one — see `sortByRelevance`).
const RECENCY_HORIZON_DAYS = 5 * 365;
const MS_PER_DAY = 86_400_000;
// How far a maximally-recent row can climb in "boost" mode. Sized below
// SECONDARY so recency can reorder rows within one field+quality tier
// (whose only other differentiator is the ≤999 position term) without
// ever vaulting a row across a field or quality boundary.
const RECENCY_BOOST = 500;

const WORD_CHAR = /[\p{L}\p{N}]/u;

function isWordChar(ch: string): boolean {
  return WORD_CHAR.test(ch);
}

// Classify a single occurrence of `needle` at `idx` inside `hay` (both
// already lowercased) into a quality tier. Word boundaries are the
// string edges or any non-alphanumeric neighbour.
function matchQualityAt(hay: string, needle: string, idx: number): number {
  if (idx === 0 && needle.length === hay.length) return QUALITY_EXACT;
  const startsAtBoundary = idx === 0 || !isWordChar(hay[idx - 1]);
  const end = idx + needle.length;
  const endsAtBoundary = end >= hay.length || !isWordChar(hay[end]);
  if (startsAtBoundary && endsAtBoundary) return QUALITY_WHOLE_WORD;
  if (startsAtBoundary) return QUALITY_WORD_PREFIX;
  return QUALITY_SUBSTRING;
}

// Best (cleanest, then earliest) occurrence of `needle` in `hay`, or
// null when absent. Scans every occurrence rather than trusting the
// first `indexOf` so a clean later hit ("carlo" → "car" at a word
// start) beats a dirty earlier one ("oscar" → mid-word "car").
function bestMatch(
  hay: string,
  needle: string,
): { quality: number; index: number } | null {
  if (hay === "") return null;
  let best: { quality: number; index: number } | null = null;
  let from = 0;
  for (;;) {
    const idx = hay.indexOf(needle, from);
    if (idx === -1) break;
    const quality = matchQualityAt(hay, needle, idx);
    if (
      best === null ||
      quality < best.quality ||
      (quality === best.quality && idx < best.index)
    ) {
      best = { quality, index: idx };
    }
    if (quality === QUALITY_EXACT) break; // nothing can beat it
    from = idx + 1;
  }
  return best;
}

// Fold a quality tier, field tier (0..10, lower = more important), and
// the match's position into one comparable score under the user's
// chosen priority axis.
function composeScore(
  priority: SearchRankingSettings["priority"],
  quality: number,
  fieldTier: number,
  index: number,
): number {
  const pos = Math.min(index, MAX_POSITION);
  return priority === "field"
    ? fieldTier * PRIMARY + quality * SECONDARY + pos
    : quality * PRIMARY + fieldTier * SECONDARY + pos;
}

// Score one entry against a parsed query: the best (lowest-scoring)
// text or amount hit, or null when nothing matches. `needle` is the
// already-lowercased trimmed query; `parsedAmount` is `parseAmount` of
// the same query (null when it doesn't read as a number); `ranking`
// supplies the field weights, priority axis, and amount tolerance.
// Shared by `runSearch` (ranking), `matchingEntries`, and
// `searchBounds` so they can't disagree on what "matches the query"
// means. The returned score carries no recency component — `runSearch`
// layers that on at sort time so the date-free callers stay pure.
function scoreEntry(
  entry: SearchEntry,
  needle: string,
  parsedAmount: number | null,
  ranking: SearchRankingSettings,
): { match: SearchMatch; score: number } | null {
  let best: { match: SearchMatch; score: number } | null = null;

  // Text matches: take the cleanest hit per field, scored by quality +
  // field weight under the chosen priority axis.
  for (const field of TEXT_FIELDS) {
    const match = bestMatch(entry[field.lcKey], needle);
    if (match === null) continue;
    const fieldTier =
      SEARCH_FIELD_WEIGHT_MAX - ranking.fieldWeights[field.weightKey];
    const score = composeScore(
      ranking.priority,
      match.quality,
      fieldTier,
      match.index,
    );
    if (best === null || score < best.score) {
      best = {
        match: {
          field: field.name,
          start: match.index,
          end: match.index + needle.length,
        },
        score,
      };
    }
  }

  // Amount match — kicks in when the query parses as a number AND the
  // row carries an amount within the tolerance band. Distance-based
  // score on a 0..999 scale that sits below every text tier, so a
  // numeric query surfaces matching amounts ahead of incidental text
  // hits on the same digits; an exact amount lands at 0 and wins
  // outright. Comparison is on absolute value so "100" matches both
  // income (+100) and expense (-100) — users remember the magnitude,
  // not the sign.
  if (parsedAmount !== null && entry.amount !== null) {
    const queryAbs = Math.abs(parsedAmount);
    const rowAbs = Math.abs(entry.amount);
    const distance = Math.abs(rowAbs - queryAbs);
    const band = Math.max((queryAbs * ranking.amountTolerancePct) / 100, 0.01);
    if (distance <= band) {
      const amountScore = Math.round((distance / band) * MAX_POSITION);
      if (best === null || amountScore < best.score) {
        best = {
          match: { field: "amount", distance },
          score: amountScore,
        };
      }
    }
  }

  return best;
}

// A row's date as an epoch-day count, or -Infinity for undated / bad
// dates so they sort last (oldest) under recency. Kept raw — not
// horizon-clamped — so two rows decades apart still order correctly
// when recency breaks a tie.
function entryDays(iso: string): number {
  if (iso === "") return -Infinity;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? -Infinity : ms / MS_PER_DAY;
}

// Normalised "oldness" of a row in [0, 1]: 0 for today / future-dated
// rows, 1 for anything at or beyond the recency horizon (and for
// undated rows). Only "boost" mode reads this — it needs a bounded
// contribution so a recent row can climb at most RECENCY_BOOST. The
// horizon clamp is fine here precisely because it never decides order
// on its own; tie-break ordering uses the raw `entryDays` instead.
function recencyNorm(days: number, refDays: number): number {
  if (days === -Infinity) return 1;
  const delta = refDays - days;
  if (delta <= 0) return 0;
  if (delta >= RECENCY_HORIZON_DAYS) return 1;
  return delta / RECENCY_HORIZON_DAYS;
}

// Placeholder match for filter-only browsing (empty query): there's no
// matched substring to highlight, and a zero-length range renders no
// <mark>. The field is "description" purely to satisfy the union — the
// ResultRow's bank-label branch keys off "bankDescription" so this
// stays inert.
const NEUTRAL_MATCH: SearchMatch = { field: "description", start: 0, end: 0 };

// Filter predicate applied before scoring so the result cap counts only
// rows the user wants to see. See `SearchFilter` for per-field meaning.
// `ageFloor` is the pre-resolved inclusive ISO floor for `maxAgeYears`
// (null when no age limit) — computed once per query by the caller
// rather than per entry.
function matchesFilter(
  entry: SearchEntry,
  filter: SearchFilter,
  ageFloor: string | null,
): boolean {
  if (filter.excludeUnconfirmed && entry.kind !== "historic") return false;
  if (filter.excludeHistory && entry.kind === "historic") return false;
  if (filter.excludeTransfers && entry.isTransfer) return false;
  if (filter.sheetIds.length > 0 && !filter.sheetIds.includes(entry.sheetId))
    return false;
  if (
    filter.companyIds.length > 0 &&
    !filter.companyIds.includes(entry.companyId)
  )
    return false;
  if (filter.typeIds.length > 0 && !filter.typeIds.includes(entry.typeId))
    return false;
  if (
    filter.categoryIds.length > 0 &&
    !filter.categoryIds.includes(entry.categoryId)
  )
    return false;
  if (filter.tagIds.length > 0) {
    const has = (id: string) => entry.tags.some((tag) => tag.id === id);
    // "All" (&&) requires every picked tag on the row; "Any" (default)
    // requires at least one. A row with no tags fails both, so a tag
    // filter always narrows to tagged rows.
    const ok = filter.tagMatchAll
      ? filter.tagIds.every(has)
      : filter.tagIds.some(has);
    if (!ok) return false;
  }
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
  if (ageFloor !== null) {
    // An undated row can't be shown to be recent, so a max-age limit
    // drops it just like the date band does.
    if (entry.iso === "" || entry.iso < ageFloor) return false;
  }
  return true;
}

// Order the scored hits by the relevance composite, applying the
// recency mode: "tiebreak" only separates rows equal on the composite
// (newest first, by raw date); "boost" folds a bounded recency term
// into the score so a recent row can edge out a slightly stronger older
// one within the same field+quality tier; "off" leaves the stable
// composite order (which preserves index order — oldest-first — among
// ties). Mutates `scored`. `refDays` is today as an epoch-day count.
function sortByRelevance(
  scored: { result: SearchResult; score: number; days: number }[],
  recency: SearchRankingSettings["recency"],
  refDays: number,
): void {
  if (recency === "boost") {
    scored.sort(
      (a, b) =>
        a.score +
        recencyNorm(a.days, refDays) * RECENCY_BOOST -
        (b.score + recencyNorm(b.days, refDays) * RECENCY_BOOST),
    );
    return;
  }
  if (recency === "tiebreak") {
    // Newer first among equal composites: larger day-count ranks first.
    scored.sort((a, b) =>
      a.score !== b.score ? a.score - b.score : b.days - a.days,
    );
    return;
  }
  scored.sort((a, b) => a.score - b.score);
}

export function runSearch(
  index: readonly SearchEntry[],
  query: string,
  sortBy: SearchSort = "relevance",
  filter: SearchFilter = EMPTY_FILTER,
  ranking: SearchRankingSettings = DEFAULT_SEARCH_RANKING,
  referenceIso: string = todayIso(),
): SearchOutcome {
  const cap = ranking.maxResults;
  const ageFloor = ageFloorIso(filter.maxAgeYears, referenceIso);
  const trimmed = query.trim();
  if (trimmed === "") {
    // Filter-only browsing: with no query there's nothing to score, so
    // surface the filtered rows directly (a no-op match keeps the
    // SearchResult shape without highlighting anything). When the filter
    // is also default we return [] so the modal shows its "start
    // typing" hint instead of dumping the entire workspace.
    if (!isFilterActive(filter)) return { results: [], total: 0 };
    const browsed: SearchResult[] = [];
    for (const entry of index) {
      if (!matchesFilter(entry, filter, ageFloor)) continue;
      browsed.push({ entry, match: NEUTRAL_MATCH });
    }
    const ordered =
      sortBy === "relevance" ? browsed : reorderResults(browsed, sortBy);
    return { results: ordered.slice(0, cap), total: browsed.length };
  }
  const needle = trimmed.toLowerCase();
  const parsedAmount = parseAmount(trimmed);
  const refDays = Date.parse(referenceIso) / MS_PER_DAY;

  type Scored = { result: SearchResult; score: number; days: number };
  const scored: Scored[] = [];

  for (const entry of index) {
    if (!matchesFilter(entry, filter, ageFloor)) continue;
    const best = scoreEntry(entry, needle, parsedAmount, ranking);
    if (best !== null) {
      scored.push({
        result: { entry, match: best.match },
        score: best.score,
        days: entryDays(entry.iso),
      });
    }
  }

  // Array.prototype.sort is stable per ES2019, so equal composites keep
  // their input order (row order inside each sheet) when recency is off.
  sortByRelevance(scored, ranking.recency, refDays);
  const top = scored.slice(0, cap).map((s) => s.result);
  const results = sortBy === "relevance" ? top : reorderResults(top, sortBy);
  return { results, total: scored.length };
}

// Every entry matching the query + filter, uncapped and unscored — the
// raw match set behind the result display cap. "Select all" uses this
// so a bulk operation can reach matches beyond the rendered top N, not
// just the rows currently on screen. Order is irrelevant to the caller
// (it maps to a selection set), so this skips the relevance sort
// `runSearch` does. `ranking` only affects the amount-tolerance band
// here, but threading it keeps the match set identical to `runSearch`.
export function matchingEntries(
  index: readonly SearchEntry[],
  query: string,
  filter: SearchFilter = EMPTY_FILTER,
  ranking: SearchRankingSettings = DEFAULT_SEARCH_RANKING,
  referenceIso: string = todayIso(),
): SearchEntry[] {
  const ageFloor = ageFloorIso(filter.maxAgeYears, referenceIso);
  const trimmed = query.trim();
  if (trimmed === "") {
    if (!isFilterActive(filter)) return [];
    return index.filter((entry) => matchesFilter(entry, filter, ageFloor));
  }
  const needle = trimmed.toLowerCase();
  const parsedAmount = parseAmount(trimmed);
  const out: SearchEntry[] = [];
  for (const entry of index) {
    if (!matchesFilter(entry, filter, ageFloor)) continue;
    if (scoreEntry(entry, needle, parsedAmount, ranking) !== null)
      out.push(entry);
  }
  return out;
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
