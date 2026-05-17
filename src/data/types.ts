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
  // Optional custom glyph the description cell renders in place of the
  // default recurring icon. Every row in the same series carries the
  // same value (the entry modals propagate edits across the scope), so
  // the cell can read it row-locally without a series lookup.
  glyph?: CategoryIcon;
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

// A real-world account (a bank account, credit card, cash envelope, …)
// that a budget tracks. Accounts live at the UserData level so the same
// account can be referenced from multiple sheets and a future roll-up
// view can sum balances across the whole user.
export type Account = {
  id: string;
  name: string;
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

// Discriminated union of everything a sheet can hold. Currently the
// only variant is `AccountBudget`; future variants (Graph, Note, …)
// slot in as additional cases without a migration of the existing
// data because old blocks still match their own variant.
export type SheetItem = AccountBudget;

// Sheet flavour. A `Sheet` carries a `type` so the UI can pick the
// right body — today only the transactional ledger ("budget") is
// implemented, but future planners (loan tracking, savings forecast,
// parental-leave planner, …) slot in as additional literals without
// needing another migration.
export type SheetType = "budget";

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
  // fractional portion is rendered at all (off rounds to whole units).
  formatNumbers: boolean;
  showCurrency: boolean;
  showDecimals: boolean;
  // Minutes the decrypted password may sit in the tab's sessionStorage
  // before the user is auto-signed-out. The clock resets on every user
  // input, so this is an idle timeout, not a hard ceiling. Bounded
  // 1..1440 (one minute to 24 hours).
  sessionTimeoutMinutes: number;
};

// Top-level persisted blob for one signed-in user. Holds everything
// that user owns: their sheets, the categories they've defined, and
// their display preferences. The user account itself (id, username,
// password hash) lives in the device-wide registry — see `StoredUser`
// and `UsersFile` below — so a UserData snapshot can be exported and
// imported across devices without dragging credentials along.
export type UserData = {
  version: 8;
  sheets: Sheet[];
  activeSheetId: string;
  accounts: Account[];
  categories: Category[];
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
