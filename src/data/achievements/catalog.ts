import {
  Accessibility,
  Archive,
  ArrowLeftRight,
  ArrowRightLeft,
  ArrowUpDown,
  BarChart3,
  BookOpen,
  Brain,
  Calculator,
  Calendar,
  CalendarClock,
  CalendarCog,
  Check,
  Cloud,
  Code2,
  Columns3,
  CopyCheck,
  Download,
  Eye,
  EyeOff,
  FileLock2,
  FileSpreadsheet,
  FileUp,
  Filter,
  FolderTree,
  FunctionSquare,
  GitMerge,
  Hash,
  History,
  LayoutDashboard,
  LayoutGrid,
  Link as LinkIcon,
  ListChecks,
  Lock,
  LockKeyhole,
  Merge,
  MousePointerClick,
  Move,
  Network,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Save,
  Scale,
  Search,
  Share2,
  Sigma,
  Smartphone,
  Split,
  Tag,
  Trash2,
  Type as TypeIcon,
  Undo2,
  UserPlus,
  Users,
  Wallet,
  Wand2,
  WifiOff,
} from "lucide-react";

import type { Row, SheetItem, UserData } from "../types";
import type { Achievement } from "./types";

// Pure predicate helpers used by the catalog. Each takes a UserData
// snapshot and returns a boolean; "first time" achievements then
// derive as `!hasX(prev) && hasX(next)` in their trigger predicate
// below. Kept inline so the catalog is the single file an agent
// reads when adding a new entry — same source of truth as the
// achievements modal itself.

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

function eachRow(state: UserData, fn: (row: Row) => boolean): boolean {
  return eachAccountBudget(state, (item) => item.rows.some(fn));
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
const hasCorrection = (s: UserData) =>
  eachRow(s, (r) => r.isCorrection === true);
const hasTransferRow = (s: UserData) =>
  eachRow(s, (r) => r.isTransfer === true);
const hasTypedRow = (s: UserData) =>
  eachRow(s, (r) => typeof r.typeId === "string" && r.typeId !== "");
const hasMultipleSheetTabs = (s: UserData) => s.sheets.length > 1;
const hasAccount = (s: UserData) => s.accounts.length > 0;
const hasLinkedSheet = (s: UserData) =>
  eachAccountBudget(
    s,
    (i) => typeof i.accountId === "string" && i.accountId !== "",
  );
const hasTransaction = (s: UserData) => s.transactions.length > 0;
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
    arr.some((e) => typeof e.collapsedIntoTransactionId === "string"),
  );
const hasUserHistoryOverride = (s: UserData) =>
  Object.values(s.history).some((arr) =>
    arr.some(
      (e) =>
        typeof e.userTypeId === "string" ||
        (typeof e.userDescription === "string" && e.userDescription !== ""),
    ),
  );
const hasReorderedColumns = (s: UserData) =>
  eachAccountBudget(
    s,
    (i) =>
      i.columns.length > 0 &&
      // Default column order is date / description / amount / balance /
      // completed. Anything else is a user reorder.
      JSON.stringify(i.columns.map((c) => c.type)) !==
        JSON.stringify([
          "date",
          "description",
          "type",
          "amount",
          "balance",
          "completed",
        ]),
  );
const hasMultipartItem = (s: UserData) =>
  eachAccountBudget(s, (i) => {
    const corrections = i.rows.filter((r) => r.isCorrection).length;
    return corrections > 0;
  });

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
      predicate: (prev, next) =>
        prev.settings.theme === "system" && next.settings.theme !== "system",
    },
  },
  {
    id: "watchful",
    tier: "beginner",
    glyph: Calculator,
    hasLearnMore: true,
    trigger: { kind: "manual" },
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
      predicate: (prev, next) =>
        !hasMultipleSheetTabs(prev) && hasMultipleSheetTabs(next),
    },
  },
  {
    id: "birdsEye",
    tier: "intermediate",
    glyph: LayoutGrid,
    trigger: { kind: "manual" },
  },
  {
    id: "shuffler",
    tier: "intermediate",
    glyph: ArrowRightLeft,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      predicate: (prev, next) => !hasTransaction(prev) && hasTransaction(next),
    },
  },
  {
    id: "quietMover",
    tier: "intermediate",
    glyph: Eye,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
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
      predicate: (prev, next) =>
        !hasRecurringRow(prev) && hasRecurringRow(next),
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
      predicate: (prev, next) => !hasUserType(prev) && hasUserType(next),
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
    id: "importExport",
    tier: "pro",
    glyph: FileUp,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
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
    id: "archaeologist",
    tier: "pro",
    glyph: History,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
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
      predicate: (prev, next) => !hasMatchRule(prev) && hasMatchRule(next),
    },
  },
  {
    id: "elephantsRemember",
    tier: "pro",
    glyph: Brain,
    trigger: {
      kind: "derived",
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
      predicate: (prev, next) =>
        !hasCollapsedTransferPair(prev) && hasCollapsedTransferPair(next),
    },
  },
  {
    id: "cleanSplit",
    tier: "pro",
    glyph: Split,
    trigger: {
      kind: "derived",
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
    trigger: { kind: "manual" },
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
    id: "auditor",
    tier: "expert",
    glyph: BarChart3,
    trigger: { kind: "manual" },
  },
  {
    id: "fineSieve",
    tier: "expert",
    glyph: Filter,
    trigger: { kind: "manual" },
  },
  {
    id: "themeWizard",
    tier: "expert",
    glyph: Palette,
    trigger: {
      kind: "derived",
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
    id: "cleanSlate",
    tier: "expert",
    glyph: Trash2,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "completionist",
    tier: "expert",
    glyph: Wand2,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
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
