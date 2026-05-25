export type ColumnType =
  | "date"
  | "description"
  | "type"
  | "amount"
  | "balance"
  | "completed";

export type CellValue = string | number | boolean | null;

export type Column = {
  id: string;
  type: ColumnType;
  label: string;
};

export type Row = {
  id: string;
  cells: Record<string, CellValue>;
  // Optional grouping id shared by every row generated from the same
  // recurrence. Used to scope "edit / delete all future" operations and
  // is undefined for one-off rows added inline.
  seriesId?: string;
  // Optional reference to a reusable `EntryType` in `UserData.types`.
  // The dedicated `type` column renders the type's glyph (mobile) or
  // glyph + name chip (desktop) in the type's colour; the description
  // column stays untouched so the row reads as "description + type"
  // rather than mixing the two. Replaces the older `glyph` field —
  // types subsume that role with a name and colour attached, which
  // makes them usable for grouping and stats.
  typeId?: string;
  // True when this row was minted by the "update balance" flow on the
  // Accounts page: its amount is the delta needed to bring the account's
  // running total to a user-asserted value. Rendered as a full-width
  // divider line ("——— balance correction ±X ———") in place of the
  // normal columned row, and excluded from bulk-edit selection. The
  // running balance reads `amount` like any other row, so the correction
  // shifts the total without further special casing.
  isCorrection?: boolean;
  // Runtime-only markers populated by `synthesizeTransactionRow` when a
  // Transaction is interleaved into a budget view. Never persisted —
  // synthesized rows live outside `item.rows` (the budget view merges
  // them in at render time), and the validator/schema do not list
  // these fields. The cell renderer reads them to disable inline
  // editing, swap the row glyph, and offer the transaction-edit modal
  // in place of the usual delete/recurring actions.
  transactionId?: string;
  peerAccountId?: string;
  peerAccountName?: string;
  // Runtime-only marker populated by `synthesizeHistoryRow` when an
  // imported bank-statement entry is projected into a budget view.
  // Like the transaction markers, this is never persisted — history
  // rows live in `UserData.history`, not in `item.rows`. The cell
  // renderer reads it to disable inline editing and surface a
  // "promote to recurring" action in place of the usual edit dialog.
  historyEntryId?: string;
  // Optional dynamic amount: a small formula string whose evaluation
  // produces this row's effective amount at render time. When set, it
  // overrides the numeric value in `cells[amountColumnId]` (which is
  // still written as a best-effort preview cache). Stored in the
  // canonical id-keyed form — any `sheet("…")` reference holds the
  // target sheet's id, not its mutable display name, so renames don't
  // break formulas. The amount column becomes read-only for rows that
  // carry a formula; editing flows through the ComplexEntryModal.
  // Evaluation order is "literal rows first, then formula rows in the
  // order they appear in `item.rows`"; a row's own contribution is
  // excluded from its own variables to avoid self-reference.
  amountFormula?: string;
  // True when the user has flagged this row as an inter-account
  // transfer that should not show as real income / expense. The
  // setting `hideTransfers` filters such rows out of the budget table
  // while their amounts continue to contribute to the running balance.
  // Set via the per-row "mark as transfer" (eye-slash) action and
  // mirrored from `HistoryEntry.isTransfer` by `synthesizeHistoryRow`.
  // Synthesized transaction rows (those carrying `peerAccountId`) are
  // implicitly transfers and don't need this flag set.
  isTransfer?: boolean;
};

// Master allowlist of glyph names used anywhere in the app. The picker
// grids for sheets, accounts, categories, and types each render a
// curated subset of this union (see `*_GLYPH_NAMES` in
// `data/constants.ts`) so the user sees relevant choices in each
// context, but the persisted data model accepts any value from the
// full union. That keeps cross-context moves (an icon used for a
// category today, promoted to a sheet glyph tomorrow) free.
export type CategoryIcon =
  // Originals — kept first to preserve existing display order in
  // contexts that still iterate the full allowlist.
  | "tag"
  | "home"
  | "car"
  | "shopping-bag"
  | "shopping-cart"
  | "utensils"
  | "coffee"
  | "pizza"
  | "heart"
  | "gift"
  | "music"
  | "film"
  | "plane"
  | "hotel"
  | "package"
  | "hand-heart"
  | "briefcase"
  | "graduation-cap"
  | "stethoscope"
  | "pill"
  | "receipt"
  | "banknote"
  | "credit-card"
  | "piggy-bank"
  | "wallet"
  | "zap"
  | "sparkles"
  | "star"
  // Food & drink
  | "cookie"
  | "cake"
  | "ice-cream"
  | "beer"
  | "wine"
  | "hand-platter"
  | "cooking-pot"
  // Transport
  | "bus"
  | "train"
  | "bike"
  | "fuel"
  // Home & utilities
  | "bed"
  | "sofa"
  | "lightbulb"
  | "droplet"
  | "flame"
  | "wifi"
  | "key"
  | "wrench"
  | "hammer"
  | "brush-cleaning"
  | "trash-2"
  | "sprout"
  | "umbrella"
  // Tech & gadgets
  | "smartphone"
  | "laptop"
  | "headphones"
  | "camera"
  | "tv"
  // Lifestyle
  | "shirt"
  | "scissors"
  | "ticket"
  | "gamepad-2"
  | "book-open"
  | "dumbbell"
  | "dog"
  | "cat"
  | "paw-print"
  | "tree-pine"
  | "baby"
  | "hourglass"
  // Health
  | "heart-pulse"
  | "shield-plus"
  // Money & finance
  | "coins"
  | "hand-coins"
  | "landmark"
  | "building-2"
  | "vault"
  | "gem"
  | "bitcoin"
  | "scale"
  | "trending-up"
  | "line-chart"
  | "pie-chart"
  | "calendar-days"
  | "globe"
  | "arrow-down-circle"
  | "arrow-up-circle"
  | "percent"
  // Print, media & arts
  | "newspaper"
  | "book-marked"
  | "clapperboard"
  | "palette"
  | "lamp"
  | "bath"
  | "compass";

// Broad bucket used for cross-row analysis: Food, Housing, Transport,
// Entertainment. A category owns a set of `EntryType`s (its concrete
// children) — every type belongs to exactly one category, and a row's
// category is derived through `row.typeId → type.categoryId`. The
// category itself is never selected directly on a row; rows pick a
// type and the category follows.
export type Category = {
  id: string;
  name: string;
  color: string;
  icon: CategoryIcon;
};

// Whether an EntryType belongs on the income side, the expense side,
// or works for either direction. Drives the `TypePicker` filter so
// "Salary" disappears when the user enters a negative amount and
// "Groceries" disappears on a positive one. `any` is the implicit
// default for user-created types (and for any preset that fits both
// directions) — when `kind` is missing, the type is offered in every
// sign context.
export type EntryTypeKind = "income" | "expense" | "any";

// Reusable label assigned to a row to describe what kind of entry it
// is — "Mortgage", "Groceries", "Restaurant", "Salary". Sits between
// the free-text description (which is specific to the row) and the
// category (which groups across rows for statistical analysis). Every
// type belongs to exactly one `Category` via `categoryId`; the
// category is derived through that link rather than stored on the row.
// The type's glyph and color replace the per-row `glyph` field that
// used to live on `Row`: now every row that shares a type also shares
// a visual identity, so the picker is the single source of truth for
// what a row looks like.
//
// `kind` narrows the picker so income-only entries (Salary, Bonus,
// Barnbidrag) never surface on a negative-amount row and expense-only
// entries never surface on a positive one. Absent on a type means
// "fits either direction". For preset types the default `kind` is
// hard-coded; the per-user override lives in
// `UserData.presetTypeKindOverrides`.
export type EntryType = {
  id: string;
  name: string;
  color: string;
  glyph: CategoryIcon;
  categoryId: string;
  kind?: EntryTypeKind;
};

// A real-world account (a bank account, credit card, cash envelope, …)
// that a budget tracks. Accounts live at the UserData level so the same
// account can be referenced from multiple sheets and a future roll-up
// view can sum balances across the whole user.
//
// All fields beyond `id` and `name` are optional display / bank-detail
// metadata: the Accounts sheet surfaces them and the create-account
// modal collects them, but the budget logic itself only reads `id`
// and `name`. New optional fields land here without a migration —
// readers ignore unknown fields, writers fill in what they have.
export type Account = {
  id: string;
  name: string;
  description?: string;
  glyph?: CategoryIcon;
  color?: string;
  bank?: string;
  // Swedish clearingnummer (4–5 digits identifying the branch).
  clearing?: string;
  // Local account number (without the clearing prefix).
  accountNumber?: string;
  iban?: string;
  bic?: string;
  // Free-form currency token that overrides Settings.currency when
  // rendering this account's balance. Empty / undefined means "use
  // the global setting".
  currency?: string;
  // Anchored opening balance derived from imported history. When a
  // bank statement is imported, the earliest entry's `balance` minus
  // its `amount` is the account's balance just before that entry —
  // we stash it here so the running balance computed from history
  // entries lines up with what the bank says. Undefined on accounts
  // that have never been seeded from history.
  openingBalance?: number;
};

// One row from an imported bank statement. The four fields are the
// raw shape every bank export carries; `id` is a deterministic content
// hash (date + amount + balance + normalised description, with the
// balance segment omitted when the export carries none) so re-importing
// an overlapping statement is a no-op rather than a duplication.
//
// `balance` is optional because credit-card exports (e.g. Bank
// Norwegian) don't carry a per-row running balance — only a signed
// amount and a description. For checking-account exports
// (Skandiabanken, Swedbank, ICA) the field is set and used to anchor
// `Account.openingBalance` so the running total reconciles with what
// the bank reports.
//
// `hidden` lets the user shelve noise (interest accruals, fee lines, …)
// without losing the data — the entry still counts in the running
// balance but is filtered out of budget projections and the history
// modal's default view.
//
// `importedAt` records the millisecond timestamp the entry was first
// loaded so a future "undo last import" affordance can roll back a
// session-worth of writes by timestamp.
//
// `collapsedIntoTransactionId` is set by the cross-account transfer
// auto-collapse flow: when a pair of mirror entries (one on each side
// of an internal Swish) is merged into a single `Transaction`, both
// HistoryEntrys are flipped to `hidden: true` and stamped with the
// transaction's id so the operation is reversible (delete the
// transaction → clear the backref → un-hide) and idempotent
// (subsequent imports skip entries that already carry a backref).
// One slice of a split bank entry. Each split renders as its own row
// in the synthesized budget view and contributes its own amount to
// the running balance; the splits' signed amounts MUST sum to
// `HistoryEntry.amount` so the account total stays anchored to the
// bank's authoritative figure. Set by the split modal opened from
// the scissors button on a history row — useful when one bank
// transaction (a bankgiro, a card swipe at a multi-merchant register)
// paid for several categorised items in one go.
export type HistoryEntrySplit = {
  description: string;
  amount: number;
  typeId?: string | null;
};

export type HistoryEntry = {
  id: string;
  date: string;
  description: string;
  amount: number;
  balance?: number;
  importedAt: number;
  hidden?: boolean;
  collapsedIntoTransactionId?: string;
  // True when the user has flagged this bank row as an inter-account
  // transfer (set via the history-entry edit modal). The synthesized
  // row picks this up and the `hideTransfers` setting filters it out of
  // the budget projection. The amount still contributes to the running
  // balance — the row is suppressed, not deleted. Independent of the
  // auto-collapse path (`collapsedIntoTransactionId`), which dedups a
  // matched pair into a single Transaction; this flag stands in when no
  // peer side is available yet.
  isTransfer?: boolean;
  // Per-entry user overrides for the synthesized row's description /
  // type. Higher priority than `MatchRule` and `MerchantHint` — set by
  // the per-entry edit modal (pen button on a history row) and the
  // inline editors so a single bank entry can be relabelled without
  // dragging every other entry that shares its merchant key with it.
  // `description` left unset (or empty after trimming, normalised to
  // unset by the reducer) means "fall through to rules / hints / raw
  // bank text". `userTypeId` set to a string id wins over rule / hint;
  // unset means "fall through" too. The raw bank `description` is
  // preserved untouched so the original statement text remains visible
  // alongside the override in the edit modal.
  userDescription?: string;
  userTypeId?: string;
  // True when the user has explicitly opted this entry out of the
  // merchant-hint overlay. Set per-entry from the "Past matches" list
  // in the promote-to-recurring modal — checking off a row there
  // stamps this flag so the synthesizer skips the hint step in
  // `resolveEntryLabels` and falls back to rule / raw bank text.
  // `userDescription` / `userTypeId` (per-entry overrides) still win
  // when set; only the hint step is suppressed. Independent of
  // `hidden` — the row still renders, it just keeps its bank text.
  hintIgnored?: boolean;
  // User-defined split of this bank entry into multiple categorised
  // parts. When present and non-empty, the synthesizer emits one row
  // per split in place of the entry's single row; the splits' signed
  // amounts must sum to `amount` so the running balance stays anchored
  // to the bank's total. Absent (or empty after validation) means the
  // entry renders as a single row with the usual override / rule /
  // hint chain. Splits live alongside `userDescription` / `userTypeId`
  // — those overrides target the single-row presentation and are
  // ignored when `splits` is active.
  splits?: HistoryEntrySplit[];
};

// Per-account metadata recorded each time the user imports a file.
// Lets the History modal show "imported `statement.xlsx` on 2026-05-17
// covering 2025-05 to 2026-05, 312 entries" and is the hook a future
// "undo last import" affordance reads. Stored alongside the entries
// rather than computed because filenames and dropped-duplicate counts
// don't survive a re-walk of the data.
export type HistoryImport = {
  id: string;
  importedAt: number;
  filename: string;
  bankParserId: string;
  rangeStart: string;
  rangeEnd: string;
  addedCount: number;
  duplicateCount: number;
};

// One transfer between two accounts. Stored at the UserData level so a
// transaction can exist for accounts without a budget attached — the
// Accounts sheet renders the global list, and budget views synthesize
// the involving rows for the account they track. `amount` is always
// positive; direction is `fromAccountId → toAccountId`.
export type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  typeId?: string | null;
  completed?: boolean;
};

// One block on a sheet that budgets a single Account: a typed spreadsheet
// with columns (date, description, amount, balance, …) and rows. The
// `accountId` ties the block to its Account so balances and forecasts
// can be computed per account. Nullable so a budget can be created
// before the user has decided which account it tracks — once account
// transactions exist the running balance will pick up the account's
// real starting balance, but until then an unassigned budget is just
// a free-standing forward-looking ledger.
export type AccountBudget = {
  id: string;
  type: "accountBudget";
  accountId: string | null;
  columns: Column[];
  rows: Row[];
};

// Workspace-wide dashboard sheet item. The Accounts sheet is a
// singleton flavour that doesn't track a single account — instead it
// renders the global account list and the cross-account transactions
// log. The item carries no data of its own today; the shape exists so
// future per-sheet config (account filter, sort order, …) lands here
// without another migration.
export type AccountsView = {
  id: string;
  type: "accountsView";
};

// Discriminated union of everything a sheet can hold. `AccountBudget`
// is the per-account ledger; `AccountsView` is the workspace-wide
// dashboard rendered by the Accounts sheet flavour. Future variants
// (Graph, Note, …) slot in as additional cases without a migration of
// the existing data because old blocks still match their own variant.
export type SheetItem = AccountBudget | AccountsView;

// Sheet flavour. A `Sheet` carries a `type` so the UI can pick the
// right body — today the transactional ledger ("budget") and the
// workspace-wide accounts dashboard ("accounts") are implemented.
// Future planners (loan tracking, savings forecast, parental-leave
// planner, …) slot in as additional literals without needing another
// migration.
export type SheetType = "budget" | "accounts";

// A named tab inside the workspace. A sheet is a container of one or
// more `SheetItem`s — the current UI renders a single AccountBudget,
// but the shape supports stacking blocks (e.g. an AccountBudget plus a
// Graph of the same account) without another migration later.
//
// `glyph`, `color`, and `description` are user-facing display
// metadata: the sheet shows up in the bottom tab bar as a coloured
// glyph (with its name beside it on desktop), and `description` is
// surfaced in the editor modal so a user juggling several sheets has
// somewhere to leave themselves a note (e.g. "Child account").
export type Sheet = {
  id: string;
  name: string;
  type: SheetType;
  glyph: SheetGlyph;
  color: string;
  description: string;
  items: SheetItem[];
};

// Glyphs available for a Sheet. Reuses the `CategoryIcon` set so the
// same picker, validator allowlist, and rendering helper cover both
// the category chips and the sheet tabs; the names already lean
// money/account-oriented (wallet, banknote, piggy-bank, …) which is
// exactly the vocabulary sheets need.
export type SheetGlyph = CategoryIcon;

// User-facing display and entry preferences. Persisted as part of the
// budget so an export carries the user's chosen formats and a re-import
// on a different device restores them.
export type DecimalSeparator = "." | ",";
// Empty string represents "no thousands separator" — easier to serialise
// than a literal `"none"` and lets the formatter join straight.
export type ThousandsSeparator = " " | "." | "," | "";

// Tokens accepted by `formatDate` / parsed by the date-format picker.
// Limiting to a small allowlist keeps validation tight and the UI
// (a dropdown) tractable.
export type DateFormat =
  | "YYYY-MM-DD"
  | "DD/MM/YYYY"
  | "MM/DD/YYYY"
  | "DD.MM.YYYY"
  | "D MMM YYYY";

// Year-less variant used by in-cell date renderings. Decoupled from
// `DateFormat` so the user can read sheet cells as a compact "16/5"
// while keeping a long-form like "YYYY-MM-DD" elsewhere.
export type ShortDateFormat = "DD/MM" | "MM/DD" | "DD.MM" | "MM-DD" | "D MMM";

// Theme preset. The two original variants — `dark` / `light` — lock
// to the One Dark / One Light palettes; `dracula`, `githubDark`, and
// `githubLight` are the popular VS Code themes adapted for the budget
// slot vocabulary; `system` follows `prefers-color-scheme`; `custom`
// applies the colour and density overrides held under `customTheme`.
// The runtime writes the active value to `data-theme` on `<html>`.
export type ThemePreset =
  | "dark"
  | "light"
  | "dracula"
  | "monokai"
  | "githubDark"
  | "githubLight"
  | "solarizedLight"
  | "quietLight"
  | "system"
  | "custom";

// Broad colour-scheme family a theme preset belongs to. The Appearance
// picker uses this to drive its two-row UI — the mode row selects the
// family (Dark / Light / System / Custom) and a variant row appears
// underneath whenever the family is `dark` or `light`, listing the
// specific theme presets within it. Derived from `theme`; not
// persisted separately.
export type ThemeFamily = "dark" | "light" | "system" | "custom";

// Bundled webfont family the body reads through `--app-font-family`.
// Four options — one mono, one sans, one serif, plus OpenDyslexic for
// readers with dyslexia — bundled via `@fontsource/*` so they ship
// with the build instead of being fetched from a CDN at runtime.
// Applies across every theme preset.
export type FontFamilyId = "mono" | "sans" | "serif" | "dyslexic";

// Corner-radius preset consumed by the Custom theme. Only a handful
// of "big-impact" surfaces (modal/picker/input chrome via
// `.field-input`, the formula pill) read through `--radius-*`; the
// rest of the UI keeps its Tailwind `rounded-*` utilities so a wider
// rollout doesn't ride on this single feature.
export type RadiusPreset = "none" | "sm" | "md" | "lg";

// UI density preset. Scales the row padding the `--density-row-*` vars
// expose to the chrome that opts in.
export type DensityPreset = "compact" | "comfortable" | "spacious";

// Border thickness preset consumed by chrome that reads
// `var(--border-width)`. `thin` is sub-pixel friendly on hi-DPI
// screens; `bold` makes the dividers more emphatic.
export type BorderWidthPreset = "thin" | "normal" | "bold";

// Per-slot custom colours. One field per CSS variable the chrome reads,
// minus the 12 month-wheel colours (those are hand-tuned for legibility
// on both One Dark and One Light and aren't user-customisable). The
// runtime maps each key to its `--<slug>` CSS var on `<html>` when the
// active theme is `custom`.
export type CustomThemeColors = {
  pageBg: string;
  surface: string;
  surface2: string;
  surface3: string;
  fg: string;
  fgBright: string;
  muted: string;
  line: string;
  accent: string;
  meta: string;
  link: string;
  path: string;
  flag: string;
  pipe: string;
  danger: string;
  success: string;
  positive: string;
  negative: string;
};

// User-authored theme applied when `Settings.theme === "custom"`. Kept
// on disk even when another preset is active so flipping back to
// `"custom"` restores the previous tweaks. The picker pre-fills it
// from whichever preset (Dark or Light) was effective the first time
// the user switches to Custom; subsequent edits move on from there.
export type CustomTheme = {
  colors: CustomThemeColors;
  radius: RadiusPreset;
  density: DensityPreset;
  borderWidth: BorderWidthPreset;
  // Globally short-circuits `transition-duration` and
  // `animation-duration` via a high-specificity rule keyed off
  // `[data-reduce-motion="true"]` on `<html>`.
  reduceMotion: boolean;
};

// Per-device download-modal defaults. Persisted inside the device
// scope of `Settings` so a desktop user's XLSX habit doesn't follow
// them onto a phone where CSV is friendlier, while two phones syncing
// the same account still get the same mobile defaults. The
// `accountInfo` / `accountTransactions` / `accountSelected` maps are
// keyed by account id; missing keys default to `true` so a freshly
// minted account inherits the sensible default.
export type BudgetDownloadFormat = "csv" | "xlsx";

export type BudgetDownloadPrefs = {
  format: BudgetDownloadFormat;
  includeHistory: boolean;
};

export type AccountsDownloadPrefs = {
  accountInfo: Record<string, boolean>;
  accountTransactions: Record<string, boolean>;
  accountSelected: Record<string, boolean>;
  includeTransactions: boolean;
  includeUnconfirmed: boolean;
  includeFutureEntries: boolean;
};

// Settings whose value can differ between mobile and desktop. Held in
// `PersistedSettings.device[scope]`; `useEffectiveSettings` resolves
// the active scope from the viewport and merges the bucket into the
// flat `Settings` shape every read site already consumes.
//
// New device-scoped fields go here. Anything that helps the user
// trade screen space for precision (showCurrency, abbreviateNumbers,
// fontScale, …) belongs in this bucket; anything that's a personal
// preference about the user, not about the screen (language, theme,
// startOfMonth, …) lives in `CommonSettings`.
export type DeviceSettings = {
  // Display toggles. `formatNumbers` controls whether amounts/balances
  // render with thousands grouping; `showCurrency` controls whether the
  // currency token is appended; `showDecimals` controls whether the
  // fractional portion is rendered at all (off rounds to whole units);
  // `abbreviateNumbers` collapses values >= 10 000 to "12K" / "1.2M"
  // so cramped mobile rows fit. Editable inputs stay precise — the
  // setting only affects display.
  formatNumbers: boolean;
  showCurrency: boolean;
  showDecimals: boolean;
  abbreviateNumbers: boolean;
  // Bypass the 10 000 abbreviation threshold for the running-balance
  // column on the main sheet view, so a column reads as uniformly
  // abbreviated rather than a mix of "12K" and "9 432". Has no effect
  // unless `abbreviateNumbers` is also on, and never affects the amount
  // column — small amounts stay precise because the amount is the
  // primary value while the balance is a derived snapshot.
  alwaysAbbreviateBalance: boolean;
  // Multiplier applied to the base UI font size. 1 is the default;
  // smaller values fit more on screen, larger values help readability.
  // Stored as a plain number (not a preset id) so a future slider can
  // pick any value in range without another schema bump. The runtime
  // applies it by setting `--app-font-scale` on the document root;
  // both the html root font-size (so every `rem`-based Tailwind utility
  // scales) and the body's absolute pixel font-size (so body-inherited
  // content scales too) read through that variable so the whole UI
  // scales together. Bounded by `MIN_FONT_SCALE` / `MAX_FONT_SCALE`.
  fontScale: number;
  // What clicking the "budget" wordmark in the page header does.
  // Inspired by the iPhone Action Button: the user picks a single
  // navigation shortcut they want one tap away. Default scrolls to
  // the top of the page (the web convention for a clickable
  // wordmark). The `sheet` variant carries the target sheet id; if
  // that sheet is later deleted the click handler falls back to
  // scrolling to the top so a dangling reference stays harmless.
  headerAction: HeaderAction;
  // Per-device download-modal defaults — desktop users tend to prefer
  // XLSX with the full export; mobile users tend to prefer CSV / JSON.
  // Seeded identically in both buckets by the v34 → v35 migration so
  // upgrading users see no behaviour change until they pick something
  // different on one of the devices.
  downloadBudget: BudgetDownloadPrefs;
  downloadAccounts: AccountsDownloadPrefs;
};

// Settings that hold a single value applied everywhere — locale,
// appearance, security, sync-error UX. A change on any device reaches
// every other device through the normal UserData cloud sync.
export type CommonSettings = {
  // Day-of-month the fiscal month rolls over on. Defaults to 25 because
  // the typical Swedish payday is the 25th, so the budget month aligns
  // with when salary lands. Bounded 1..28 so every calendar month has
  // the chosen day.
  startOfMonth: number;
  dateFormat: DateFormat;
  shortDateFormat: ShortDateFormat;
  // Free-form currency token shown next to amounts when `showCurrency`
  // is on. Defaults to "kr" (SEK). Not validated against a list — users
  // are free to type "$", "€", "USD", etc.
  currency: string;
  // Whether the currency symbol renders before ("$10") or after ("10 kr")
  // the amount. Independent of `currencySpace` so all four combinations
  // are reachable.
  currencyPosition: "before" | "after";
  // Whether a single space separates the symbol from the amount. Off
  // renders "$10" / "10kr"; on renders "$ 10" / "10 kr".
  currencySpace: boolean;
  decimalSeparator: DecimalSeparator;
  thousandsSeparator: ThousandsSeparator;
  // Minutes the decrypted password may sit in the tab's sessionStorage
  // before the user is auto-signed-out. The clock resets on every user
  // input, so this is an idle timeout, not a hard ceiling. Bounded
  // 1..1440 (one minute to 24 hours).
  sessionTimeoutMinutes: number;
  // Version string of the changelog the user last acknowledged. Null on
  // a fresh install — the app records the current version silently on
  // first run so an existing user never sees a popup the moment they
  // upgrade. When the running APP_VERSION compares greater than this,
  // the "What's new" modal opens and writes the current version here
  // on dismissal.
  lastSeenChangelogVersion: string | null;
  // UI language. "en" leaves the app in English (the default for
  // existing installs after the migration); "sv" translates every
  // user-facing string to Swedish. Date and number formatting are
  // controlled by their own settings and are not coupled to this
  // field — a Swedish-speaking user may still want, say, currency
  // before the amount.
  language: "en" | "sv";
  // Suppress rows flagged as inter-account transfers from the budget
  // tables. The running balance still accounts for their amounts —
  // they're hidden, not removed. Triggered by: a synthesized
  // Transaction row's `peerAccountId`, a `HistoryEntry.isTransfer`
  // flagged in the entry-edit modal, or a budget row's `isTransfer`
  // flagged by the per-row eye action. Each visible row whose
  // computed balance step crossed at least one hidden transfer gets
  // a small ↔ icon on its balance cell that inline-expands the
  // hidden rows underneath when clicked. Default false so the
  // out-of-the-box view matches existing builds.
  hideTransfers: boolean;
  // Active theme preset. Defaults to `"system"` so a fresh install
  // tracks the OS colour scheme — matching the legacy behaviour
  // before the picker existed. Switching to `"custom"` activates
  // the colour / shape / motion overrides held under `customTheme`.
  theme: ThemePreset;
  // Active bundled webfont. Defaults to `"mono"` so existing users
  // keep the monospaced One Dark aesthetic. Applies across every
  // theme preset; the runtime writes the chosen stack to
  // `--app-font-family`.
  fontFamily: FontFamilyId;
  // Custom theme overrides. Always present in the persisted shape so
  // a "Reset to defaults" lands on a sensible baseline (clone of the
  // Dark palette) and flipping `theme` between `"custom"` and a
  // preset is a no-op for the colour bytes.
  customTheme: CustomTheme;
  // Map of achievement id → unix-ms unlock timestamp. Each id is a
  // stable string from the achievement catalog (see
  // `src/data/achievements/catalog.ts`). Writes go through
  // `recordAchievementUnlock`; the reducer guards against re-unlocking
  // an id that's already present so timestamps stay stable. Synced to
  // the cloud backend along with the rest of UserData so the trophy
  // room follows the user across devices.
  achievements: Record<string, number>;
  // Achievement ids the user has unlocked but not yet seen the modal
  // for. Drains to `[]` when the user dismisses the unlock modal via
  // `clearUnseenAchievements`. The HeaderStar shows a filled yellow
  // star whenever this array is non-empty; clicking opens the modal.
  unseenAchievements: string[];
  // When on (the default), a cloud auth-error auto-opens the dedicated
  // reconnect modal so the user can fix it without hunting for the
  // sync-status pill. Off if the user finds the prompt intrusive (e.g.
  // Google Drive's hourly token expiry); the underlying detection still
  // surfaces in the status pill regardless. Moved from device-local
  // localStorage into the synced bucket in v35 so the choice follows
  // the user across devices.
  cloudReauthAutoOpen: boolean;
  // Reading direction for transaction lists across the app: the
  // editable sheet, the read-only sheet viewer, the account transfer
  // log, and the account history modal. `"newestFirst"` puts today at
  // the top and walks backwards; `"oldestFirst"` walks forward from
  // the start of the ledger. Default is `"newestFirst"` since three of
  // the four surfaces already shipped with that direction baked in;
  // the editable sheet flips on first run for fresh installs. Affects
  // display only — `computeBalances()` always accumulates
  // chronologically so the running balance is independent of this
  // choice.
  transactionSortOrder: TransactionSortOrder;
  // When true, the editable budget sheet exposes `futureEntryMonths`
  // worth of upcoming fiscal months by default; when false, every
  // future-dated entry is tucked behind a "Show 3 future months"
  // toggle inside the sheet that steps the cutoff three months
  // forward per click. Default false — keeps the sheet anchored on
  // today's month so a planner with rows scheduled months out
  // doesn't push the current row off-screen.
  showFutureEntries: boolean;
  // Number of fiscal months past the current one to render by default
  // when `showFutureEntries` is true. Bounded 1..24 so a typo can't
  // force the sheet to render decades of empty placeholders. Anything
  // beyond this cutoff remains hidden behind the in-sheet toggle.
  futureEntryMonths: number;
};

export type TransactionSortOrder = "newestFirst" | "oldestFirst";

// Persisted shape of `UserData.settings`. Common fields stay flat at
// the top level so the rest of the codebase (which reads
// `settings.currency`, `settings.startOfMonth`, …) keeps working; the
// device-scoped fields move into `device.{mobile,desktop}` so each
// viewport can hold its own value. Consumers should not read this
// type directly — go through `useEffectiveSettings()` (in
// `src/hooks/useEffectiveSettings.ts`) which returns the flat
// `Settings` shape with the active scope already merged in.
export type PersistedSettings = CommonSettings & {
  device: {
    mobile: DeviceSettings;
    desktop: DeviceSettings;
  };
};

// Effective, flat shape every read site already consumes. Produced by
// `resolveEffectiveSettings(persisted, isMobile)` — the common fields
// come from the top level, the device-scoped fields come from
// whichever bucket the active viewport selects.
export type Settings = CommonSettings & DeviceSettings;

// Discriminated union — `kind` selects the action and the only
// parameterised variant (`sheet`) carries its target id. Scales to
// future kinds that need parameters without another schema bump.
export type HeaderAction =
  | { kind: "top" }
  | { kind: "currentMonth" }
  | { kind: "refresh" }
  | { kind: "sheet"; sheetId: string };

// Persistent memory of which type the user assigned to which
// merchant. Keyed by the normalised description so cosmetic
// differences ("Spotify *123", "SPOTIFY") map to a single hint. The
// recurring-candidate promote flow reads this to pre-suggest a type;
// the history-row promote-to-recurring flow extends the same hint
// with a user-typed description so past and future history entries
// display under the user's label rather than the raw bank text. The
// hint's category is derived through `typeId → type.categoryId` —
// it isn't stored on the hint itself. Always advisory — the UI
// surfaces the suggestion to the user, never auto-applies silently.
export type MerchantHint = {
  typeId: string;
  // How many times the user has assigned this type to this merchant.
  // Higher counts could later inform suggestion ordering; today the
  // panel just shows the count for transparency.
  hitCount: number;
  // Unix ms timestamp of the most recent assignment. Used by the
  // "Merchant memory" settings section to show "last used …" and as
  // a tiebreaker if two hints ever collide on the same key (the
  // validator already enforces a single hint per key, but the field
  // costs nothing and keeps the door open).
  lastUsedAt: number;
  // Optional user-typed label that overrides the bank's description
  // wherever this merchant shows up. Set by the history-row promote
  // flow so a row of "ICA SUPERMARKET 12345" can display as
  // "Groceries" once the user names it.
  description?: string;
};

// User-defined rule that relabels imported bank-history entries by
// wildcard-matching against their raw description. Distinct from
// `MerchantHint` (which keys off the lossy normalised description and
// is auto-populated by promote flows): a `MatchRule` is explicit
// memory, edited by hand through the pattern modal so a noisy
// merchant like "App Store *Buzzer 9XXX" can be collapsed under a
// single user-typed label by matching `*App Store*`.
//
// Pattern is a simple glob: `*` matches any run of characters
// (including empty), other characters match themselves literally and
// case-insensitively. The pattern is implicitly anchored — wrap with
// `*…*` for substring matching.
//
// `amountSign` filters by transaction direction so a "BAUHAUS" rule
// labels incoming refunds only or outgoing purchases only. The
// `transferFilter` follows the same shape applied to whether the
// entry is part of a cross-account transfer (i.e. carries a
// `collapsedIntoTransactionId`) — useful when a description token
// like "BAUHAUS" can appear both on real purchases and on transfers
// the user labelled themselves.
//
// All three filter fields default to `any`; absent fields on disk
// are normalised by the validator to the same default.
export type MatchRule = {
  id: string;
  pattern: string;
  description?: string;
  typeId?: string | null;
  amountSign?: "any" | "positive" | "negative";
  transferFilter?: "any" | "exclude" | "only";
  // Signed lower / upper bounds on the entry amount, applied on top
  // of `amountSign`. Either may be absent — a missing bound is open-
  // ended in that direction. Useful when one description token
  // covers several services and only one falls in a given price
  // band (e.g. an autogiro line that bills 250–380 kr for one
  // insurance product and a different amount for another).
  amountMin?: number;
  amountMax?: number;
};

// User-defined rule that auto-reconciles future bank-history entries
// against rows belonging to a recurring series. Learned at confirm
// time in the reconciliation modal — when the user merges one
// occurrence of "Rent" with a "SIMPLEKO" bank entry and picks
// "Apply to whole series", the modal records the inferred pattern
// (`*SIMPLEKO*`), the amount-tolerance band, and the date-lag in
// days. Subsequent imports that match the same series + pattern +
// band collapse silently, no modal required.
//
// `pattern` is the same glob shape as `MatchRule.pattern` (`*`
// matches any run; case-insensitive; substring matching needs
// explicit wrapping `*…*`). `amountTolerancePct` is the percentage
// delta the user accepted at confirmation time, frozen so a one-off
// coincidence doesn't widen all future matches. `dateLagDays` is
// the max observed `history.date - row.date` clamped to
// `RECONCILIATION_DATE_LAG_DAYS`.
export type SeriesMatchRule = {
  id: string;
  seriesId: string;
  pattern: string;
  amountTolerancePct: number;
  dateLagDays: number;
};

// Top-level persisted blob for one signed-in user. Holds everything
// that user owns: their sheets, the categories they've defined, and
// their display preferences. The user account itself (id, username,
// password hash) lives in the device-wide registry — see `StoredUser`
// and `UsersFile` below — so a UserData snapshot can be exported and
// imported across devices without dragging credentials along.
export type UserData = {
  version: 38;
  sheets: Sheet[];
  activeSheetId: string;
  accounts: Account[];
  // User-added categories. On top of these the runtime also shows a
  // built-in list of broad Swedish-household preset categories
  // (`PRESET_CATEGORIES` in `data/constants.ts`); preset categories
  // live in code, not in this array. The user can hide individual
  // presets via `hiddenPresetCategoryIds`.
  categories: Category[];
  // User-added entry types referenced by `Row.typeId`. On top of these
  // the runtime also shows a built-in list of typical-Swedish-household
  // preset types (`PRESET_ENTRY_TYPES` in `data/constants.ts`); preset
  // types live in code, not in this array. The user can hide
  // individual presets via `hiddenPresetTypeIds`.
  types: EntryType[];
  // Preset type ids the user has hidden from pickers and the Types
  // admin list. Pure allowlist — entries that no longer match a known
  // preset (e.g. a preset removed in a later app version) are dropped
  // on load.
  hiddenPresetTypeIds: string[];
  // Per-user overrides for the `kind` of preset entry types (Income /
  // Expense / Any). Lets a user re-classify a built-in preset without
  // shipping a new app version — e.g. flip Barnbidrag from income to
  // any if their household treats it differently. Keys are preset
  // type ids; values are the override. Absent / unknown ids fall back
  // to the preset's hard-coded `kind`. User-added types carry their
  // own `kind` on the `EntryType` record instead.
  presetTypeKindOverrides: Record<string, EntryTypeKind>;
  // Same shape as `hiddenPresetTypeIds`, scoped to preset categories.
  hiddenPresetCategoryIds: string[];
  // Transfers between accounts. Each transaction renders as a read-only
  // synthesized row on every budget that tracks one of its endpoints,
  // and as a top-level row on the Accounts sheet's transaction log.
  // Empty on a fresh budget and on v8 imports the v9 migration upgrades.
  transactions: Transaction[];
  // Imported bank-statement entries, keyed by account id. Each entry
  // is the raw bank row — date, description, amount, balance — kept
  // independently of any budget rows the user has authored. The
  // History modal on the Accounts page reads it directly, and the
  // budget view projects entries inline so the user can promote them
  // to real recurring rows. Stored as a Record (rather than an array
  // on each Account) so `Account` stays a small display-metadata
  // object and future per-account streaming / partitioning has a
  // natural seam.
  history: Record<string, HistoryEntry[]>;
  // One record per file the user has imported, scoped by account. The
  // History modal renders this as an audit trail and a future
  // "undo last import" affordance reads it back to filter `history`
  // by `importedAt`.
  historyImports: Record<string, HistoryImport[]>;
  // Merchant-hint memory. See `MerchantHint`. Stored as a record so
  // a category-deletion can sweep dangling hints in a single pass
  // and so the on-disk size scales with the number of distinct
  // merchants, not with the number of transactions.
  merchantHints: Record<string, MerchantHint>;
  // Normalised-description keys the user dismissed with "Not
  // recurring" on the recurring-candidate panel. The detector skips
  // these so noise doesn't keep coming back on every import. The
  // settings UI surfaces a clear-all so a misclick is recoverable.
  recurringDismissals: string[];
  // Pair keys the user dismissed with "Never" on the transfer-
  // collapse modal. Same shape and contract as `recurringDismissals`:
  // detector reads it as an allowlist, settings UI offers a clear-all.
  transferCollapseDismissals: string[];
  // Wildcard-pattern overlays for synthesized history rows. Each
  // rule is created from the history-row pattern button; the rule
  // labels every matching entry (past + future imports) with the
  // user-typed description / category / type. Distinct from
  // `merchantHints` — those are auto-recorded via the lossy
  // normalised description, these are explicit globs with sign /
  // transfer filters the user owns.
  matchRules: MatchRule[];
  // Series-scoped auto-reconciliation rules. Learned when the user
  // confirms "Apply to whole series" in the reconciliation modal —
  // see `SeriesMatchRule`. Future bank-history imports consult these
  // and collapse any predicted row + history entry pair that fits
  // the rule's pattern + amount band + date lag, no modal needed.
  seriesMatchRules: SeriesMatchRule[];
  settings: PersistedSettings;
};

// User account record persisted in the device-wide registry. The
// password is stored as a PBKDF2-SHA256 digest with a per-user salt
// and the iteration count it was computed under. The same plaintext
// password also derives the AES-GCM key used to encrypt that user's
// budget bytes (via a separate salt inside the envelope) so there is
// only ever one password per account.
//
// `isDefault` marks the no-password "guest" account created by the
// "Continue without account" flow on the auth screen. Default users
// have empty password fields, can only exist alone (no other accounts
// on the device), and are consumed by the first real account that
// gets created — see `handleCreateAccount` in `App.tsx`.
export type StoredUser = {
  id: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  iterations: number;
  hash: "SHA-256";
  createdAt: number;
  isDefault?: boolean;
};

export type UsersFile = {
  version: 1;
  users: StoredUser[];
  // Id of the user whose budget the app should try to load on the
  // next launch. Null if the user explicitly signed out.
  activeUserId: string | null;
};
