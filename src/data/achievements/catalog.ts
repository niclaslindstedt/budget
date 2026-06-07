import {
  Accessibility,
  Archive,
  ArrowLeftRight,
  ArrowRightLeft,
  ArrowUpDown,
  Banknote,
  Bookmark,
  BookOpen,
  Boxes,
  Brain,
  Building2,
  Calculator,
  Calendar,
  CalendarArrowUp,
  CalendarClock,
  CalendarCog,
  CalendarPlus,
  Check,
  ChevronsDownUp,
  Cloud,
  Code2,
  Columns3,
  Combine,
  CopyCheck,
  Download,
  Eye,
  EyeOff,
  FileLock2,
  FileSpreadsheet,
  FileText,
  FileUp,
  Filter,
  FolderTree,
  FunctionSquare,
  GitMerge,
  Hammer,
  Hash,
  History,
  Home,
  KeyRound,
  Landmark,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Link as LinkIcon,
  ListChecks,
  ListOrdered,
  Lock,
  LockKeyhole,
  Merge,
  MousePointerClick,
  Move,
  Network,
  Palette,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  ReceiptText,
  Repeat,
  Ruler,
  Save,
  Scale,
  Search,
  Share2,
  Sigma,
  SlidersHorizontal,
  Smartphone,
  Split,
  Star,
  Tag,
  Type as TypeIcon,
  Undo2,
  UserPlus,
  Users,
  Wallet,
  Wand2,
  WifiOff,
  Wrench,
} from "lucide-react";

import { mortgagePayoffProgress } from "../property-mortgage/progress";
import { someSheetItemRow } from "../sheet-types";
import type { Row, SheetItem, UserData } from "../types";
import type { Achievement } from "./types";

// Pure predicate helpers used by the catalog. Each takes a UserData
// snapshot and returns a boolean; "first time" achievements then
// derive as `!hasX(prev) && hasX(next)` in their trigger predicate
// below. Kept inline so the catalog is the single file an agent
// reads when adding a new entry — same source of truth as the
// achievements modal itself.

// Budget-specific traversal: the `columns` / `rows.length` predicates
// below are intrinsically about the ledger shape, so they stay scoped
// to `accountBudget` items rather than walking the registry.
function eachAccountBudget(
  state: UserData,
  fn: (item: Extract<SheetItem, { type: "accountBudget" }>) => boolean,
): boolean {
  for (const sheet of state.sheets) {
    for (const item of sheet.items) {
      if (item.type === "accountBudget" && fn(item)) return true;
    }
  }
  return false;
}

// Generic row predicate: routes through the sheet-type registry's
// row accessor so a "does any row do X" check counts rows on every
// row-bearing flavour, not just budgets. Today only budgets bear rows,
// so the behaviour is identical — but a future row-bearing sheet type
// is included automatically rather than being silently undercounted.
function eachRow(state: UserData, fn: (row: Row) => boolean): boolean {
  return someSheetItemRow(state, fn);
}

const hasAnyUserRow = (s: UserData) =>
  eachAccountBudget(s, (i) => i.rows.length > 0);
const hasCompletedRow = (s: UserData) =>
  eachRow(s, (r) => Object.values(r.cells).some((v) => v === true));
const hasRecurringRow = (s: UserData) =>
  eachRow(s, (r) => typeof r.seriesId === "string" && r.seriesId !== "");
const hasFormulaRow = (s: UserData) =>
  eachRow(
    s,
    (r) => typeof r.amountFormula === "string" && r.amountFormula !== "",
  );
// A balance "builds" once a budget carries more than one row — the
// running total visibly accumulates from one row to the next. The
// first row alone is `firstSteps`; the second is the one the user
// watches the balance respond to.
const hasBalanceRun = (s: UserData) =>
  eachAccountBudget(s, (i) => i.rows.length >= 2);
// Stored formulas keep the `sheet("<id>", …)` call form for cross-sheet
// references (see `formulaToStored`), so a substring check on the
// persisted formula spots a row that reaches into another sheet.
const hasCrossSheetFormula = (s: UserData) =>
  eachRow(
    s,
    (r) =>
      typeof r.amountFormula === "string" && r.amountFormula.includes("sheet("),
  );
// A match rule that narrows by amount (sign or bounds) or by transfer
// membership — distinct from a plain description-only rule, which is
// what `patternRecognition` fires on.
const hasFilteredMatchRule = (s: UserData) =>
  s.matchRules.some(
    (r) =>
      (r.amountSign !== undefined && r.amountSign !== "any") ||
      (r.transferFilter !== undefined && r.transferFilter !== "any") ||
      r.amountMin !== undefined ||
      r.amountMax !== undefined,
  );
const hasCorrection = (s: UserData) =>
  eachRow(s, (r) => r.kind === "correction");
const hasTransferRow = (s: UserData) =>
  eachRow(s, (r) => r.isTransfer === true);
const hasTypedRow = (s: UserData) =>
  eachRow(s, (r) => typeof r.typeId === "string" && r.typeId !== "");
const hasTaggedRow = (s: UserData) =>
  eachRow(s, (r) => Array.isArray(r.tagIds) && r.tagIds.length > 0);
const hasCompany = (s: UserData) => s.companies.length > 0;
const hasEstimateRow = (s: UserData) =>
  eachRow(
    s,
    (r) => typeof r.amountMin === "number" && typeof r.amountMax === "number",
  );
const hasMultipleSheetTabs = (s: UserData) => s.sheets.length > 1;
const hasAccount = (s: UserData) => s.accounts.length > 0;
const hasTaxProfile = (s: UserData) => s.taxProfiles.length > 0;
const hasLinkedSheet = (s: UserData) =>
  eachAccountBudget(
    s,
    (i) => typeof i.accountId === "string" && i.accountId !== "",
  );
const hasTransfer = (s: UserData) => s.transfers.length > 0;
const hasUserCategory = (s: UserData) => s.categories.length > 0;
const hasUserType = (s: UserData) => s.types.length > 0;
const hasHiddenPreset = (s: UserData) =>
  s.hiddenPresetCategoryIds.length > 0 || s.hiddenPresetTypeIds.length > 0;
const hasMatchRule = (s: UserData) => s.matchRules.length > 0;
const hasSeriesMatchRule = (s: UserData) => s.seriesMatchRules.length > 0;
const hasMerchantHint = (s: UserData) =>
  Object.keys(s.merchantHints).length > 0;
const hasHistoryImport = (s: UserData) =>
  Object.values(s.historyImports).some((arr) => arr.length > 0);
const hasSplitHistoryEntry = (s: UserData) =>
  Object.values(s.history).some((arr) =>
    arr.some((e) => Array.isArray(e.splits) && e.splits.length > 0),
  );
const hasCollapsedTransferPair = (s: UserData) =>
  Object.values(s.history).some((arr) =>
    arr.some((e) => typeof e.collapsedIntoTransferId === "string"),
  );
const hasUserHistoryOverride = (s: UserData) =>
  Object.values(s.history).some((arr) =>
    arr.some(
      (e) =>
        typeof e.userTypeId === "string" ||
        (typeof e.userDescription === "string" && e.userDescription !== ""),
    ),
  );
// Default column order is date / description / type / amount /
// balance / completed. Anything else (different length, or a
// different type at any position) is a user reorder.
const DEFAULT_COLUMN_ORDER: readonly string[] = [
  "date",
  "description",
  "type",
  "amount",
  "balance",
  "completed",
];
const hasReorderedColumns = (s: UserData) =>
  eachAccountBudget(s, (i) => {
    if (i.columns.length === 0) return false;
    if (i.columns.length !== DEFAULT_COLUMN_ORDER.length) return true;
    for (let k = 0; k < DEFAULT_COLUMN_ORDER.length; k += 1) {
      if (i.columns[k].type !== DEFAULT_COLUMN_ORDER[k]) return true;
    }
    return false;
  });
const hasPrimaryIncomeSeries = (s: UserData) =>
  Object.values(s.seriesMetadata).some((m) => m.isPrimaryIncome === true);
// A line item ties part of an entry's amount to an owned `Item`. Links
// live inline on user rows (`Row.lineItems`) and on bank-imported
// transactions (`HistoryEntry.lineItems`), so both surfaces are scanned.
const hasLineItem = (s: UserData) =>
  eachRow(s, (r) => Array.isArray(r.lineItems) && r.lineItems.length > 0) ||
  Object.values(s.history).some((arr) =>
    arr.some((e) => Array.isArray(e.lineItems) && e.lineItems.length > 0),
  );
const hasMultipartItem = (s: UserData) =>
  eachAccountBudget(s, (i) => {
    const corrections = i.rows.filter((r) => r.kind === "correction").length;
    return corrections > 0;
  });
// A mortgage has at least one payment recorded — the payoff of the
// "Find mortgage payments" walk (or a hand-entered charge) on any
// property's loan.
const hasMortgagePayment = (s: UserData) =>
  s.properties.some((p) => p.mortgages.some((m) => m.payments.length > 0));
// A mortgage is fully paid off — its payoff "power bar" hit 100%, i.e.
// the balance reached zero against a known loan amount.
const hasFullyPaidMortgage = (s: UserData) =>
  s.properties.some((p) =>
    p.mortgages.some((m) => {
      const progress = mortgagePayoffProgress(m);
      return progress !== null && progress >= 1;
    }),
  );
// A property carries at least one recorded repair / renovation — the user
// bound a tagged bank charge to a property through the wrench view.
const hasRepair = (s: UserData) =>
  s.properties.some((p) => p.repairs.length > 0);

// A repair groups more than one bank transaction — the user gathered several
// charges from one invoice under a single repair (and one shared receipt).
const hasGroupedRepair = (s: UserData) =>
  s.properties.some((p) =>
    p.repairs.some((r) => (r.additionalSources?.length ?? 0) > 0),
  );

// A repair was recorded manually — no backing bank transaction (work older
// than the imported history reaches), so neither source field is set.
const hasManualRepair = (s: UserData) =>
  s.properties.some((p) =>
    p.repairs.some((r) => !(r.accountId && r.sourceHistoryId)),
  );

// A payslip was added manually — no backing bank transaction or budget row,
// so it came from the "Add payslip" form rather than a discovery walk.
const hasManualSalary = (s: UserData) =>
  s.salaries.some((x) => !x.sourceHistoryId && !x.sourceRowId);

// Did the named device bucket's headerAction transition away from the
// default in this `(prev, next)` step? Used by the `shortcut`
// achievement to fire as soon as the user picks a non-`top` action on
// either mobile or desktop. Returns `false` for no-op changes (same
// shape, same target) and for transitions *back* to the default —
// the unlock is "ah, I can change the wordmark click target", not
// "I keep flipping it".
function headerActionMovedAwayFromDefault(
  prev: UserData,
  next: UserData,
  scope: "mobile" | "desktop",
): boolean {
  const p = prev.settings.device[scope].headerAction;
  const n = next.settings.device[scope].headerAction;
  if (p.kind !== n.kind) return n.kind !== "top";
  if (p.kind === "sheet" && n.kind === "sheet") return p.sheetId !== n.sheetId;
  return false;
}

// Did any search-ranking knob change in this `(prev, next)` step? Backs
// the `searchSmith` achievement, which fires the first time the user
// re-tunes the search relevance settings. Compares each field by value
// (not reference) so an unrelated settings save that happens to clone
// the block doesn't count.
function searchRankingChanged(prev: UserData, next: UserData): boolean {
  const p = prev.settings.searchRanking;
  const n = next.settings.searchRanking;
  if (
    p.priority !== n.priority ||
    p.recency !== n.recency ||
    p.amountTolerancePct !== n.amountTolerancePct ||
    p.maxResults !== n.maxResults
  ) {
    return true;
  }
  const pw = p.fieldWeights;
  const nw = n.fieldWeights;
  return (
    pw.description !== nw.description ||
    pw.tag !== nw.tag ||
    pw.company !== nw.company ||
    pw.type !== nw.type ||
    pw.category !== nw.category ||
    pw.bankDescription !== nw.bankDescription
  );
}

// Display strings (name / condition / optional learnMore) live in
// `src/i18n/locales/{en,sv}.ts` under `achievements.catalog.<id>.*`.
// Each entry below references the keys by `id` — the renderer
// composes the lookup at the call site. `hasLearnMore: true` flags
// entries that carry an expanded body (the renderer reads it via
// `achievements.catalog.<id>.learnMore` only when this is set).

export const ACHIEVEMENTS: readonly Achievement[] = [
  // ────────────────────────────────────────────────────────────
  // Beginner — "I just opened the app. What do I do?"
  // ────────────────────────────────────────────────────────────
  {
    id: "firstSteps",
    tier: "beginner",
    glyph: Plus,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.sheets],
      predicate: (prev, next) => !hasAnyUserRow(prev) && hasAnyUserRow(next),
    },
  },
  {
    id: "localHero",
    tier: "beginner",
    glyph: UserPlus,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "label",
    tier: "beginner",
    glyph: Tag,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.sheets],
      predicate: (prev, next) => !hasTypedRow(prev) && hasTypedRow(next),
    },
  },
  {
    id: "checkPlease",
    tier: "beginner",
    glyph: Check,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.sheets],
      predicate: (prev, next) =>
        !hasCompletedRow(prev) && hasCompletedRow(next),
    },
  },
  {
    id: "timeTraveller",
    tier: "beginner",
    glyph: Calendar,
    trigger: { kind: "manual" },
  },
  {
    id: "secondThoughts",
    tier: "beginner",
    glyph: Undo2,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "houseKeeper",
    tier: "beginner",
    glyph: EyeOff,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.hiddenPresetCategoryIds, s.hiddenPresetTypeIds],
      predicate: (prev, next) =>
        !hasHiddenPreset(prev) && hasHiddenPreset(next),
    },
  },
  {
    id: "preparedMind",
    tier: "beginner",
    glyph: Download,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "interiorDesigner",
    tier: "beginner",
    glyph: Palette,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings],
      predicate: (prev, next) =>
        prev.settings.theme === "system" && next.settings.theme !== "system",
    },
  },
  {
    id: "watchful",
    tier: "beginner",
    glyph: Calculator,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.sheets],
      predicate: (prev, next) => !hasBalanceRun(prev) && hasBalanceRun(next),
    },
  },
  {
    id: "trustButVerify",
    tier: "beginner",
    glyph: Save,
    trigger: { kind: "manual" },
  },
  {
    id: "homeScreen",
    tier: "beginner",
    glyph: Smartphone,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "shortcut",
    tier: "beginner",
    glyph: MousePointerClick,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings],
      // `headerAction` is device-scoped in v35 — the user might pick a
      // different shortcut on mobile than on desktop. Either side
      // diverging from the default fires the achievement; checking
      // both buckets means a viewport flip never accidentally
      // re-fires the trigger (the reducer only mutates one bucket
      // per save, so non-edit churn shows up as equality on both).
      predicate: (prev, next) =>
        headerActionMovedAwayFromDefault(prev, next, "mobile") ||
        headerActionMovedAwayFromDefault(prev, next, "desktop"),
    },
  },

  // ────────────────────────────────────────────────────────────
  // Intermediate — "I want this to reflect my real finances."
  // ────────────────────────────────────────────────────────────
  {
    id: "bookKeeper",
    tier: "intermediate",
    glyph: Wallet,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.accounts],
      predicate: (prev, next) => !hasAccount(prev) && hasAccount(next),
    },
  },
  {
    id: "tieTheKnot",
    tier: "intermediate",
    glyph: LinkIcon,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.sheets],
      predicate: (prev, next) => !hasLinkedSheet(prev) && hasLinkedSheet(next),
    },
  },
  {
    id: "payDay",
    tier: "intermediate",
    glyph: CalendarClock,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings],
      predicate: (prev, next) =>
        prev.settings.startOfMonth !== next.settings.startOfMonth,
    },
  },
  {
    id: "spreadOut",
    tier: "intermediate",
    glyph: LayoutDashboard,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.sheets],
      predicate: (prev, next) =>
        !hasMultipleSheetTabs(prev) && hasMultipleSheetTabs(next),
    },
  },
  {
    id: "pinnedFavorite",
    tier: "beginner",
    glyph: Star,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.sheets],
      predicate: (prev, next) =>
        prev.sheets.every((s) => !s.favorite) &&
        next.sheets.some((s) => s.favorite),
    },
  },
  {
    id: "birdsEye",
    tier: "intermediate",
    glyph: LayoutGrid,
    trigger: { kind: "manual" },
  },
  {
    id: "tabShuffler",
    tier: "intermediate",
    glyph: ListOrdered,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "shuffler",
    tier: "intermediate",
    glyph: ArrowRightLeft,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.transfers],
      predicate: (prev, next) => !hasTransfer(prev) && hasTransfer(next),
    },
  },
  {
    id: "quietMover",
    tier: "intermediate",
    glyph: Eye,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.sheets],
      predicate: (prev, next) => !hasTransferRow(prev) && hasTransferRow(next),
    },
  },
  {
    id: "groundhogDay",
    tier: "intermediate",
    glyph: Repeat,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.sheets],
      predicate: (prev, next) =>
        !hasRecurringRow(prev) && hasRecurringRow(next),
    },
  },
  {
    id: "earlyBird",
    tier: "intermediate",
    glyph: CalendarArrowUp,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.seriesMetadata],
      predicate: (prev, next) =>
        !hasPrimaryIncomeSeries(prev) && hasPrimaryIncomeSeries(next),
    },
  },
  {
    id: "showMeTheMoney",
    tier: "intermediate",
    glyph: Banknote,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.salaries],
      predicate: (prev, next) =>
        prev.salaries.length === 0 && next.salaries.length > 0,
    },
  },
  {
    // The user added a payslip by hand — a paycheck older than their imported
    // bank history reaches, recorded from the "Add payslip" form rather than a
    // discovery walk.
    id: "manualPayslip",
    tier: "intermediate",
    glyph: CalendarPlus,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.salaries],
      predicate: (prev, next) =>
        !hasManualSalary(prev) && hasManualSalary(next),
    },
  },
  {
    id: "taxEstimator",
    tier: "intermediate",
    glyph: Calculator,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.taxProfiles],
      predicate: (prev, next) => !hasTaxProfile(prev) && hasTaxProfile(next),
    },
  },
  {
    id: "homeOwner",
    tier: "intermediate",
    glyph: Home,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.properties],
      predicate: (prev, next) =>
        prev.properties.length === 0 && next.properties.length > 0,
    },
  },
  {
    id: "secondDraft",
    tier: "intermediate",
    glyph: Pencil,
    trigger: { kind: "manual" },
  },
  {
    id: "taxonomist",
    tier: "intermediate",
    glyph: FolderTree,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.categories],
      predicate: (prev, next) =>
        !hasUserCategory(prev) && hasUserCategory(next),
    },
  },
  {
    id: "labelMaker",
    tier: "intermediate",
    glyph: ArrowUpDown,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.types],
      predicate: (prev, next) => !hasUserType(prev) && hasUserType(next),
    },
  },
  {
    id: "tagger",
    tier: "intermediate",
    glyph: Bookmark,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.sheets],
      predicate: (prev, next) => !hasTaggedRow(prev) && hasTaggedRow(next),
    },
  },
  {
    id: "companies",
    tier: "intermediate",
    glyph: Building2,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.companies],
      predicate: (prev, next) => !hasCompany(prev) && hasCompany(next),
    },
  },
  {
    id: "moverShaker",
    tier: "intermediate",
    glyph: Move,
    trigger: { kind: "manual" },
  },
  {
    id: "splitTheBill",
    tier: "intermediate",
    glyph: Split,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "estimateRange",
    tier: "intermediate",
    glyph: Ruler,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.sheets],
      predicate: (prev, next) => !hasEstimateRow(prev) && hasEstimateRow(next),
    },
  },
  {
    id: "bulkOps",
    tier: "intermediate",
    glyph: ListChecks,
    trigger: { kind: "manual" },
  },
  {
    id: "reckoner",
    tier: "intermediate",
    glyph: Scale,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.sheets],
      predicate: (prev, next) => !hasCorrection(prev) && hasCorrection(next),
    },
  },
  {
    id: "detective",
    tier: "intermediate",
    glyph: Search,
    trigger: { kind: "manual" },
  },
  {
    id: "numberWhisperer",
    tier: "intermediate",
    glyph: Hash,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings],
      predicate: (prev, next) =>
        prev.settings.decimalSeparator !== next.settings.decimalSeparator ||
        prev.settings.thousandsSeparator !== next.settings.thousandsSeparator ||
        prev.settings.currency !== next.settings.currency ||
        prev.settings.currencyPosition !== next.settings.currencyPosition ||
        // `abbreviateNumbers` is device-scoped in v35; either bucket
        // toggling counts as the user fiddling with number display.
        prev.settings.device.mobile.abbreviateNumbers !==
          next.settings.device.mobile.abbreviateNumbers ||
        prev.settings.device.desktop.abbreviateNumbers !==
          next.settings.device.desktop.abbreviateNumbers,
    },
  },
  {
    id: "rearranger",
    tier: "intermediate",
    glyph: Columns3,
    trigger: {
      kind: "derived",
      slices: (s) => [s.sheets],
      predicate: (prev, next) =>
        !hasReorderedColumns(prev) && hasReorderedColumns(next),
    },
  },
  {
    id: "polyglot",
    tier: "intermediate",
    glyph: BookOpen,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings],
      predicate: (prev, next) =>
        prev.settings.language !== next.settings.language,
    },
  },
  {
    id: "tidyAndQuiet",
    tier: "intermediate",
    glyph: EyeOff,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings],
      predicate: (prev, next) =>
        !prev.settings.hideTransfers && next.settings.hideTransfers,
    },
  },
  {
    id: "swiper",
    tier: "intermediate",
    glyph: Share2,
    trigger: { kind: "manual" },
  },

  // ────────────────────────────────────────────────────────────
  // Pro — "Stop typing things the bank already knows."
  // ────────────────────────────────────────────────────────────
  {
    id: "searchSmith",
    tier: "pro",
    glyph: SlidersHorizontal,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings],
      predicate: searchRankingChanged,
    },
  },
  {
    id: "importExport",
    tier: "pro",
    glyph: FileUp,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.historyImports],
      predicate: (prev, next) =>
        !hasHistoryImport(prev) && hasHistoryImport(next),
    },
  },
  {
    id: "dedupe",
    tier: "pro",
    glyph: CopyCheck,
    trigger: { kind: "manual" },
  },
  {
    id: "loanRanger",
    tier: "pro",
    glyph: Landmark,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.properties],
      predicate: (prev, next) =>
        !hasMortgagePayment(prev) && hasMortgagePayment(next),
    },
  },
  {
    id: "mortgageFree",
    tier: "pro",
    glyph: KeyRound,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.properties],
      predicate: (prev, next) =>
        !hasFullyPaidMortgage(prev) && hasFullyPaidMortgage(next),
    },
  },
  {
    // Fired from the payments view when the user edits or removes a
    // recorded payment — a manual unlock because an in-place edit can't
    // be spotted from a derived state slice.
    id: "paymentLedger",
    tier: "pro",
    glyph: ReceiptText,
    trigger: { kind: "manual" },
  },
  {
    // The user bound the first tagged Repairs / Renovations charge to a
    // property through the wrench view — the start of a deductible-cost
    // record for a future net-value calculation.
    id: "firstRepair",
    tier: "pro",
    glyph: Wrench,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.properties],
      predicate: (prev, next) => !hasRepair(prev) && hasRepair(next),
    },
  },
  {
    // The user grouped more than one bank transaction under a single repair —
    // an invoice paid across several charges, recorded as one deductible cost
    // with one shared receipt.
    id: "groupedRepair",
    tier: "pro",
    glyph: Layers,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.properties],
      predicate: (prev, next) =>
        !hasGroupedRepair(prev) && hasGroupedRepair(next),
    },
  },
  {
    // The user recorded a repair / renovation by hand — work older than their
    // imported bank history reaches, entered directly rather than sourced from
    // a tagged charge.
    id: "manualRepair",
    tier: "pro",
    glyph: Hammer,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.properties],
      predicate: (prev, next) =>
        !hasManualRepair(prev) && hasManualRepair(next),
    },
  },
  {
    // The user opened the Net sale profit estimator on a property to model
    // a sale's proceeds after broker, advertising, repairs, and
    // capital-gains tax. A manual unlock — opening a read-only modal can't
    // be spotted from a derived state slice.
    id: "netSaleProfit",
    tier: "pro",
    glyph: Calculator,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "archaeologist",
    tier: "pro",
    glyph: History,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.history],
      predicate: (prev, next) =>
        !hasUserHistoryOverride(prev) && hasUserHistoryOverride(next),
    },
  },
  {
    id: "patternRecognition",
    tier: "pro",
    glyph: Wand2,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.matchRules],
      predicate: (prev, next) => !hasMatchRule(prev) && hasMatchRule(next),
    },
  },
  {
    id: "elephantsRemember",
    tier: "pro",
    glyph: Brain,
    trigger: {
      kind: "derived",
      slices: (s) => [s.merchantHints],
      predicate: (prev, next) =>
        !hasMerchantHint(prev) && hasMerchantHint(next),
    },
  },
  {
    id: "matchmaker",
    tier: "pro",
    glyph: GitMerge,
    trigger: {
      kind: "derived",
      slices: (s) => [s.seriesMatchRules],
      predicate: (prev, next) =>
        !hasSeriesMatchRule(prev) && hasSeriesMatchRule(next),
    },
  },
  {
    id: "twoSidedCoin",
    tier: "pro",
    glyph: Merge,
    trigger: {
      kind: "derived",
      slices: (s) => [s.history],
      predicate: (prev, next) =>
        !hasCollapsedTransferPair(prev) && hasCollapsedTransferPair(next),
    },
  },
  {
    id: "doppelganger",
    tier: "pro",
    glyph: Combine,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "cleanSplit",
    tier: "pro",
    glyph: Split,
    trigger: {
      kind: "derived",
      slices: (s) => [s.history],
      predicate: (prev, next) =>
        !hasSplitHistoryEntry(prev) && hasSplitHistoryEntry(next),
    },
  },
  {
    id: "cloudWalker",
    tier: "pro",
    glyph: Cloud,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "paranoidMode",
    tier: "pro",
    glyph: Lock,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "snapshotter",
    tier: "pro",
    glyph: Archive,
    trigger: { kind: "manual" },
  },
  {
    id: "airplaneMode",
    tier: "pro",
    glyph: WifiOff,
    trigger: { kind: "manual" },
  },
  {
    id: "rekindled",
    tier: "pro",
    glyph: RefreshCw,
    trigger: { kind: "manual" },
  },
  {
    id: "lockUp",
    tier: "pro",
    glyph: LockKeyhole,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings],
      predicate: (prev, next) =>
        prev.settings.sessionTimeoutMinutes !==
        next.settings.sessionTimeoutMinutes,
    },
  },
  {
    id: "spreadsheetSensei",
    tier: "pro",
    glyph: FileSpreadsheet,
    trigger: { kind: "manual" },
  },
  {
    id: "sealedEnvelope",
    tier: "pro",
    glyph: FileLock2,
    trigger: { kind: "manual" },
  },
  {
    id: "timeMachine",
    tier: "pro",
    glyph: History,
    trigger: { kind: "manual" },
  },
  {
    id: "freshPull",
    tier: "pro",
    glyph: RefreshCw,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "receiptKeeper",
    tier: "pro",
    glyph: Receipt,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "payslipKeeper",
    tier: "pro",
    glyph: FileText,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },

  // ────────────────────────────────────────────────────────────
  // Expert — "Bend the app to my exact situation."
  // ────────────────────────────────────────────────────────────
  {
    id: "spellbinder",
    tier: "expert",
    glyph: Sigma,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.sheets],
      predicate: (prev, next) => !hasFormulaRow(prev) && hasFormulaRow(next),
    },
  },
  {
    id: "variablesUnleashed",
    tier: "expert",
    glyph: FunctionSquare,
    trigger: { kind: "manual" },
  },
  {
    id: "crossWired",
    tier: "expert",
    glyph: Network,
    trigger: {
      kind: "derived",
      slices: (s) => [s.sheets],
      predicate: (prev, next) =>
        !hasCrossSheetFormula(prev) && hasCrossSheetFormula(next),
    },
  },
  {
    id: "compoundInterest",
    tier: "expert",
    glyph: Sigma,
    trigger: { kind: "manual" },
  },
  {
    id: "calendarBender",
    tier: "expert",
    glyph: CalendarCog,
    trigger: { kind: "manual" },
  },
  {
    id: "dateShifter",
    tier: "expert",
    glyph: CalendarClock,
    trigger: { kind: "manual" },
  },
  {
    id: "fineSieve",
    tier: "expert",
    glyph: Filter,
    trigger: {
      kind: "derived",
      slices: (s) => [s.matchRules],
      predicate: (prev, next) =>
        !hasFilteredMatchRule(prev) && hasFilteredMatchRule(next),
    },
  },
  {
    id: "themeWizard",
    tier: "expert",
    glyph: Palette,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings],
      predicate: (prev, next) =>
        prev.settings.theme !== "custom" && next.settings.theme === "custom",
    },
  },
  {
    id: "fontFanatic",
    tier: "expert",
    glyph: TypeIcon,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings],
      predicate: (prev, next) =>
        prev.settings.fontFamily !== next.settings.fontFamily,
    },
  },
  {
    id: "stillness",
    tier: "expert",
    glyph: Accessibility,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings],
      predicate: (prev, next) =>
        !prev.settings.customTheme.reduceMotion &&
        next.settings.customTheme.reduceMotion,
    },
  },
  {
    id: "household",
    tier: "expert",
    glyph: Users,
    trigger: { kind: "manual" },
  },
  {
    id: "shapeShifter",
    tier: "expert",
    glyph: ArrowLeftRight,
    trigger: { kind: "manual" },
  },
  {
    id: "underTheHood",
    tier: "expert",
    glyph: Code2,
    trigger: { kind: "manual" },
  },
  {
    id: "tidyMind",
    tier: "expert",
    glyph: ChevronsDownUp,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "itemized",
    tier: "expert",
    glyph: Boxes,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.sheets, s.history],
      predicate: (prev, next) => !hasLineItem(prev) && hasLineItem(next),
    },
  },
  {
    id: "completionist",
    tier: "expert",
    glyph: Wand2,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings.achievements],
      predicate: (prev, next) => {
        // Avoid self-reference (the watcher hands us the unlock-derived
        // state) by counting against the catalog length minus one (for
        // this entry itself).
        const totalOthers = ACHIEVEMENTS.length - 1;
        const prevCount = Object.keys(prev.settings.achievements).length;
        const nextCount = Object.keys(next.settings.achievements).length;
        return prevCount < totalOthers && nextCount >= totalOthers;
      },
    },
  },

  // Unused-row guard: `hasMultipartItem` exists for a future
  // multi-account roll-up achievement but isn't wired to one yet.
  // Reference it here so the tree-shaker doesn't drop the helper
  // when a later pass needs it.
] as const;

// Catalog lookup by id. The watcher hands us new ids from the bus
// and from `deriveUnlocks`; both consult this map to skip ids that
// somehow don't match a known catalog entry (forward compatibility
// for older builds reading newer data, or for typo-guarding manual
// `unlock` callers).
export const ACHIEVEMENT_BY_ID: ReadonlyMap<string, Achievement> = new Map(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

// Internal: silence the linter for the multipart helper, which is
// kept around for symmetry with the other inspectors and for the
// next achievement to land on it. Returning the function value via
// a no-op assignment keeps it from being treeshaken in dev builds.
const _multipartUsed = hasMultipartItem;
void _multipartUsed;
