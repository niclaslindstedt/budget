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
  Sigma,
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
// achievements page itself.

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

// Settings-flip predicates. Each derives a "first time the user
// changed X" by comparing prev.settings to next.settings inside the
// trigger predicate, so they're defined on the achievement entry
// itself rather than here.

export const ACHIEVEMENTS: readonly Achievement[] = [
  // ────────────────────────────────────────────────────────────
  // Beginner — "I just opened the app. What do I do?"
  // ────────────────────────────────────────────────────────────
  {
    id: "firstSteps",
    tier: "beginner",
    glyph: Plus,
    name: "First Steps",
    condition: "Add your first row.",
    learnMore:
      "Click the bottom row of the sheet, type a description, tab through to amount and date. That's a budget entry — the core loop.",
    trigger: {
      kind: "derived",
      predicate: (prev, next) => !hasAnyUserRow(prev) && hasAnyUserRow(next),
    },
  },
  {
    id: "localHero",
    tier: "beginner",
    glyph: UserPlus,
    name: "Local Hero",
    condition: "Use the app as a guest, or create an account.",
    learnMore:
      "Guest mode keeps your data in this browser only, unencrypted. An account adds a password that encrypts the data on this device — it never leaves your machine.",
    trigger: { kind: "manual" },
  },
  {
    id: "label",
    tier: "beginner",
    glyph: Tag,
    name: "Label It",
    condition: "Assign a type to a row.",
    learnMore:
      "The type chip groups rows for analysis. Browse by category — the starter set covers Swedish-flavoured basics.",
    trigger: {
      kind: "derived",
      predicate: (prev, next) => !hasTypedRow(prev) && hasTypedRow(next),
    },
  },
  {
    id: "checkPlease",
    tier: "beginner",
    glyph: Check,
    name: "Check, Please",
    condition: "Tick a row's completed checkbox.",
    learnMore:
      "Unticked = forecast, ticked = real. The app uses this when reconciling against bank imports later.",
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
    name: "Time Traveller",
    condition: "Discover the Today pill by scrolling away from this month.",
    trigger: { kind: "manual" },
  },
  {
    id: "secondThoughts",
    tier: "beginner",
    glyph: Undo2,
    name: "Second Thoughts",
    condition: "Undo an action.",
    learnMore:
      "⌘Z walks back the last action. Every cell edit, every row delete, every settings change is reversible — undo is the safety net.",
    trigger: { kind: "manual" },
  },
  {
    id: "houseKeeper",
    tier: "beginner",
    glyph: EyeOff,
    name: "House Keeper",
    condition: "Hide a preset category or type you'll never use.",
    learnMore:
      "Hiding is safer than deleting until you know what you want. Anything hidden can be brought back from the same screen.",
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
    name: "Prepared Mind",
    condition: "Export your budget to a JSON file.",
    learnMore:
      "A snapshot you can drop back in later via Import. Do this once early so you know how.",
    trigger: { kind: "manual" },
  },
  {
    id: "interiorDesigner",
    tier: "beginner",
    glyph: Palette,
    name: "Interior Designer",
    condition: "Switch the theme to something other than the default.",
    learnMore:
      "Themes include One Dark, One Light, Dracula, GitHub Dark, and GitHub Light. The Custom-theme tokens in Expert tier stack on top.",
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
    name: "Watchful",
    condition: "Watch the balance build itself for the first time.",
    learnMore:
      "The Balance column is the running total of every row above it. You never type into it — it computes from the rows.",
    trigger: { kind: "manual" },
  },
  {
    id: "trustButVerify",
    tier: "beginner",
    glyph: Save,
    name: "Trust, But Verify",
    condition: "Notice the save-state indicator confirming a save.",
    trigger: { kind: "manual" },
  },

  // ────────────────────────────────────────────────────────────
  // Intermediate — "I want this to reflect my real finances."
  // ────────────────────────────────────────────────────────────
  {
    id: "bookKeeper",
    tier: "intermediate",
    glyph: Wallet,
    name: "Book Keeper",
    condition: "Create your first real account.",
    learnMore:
      "Optionally attach bank details (clearing, account number, IBAN). The next tier — bank import — uses them to pair rows automatically.",
    trigger: {
      kind: "derived",
      predicate: (prev, next) => !hasAccount(prev) && hasAccount(next),
    },
  },
  {
    id: "tieTheKnot",
    tier: "intermediate",
    glyph: LinkIcon,
    name: "Tie the Knot",
    condition: "Link a sheet to an account.",
    learnMore:
      "Once linked, the sheet's running balance mirrors the real balance and bank imports land in the right place.",
    trigger: {
      kind: "derived",
      predicate: (prev, next) => !hasLinkedSheet(prev) && hasLinkedSheet(next),
    },
  },
  {
    id: "payDay",
    tier: "intermediate",
    glyph: CalendarClock,
    name: "Pay Day",
    condition: "Change Start of month from the default.",
    learnMore:
      "If salary lands on the 25th, set 25 — every month then runs 25th-to-24th instead of calendar-first.",
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
    name: "Spread Out",
    condition: "Add more than one sheet.",
    learnMore:
      "One sheet per account, one per goal. Tabs at the top switch between them.",
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
    name: "Bird's Eye",
    condition: "Visit the Accounts overview.",
    trigger: { kind: "manual" },
  },
  {
    id: "shuffler",
    tier: "intermediate",
    glyph: ArrowRightLeft,
    name: "Shuffler",
    condition: "Record an inter-account transaction.",
    learnMore:
      "One row, two effects: debits one account and credits the other on the same date. No need to type the two halves.",
    trigger: {
      kind: "derived",
      predicate: (prev, next) => !hasTransaction(prev) && hasTransaction(next),
    },
  },
  {
    id: "quietMover",
    tier: "intermediate",
    glyph: Eye,
    name: "Quiet Mover",
    condition: "Flag a row as a transfer.",
    learnMore:
      "Combined with Hide transfers, internal moves still affect balances but disappear from the expense totals.",
    trigger: {
      kind: "derived",
      predicate: (prev, next) => !hasTransferRow(prev) && hasTransferRow(next),
    },
  },
  {
    id: "groundhogDay",
    tier: "intermediate",
    glyph: Repeat,
    name: "Groundhog Day",
    condition: "Make a row recurring.",
    learnMore:
      "Salary, rent, Spotify, gym. The preview shows the next ten occurrences before you save so you can sanity-check the pattern.",
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
    name: "Second Draft",
    condition: "Edit a recurring series.",
    trigger: { kind: "manual" },
  },
  {
    id: "taxonomist",
    tier: "intermediate",
    glyph: FolderTree,
    name: "Taxonomist",
    condition: "Create your own category.",
    learnMore:
      "Categories group expenses for analysis. Give each a glyph and a color — the shared 16-hue palette is consistent across the app.",
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
    name: "Label Maker",
    condition: "Create your own entry type.",
    learnMore:
      "Types are the labels you assign to rows. Each has a glyph, color, and direction (+, −, ◆) so the picker stays clean.",
    trigger: {
      kind: "derived",
      predicate: (prev, next) => !hasUserType(prev) && hasUserType(next),
    },
  },
  {
    id: "moverShaker",
    tier: "intermediate",
    glyph: Move,
    name: "Mover & Shaker",
    condition: "Move or copy rows across months.",
    trigger: { kind: "manual" },
  },
  {
    id: "splitTheBill",
    tier: "intermediate",
    glyph: Split,
    name: "Split the Bill",
    condition: "Split a row into multiple parts.",
    learnMore:
      "When a single bank charge bundles different categories (groceries + household + gift), split so each part gets its own type.",
    trigger: { kind: "manual" },
  },
  {
    id: "bulkOps",
    tier: "intermediate",
    glyph: ListChecks,
    name: "Bulk Ops",
    condition: "Bulk-edit two or more rows in one action.",
    trigger: { kind: "manual" },
  },
  {
    id: "reckoner",
    tier: "intermediate",
    glyph: Scale,
    name: "Reckoner",
    condition: "Record a balance correction.",
    learnMore:
      "When the running total drifts from what the bank shows, Set balance writes a single correction row dated today. Honest fix; don't rewrite old history.",
    trigger: {
      kind: "derived",
      predicate: (prev, next) => !hasCorrection(prev) && hasCorrection(next),
    },
  },
  {
    id: "detective",
    tier: "intermediate",
    glyph: Search,
    name: "Detective",
    condition: "Search across every sheet.",
    trigger: { kind: "manual" },
  },
  {
    id: "numberWhisperer",
    tier: "intermediate",
    glyph: Hash,
    name: "Number Whisperer",
    condition: "Customise the number or currency format.",
    trigger: {
      kind: "derived",
      predicate: (prev, next) =>
        prev.settings.decimalSeparator !== next.settings.decimalSeparator ||
        prev.settings.thousandsSeparator !== next.settings.thousandsSeparator ||
        prev.settings.currency !== next.settings.currency ||
        prev.settings.currencyPosition !== next.settings.currencyPosition ||
        prev.settings.abbreviateNumbers !== next.settings.abbreviateNumbers,
    },
  },
  {
    id: "rearranger",
    tier: "intermediate",
    glyph: Columns3,
    name: "Rearranger",
    condition: "Reorder the columns in a sheet.",
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
    name: "Polyglot",
    condition: "Switch the app language.",
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
    name: "Tidy & Quiet",
    condition: "Turn on Hide transfers.",
    trigger: {
      kind: "derived",
      predicate: (prev, next) =>
        !prev.settings.hideTransfers && next.settings.hideTransfers,
    },
  },

  // ────────────────────────────────────────────────────────────
  // Pro — "Stop typing things the bank already knows."
  // ────────────────────────────────────────────────────────────
  {
    id: "importExport",
    tier: "pro",
    glyph: FileUp,
    name: "Import / Export",
    condition: "Import your first bank statement.",
    learnMore:
      "The app auto-detects Skandiabanken, Swedbank, Bank Norwegian, or ICA Banken. Drop the .xlsx or .csv from your bank and pick the account.",
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
    name: "Dedupe",
    condition: "Re-import a statement; the importer skips the duplicates.",
    trigger: { kind: "manual" },
  },
  {
    id: "archaeologist",
    tier: "pro",
    glyph: History,
    name: "Archaeologist",
    condition: "Override an imported history entry's description or type.",
    learnMore:
      "Open the history view, click a row, change its label. Useful when a noisy merchant has a useful name buried in the bank text.",
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
    name: "Pattern Recognition",
    condition: "Write your first match rule.",
    learnMore:
      "*App Store* → type 'App'. Every past and future App Store charge labels itself. Rules can also filter by amount range or transfer flag.",
    trigger: {
      kind: "derived",
      predicate: (prev, next) => !hasMatchRule(prev) && hasMatchRule(next),
    },
  },
  {
    id: "elephantsRemember",
    tier: "pro",
    glyph: Brain,
    name: "Elephants Remember",
    condition: "Promote a merchant — the type sticks for next time.",
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
    name: "Matchmaker",
    condition: "Reconcile a series — the rule sticks for next month.",
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
    name: "Two-Sided Coin",
    condition: "Collapse a mirror pair into a single transfer.",
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
    name: "Clean Split",
    condition: "Split a bank-history entry across multiple types.",
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
    name: "Cloud Walker",
    condition: "Connect a cloud backend (Dropbox, Google Drive, or Folder).",
    learnMore:
      "Browser-only data lives on this device. Connect a cloud and your budget rides with you across devices.",
    trigger: { kind: "manual" },
  },
  {
    id: "paranoidMode",
    tier: "pro",
    glyph: Lock,
    name: "Paranoid Mode",
    condition: "Turn on end-to-end encryption.",
    learnMore:
      "AES-GCM, 256-bit key, 600 000 PBKDF2 iterations. The cloud sees ciphertext only.",
    trigger: { kind: "manual" },
  },
  {
    id: "snapshotter",
    tier: "pro",
    glyph: Archive,
    name: "Snapshotter",
    condition: "Restore a cloud backup.",
    trigger: { kind: "manual" },
  },
  {
    id: "airplaneMode",
    tier: "pro",
    glyph: WifiOff,
    name: "Airplane Mode",
    condition: "Edit offline; the app reconnects gracefully.",
    trigger: { kind: "manual" },
  },
  {
    id: "rekindled",
    tier: "pro",
    glyph: RefreshCw,
    name: "Rekindled",
    condition: "Re-authorize a cloud backend.",
    trigger: { kind: "manual" },
  },
  {
    id: "lockUp",
    tier: "pro",
    glyph: LockKeyhole,
    name: "Lock Up",
    condition: "Change the idle sign-out timeout.",
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
    name: "Spreadsheet Sensei",
    condition: "Export a sheet to CSV or Excel.",
    trigger: { kind: "manual" },
  },
  {
    id: "sealedEnvelope",
    tier: "pro",
    glyph: FileLock2,
    name: "Sealed Envelope",
    condition: "Export your budget as encrypted JSON.",
    trigger: { kind: "manual" },
  },
  {
    id: "timeMachine",
    tier: "pro",
    glyph: History,
    name: "Time Machine",
    condition: "Jump to a point in the action history.",
    trigger: { kind: "manual" },
  },

  // ────────────────────────────────────────────────────────────
  // Expert — "Bend the app to my exact situation."
  // ────────────────────────────────────────────────────────────
  {
    id: "spellbinder",
    tier: "expert",
    glyph: Sigma,
    name: "Spellbinder",
    condition: "Write your first amount formula.",
    learnMore:
      "Type = and write an expression. salary * 0.05 saves 5% of income; min(rent, 12000) caps a transfer. The formula recomputes when inputs change.",
    trigger: {
      kind: "derived",
      predicate: (prev, next) => !hasFormulaRow(prev) && hasFormulaRow(next),
    },
  },
  {
    id: "variablesUnleashed",
    tier: "expert",
    glyph: FunctionSquare,
    name: "Variables Unleashed",
    condition: "Insert a variable pill from the formula helper.",
    trigger: { kind: "manual" },
  },
  {
    id: "crossWired",
    tier: "expert",
    glyph: Network,
    name: "Cross-Wired",
    condition: "Reference another sheet inside a formula.",
    trigger: { kind: "manual" },
  },
  {
    id: "compoundInterest",
    tier: "expert",
    glyph: Sigma,
    name: "Compound Interest",
    condition: "Build a compound entry with multiple parts.",
    trigger: { kind: "manual" },
  },
  {
    id: "calendarBender",
    tier: "expert",
    glyph: CalendarCog,
    name: "Calendar Bender",
    condition: "Use last-day-of-month or a custom recurrence interval.",
    trigger: { kind: "manual" },
  },
  {
    id: "auditor",
    tier: "expert",
    glyph: BarChart3,
    name: "Auditor",
    condition: "Read the coverage report.",
    trigger: { kind: "manual" },
  },
  {
    id: "fineSieve",
    tier: "expert",
    glyph: Filter,
    name: "Fine Sieve",
    condition: "Write a match rule with amount or transfer filters.",
    trigger: { kind: "manual" },
  },
  {
    id: "themeWizard",
    tier: "expert",
    glyph: Palette,
    name: "Theme Wizard",
    condition: "Switch to the Custom theme.",
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
    name: "Font Fanatic",
    condition: "Swap the font family.",
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
    name: "Stillness",
    condition: "Turn on Reduce motion.",
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
    name: "Household",
    condition: "Add another user account on this device.",
    trigger: { kind: "manual" },
  },
  {
    id: "shapeShifter",
    tier: "expert",
    glyph: ArrowLeftRight,
    name: "Shape Shifter",
    condition: "Switch storage backends.",
    trigger: { kind: "manual" },
  },
  {
    id: "underTheHood",
    tier: "expert",
    glyph: Code2,
    name: "Under the Hood",
    condition: "Turn on Developer mode.",
    trigger: { kind: "manual" },
  },
  {
    id: "cleanSlate",
    tier: "expert",
    glyph: Trash2,
    name: "Clean Slate",
    condition: "Reset your achievements.",
    learnMore:
      "An Easter egg: clear your unlocks from the achievements page to start the journey again. The data stays, only the trophies reset.",
    trigger: { kind: "manual" },
  },
  {
    id: "completionist",
    tier: "expert",
    glyph: Wand2,
    name: "Completionist",
    condition: "Unlock every other achievement.",
    learnMore:
      "The hardest one to earn — your trophy room is full when this one lights up.",
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
