export type ColumnType =
  | "date"
  | "description"
  | "amount"
  | "balance"
  | "completed"
  | "category";

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
  // The description cell renders the type's glyph + color in place of
  // the default recurring icon, and the type's name takes over from
  // the description as the row's primary label (the description text
  // is demoted to a secondary line behind the chip). Replaces the
  // older `glyph` field — types subsume that role with a name and
  // colour attached, which makes them usable for grouping and stats.
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
};

export type CategoryIcon =
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
  | "star";

export type Category = {
  id: string;
  name: string;
  color: string;
  icon: CategoryIcon;
};

// Reusable label assigned to a row to describe what kind of entry it
// is — "Mortgage", "Groceries", "Restaurant", "Salary". Sits between
// the free-text description (which is specific to the row) and the
// category (which groups across rows for statistical analysis). The
// type's glyph and color replace the per-row `glyph` field that used
// to live on `Row`: now every row that shares a type also shares a
// visual identity, so the picker is the single source of truth for
// what a row looks like.
export type EntryType = {
  id: string;
  name: string;
  color: string;
  glyph: CategoryIcon;
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
export type HistoryEntry = {
  id: string;
  date: string;
  description: string;
  amount: number;
  balance?: number;
  importedAt: number;
  hidden?: boolean;
  collapsedIntoTransactionId?: string;
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
  categoryId?: string | null;
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

export type Settings = {
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
  // Minutes the decrypted password may sit in the tab's sessionStorage
  // before the user is auto-signed-out. The clock resets on every user
  // input, so this is an idle timeout, not a hard ceiling. Bounded
  // 1..1440 (one minute to 24 hours).
  sessionTimeoutMinutes: number;
};

// Persistent memory of which category the user assigned to which
// merchant. Keyed by the normalised description so cosmetic
// differences ("Spotify *123", "SPOTIFY") map to a single hint. The
// recurring-candidate promote flow reads this to pre-suggest a
// category; the history-row promote-to-recurring flow extends the
// same hint with a typeId and a user-typed description so past and
// future history entries display under the user's label rather than
// the raw bank text. Always advisory — the UI surfaces the
// suggestion to the user, never auto-applies silently.
export type MerchantHint = {
  categoryId: string;
  // How many times the user has assigned this category to this
  // merchant. Higher counts could later inform suggestion ordering;
  // today the panel just shows the count for transparency.
  hitCount: number;
  // Unix ms timestamp of the most recent assignment. Used by the
  // "Merchant memory" settings section to show "last used …" and as
  // a tiebreaker if two hints ever collide on the same key (the
  // validator already enforces a single hint per key, but the field
  // costs nothing and keeps the door open).
  lastUsedAt: number;
  // Optional `EntryType` id assigned alongside the category by the
  // history-row promote flow. Synthesized history rows pick it up so
  // the type chip + colour render in place of the raw bank text.
  typeId?: string;
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
  categoryId?: string | null;
  typeId?: string | null;
  amountSign?: "any" | "positive" | "negative";
  transferFilter?: "any" | "exclude" | "only";
};

// Top-level persisted blob for one signed-in user. Holds everything
// that user owns: their sheets, the categories they've defined, and
// their display preferences. The user account itself (id, username,
// password hash) lives in the device-wide registry — see `StoredUser`
// and `UsersFile` below — so a UserData snapshot can be exported and
// imported across devices without dragging credentials along.
export type UserData = {
  version: 17;
  sheets: Sheet[];
  activeSheetId: string;
  accounts: Account[];
  categories: Category[];
  // Reusable entry types referenced by `Row.typeId`. Seeded with a
  // handful of common Swedish-budget defaults on first launch and on
  // migration from v12; users add their own via the type picker.
  types: EntryType[];
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
  settings: Settings;
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
