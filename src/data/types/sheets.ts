import type { Column, Row } from "./budget";
import type { CategoryIcon } from "./categories";

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
  // Persisted rows live here as `Row` (the union); the validator
  // ensures only `UserRow | CorrectionRow` ever reach storage, and
  // synthesizers (`synthesizeHistoryRow`, `synthesizeTransferRow`)
  // never write into `item.rows[]`.
  rows: Row[];
};

// Workspace-wide dashboard sheet item. The Accounts sheet is a
// singleton flavour that doesn't track a single account — instead it
// renders the global account list and the cross-account transfers
// log. The item carries no data of its own today; the shape exists so
// future per-sheet config (account filter, sort order, …) lands here
// without another migration.
export type AccountsView = {
  id: string;
  type: "accountsView";
};

// Workspace-wide owned-items catalog sheet item. The Items sheet is a
// singleton flavour that renders the global `UserData.items` catalog
// (every physical thing the user owns) rather than tracking a single
// account. Like `AccountsView` the item carries no data of its own —
// it reads the shared catalog — so the shape exists only so future
// per-sheet config (sort order, show-disposed toggle, …) lands here
// without another migration.
export type ItemsView = {
  id: string;
  type: "itemsView";
};

// Workspace-wide salary-history sheet item. The Salary sheet renders
// the global `UserData.salaries` / `UserData.employers` collections
// (the user's salary over time) rather than tracking a per-account
// ledger. `accountId` ties the sheet to the bank account the user's
// pay lands in — the "Find salaries" walk scans that account's history
// instead of asking which account to scan every time, so multiple
// salary sheets (one per person) each point at their own pay account.
// Nullable so a salary sheet can exist before the user has bound a pay
// account; the discovery walk then prompts them to set one.
export type SalaryView = {
  id: string;
  type: "salaryView";
  accountId: string | null;
  // The reusable tax profile (`UserData.taxProfiles`) used to estimate
  // a paycheck's gross from its net deposit when the user hasn't entered
  // the gross. Absent ⇒ no estimation (the net doubles as the gross and
  // tax shows 0, the pre-tax-calc behaviour).
  taxProfileId?: string;
};

// Workspace-wide properties sheet item. The Properties sheet renders the
// global `UserData.properties` collection (the homes / apartments the
// user owns, with their value over time and the mortgages against them)
// rather than a per-account ledger. Like `ItemsView` the item carries no
// data of its own — it reads the shared catalog — so the shape exists
// only so future per-sheet config (sort order, hide-sold toggle, …)
// lands here without another migration.
export type PropertiesView = {
  id: string;
  type: "propertiesView";
};

// Workspace-wide savings sheet item. The Savings sheet renders the global
// `UserData.savings` collection (the savings accounts the user sets money
// aside in, with their balance recorded over time) rather than a per-account
// ledger. Like `PropertiesView` the item carries no data of its own — it
// reads the shared collection — so the shape exists only so future per-sheet
// config (sort order, hide-empty toggle, …) lands here without another
// migration.
export type SavingsView = {
  id: string;
  type: "savingsView";
};

// Workspace-wide loans sheet item. The Loans sheet renders the global
// `UserData.loans` collection (the money the user owes — student loans,
// car loans, mortgages, borrowed money — with the payments made against
// each) rather than a per-account ledger. Like `SavingsView` the item
// carries no data of its own — it reads the shared collection — so the
// shape exists only so future per-sheet config (sort order, hide-paid-off
// toggle, …) lands here without another migration.
export type LoansView = {
  id: string;
  type: "loansView";
};

// The insight modes the Insights sheet can render. One literal today;
// future modes (cash flow, spending rate, …) extend the union, and the
// page's mode toggle un-hides itself once there is more than one.
export type InsightsMode = "networth";

// Per-entity net-worth override, keyed by entity id in
// `InsightsNetWorthSettings.overrides`. An override with neither field
// set is never persisted — the reducer normalises it away.
export type InsightsEntityOverride = {
  // Excluded from the net-worth roll-up. Only `true` is persisted —
  // stored `false` is indistinguishable from "field absent" and just
  // bloats the snapshot.
  excluded?: boolean;
  // Ownership share in percent, exclusive range (0, 100) — e.g. 50 for
  // a property co-owned with a spouse. Absent ⇒ 100 (fully owned); the
  // reducer drops a stored 100 as redundant. For a property the share
  // applies to BOTH its value and its mortgages (net-equity share).
  sharePct?: number;
};

// Settings for the net-worth insight mode.
export type InsightsNetWorthSettings = {
  // Keyed by entity id — account / saving / item / property / loan ids
  // share one `newId()` id-space, so a flat map is unambiguous. The
  // validator sweeps keys against the union of the known-id sets so a
  // deleted entity's override silently disappears.
  overrides?: Record<string, InsightsEntityOverride>;
};

// Workspace-wide insights sheet item. The Insights sheet aggregates the
// global collections (accounts, savings, items, properties, loans) into
// cross-cutting analyses rather than holding data of its own — only the
// per-mode settings persist here.
export type InsightsView = {
  id: string;
  type: "insightsView";
  // Active insight mode. Absent ⇒ "networth". The field exists now so
  // the persisted shape is settled before a second mode lands.
  mode?: InsightsMode;
  // Per-mode settings live in a per-mode field so future modes carry
  // their own config without colliding.
  networth?: InsightsNetWorthSettings;
};

// Discriminated union of everything a sheet can hold. `AccountBudget`
// is the per-account ledger; `AccountsView` is the workspace-wide
// dashboard rendered by the Accounts sheet flavour; `ItemsView` is the
// owned-items catalog rendered by the Items sheet flavour;
// `PropertiesView` is the properties catalog rendered by the Properties
// flavour. Future variants (Graph, Note, …) slot in as additional cases
// without a migration of the existing data because old blocks still
// match their own variant.
export type SheetItem =
  | AccountBudget
  | AccountsView
  | ItemsView
  | SalaryView
  | PropertiesView
  | SavingsView
  | LoansView
  | InsightsView;

// Sheet flavour. A `Sheet` carries a `type` so the UI can pick the
// right body — today the transactional ledger ("budget"), the
// workspace-wide accounts dashboard ("accounts"), the owned-items
// catalog ("items"), the salary history ("salary"), and the properties
// catalog ("properties") are implemented. Future planners (savings
// forecast, parental-leave planner, …) slot in as additional literals
// without needing another migration.
export type SheetType =
  | "budget"
  | "accounts"
  | "items"
  | "salary"
  | "properties"
  | "savings"
  | "loans"
  | "insights";

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
  // Up to five sheets can be marked as favorites; favorited sheets show
  // as quick-switch glyph icons in the bottom bar (toggled from the "…"
  // title menu). Absent ⇒ not favorited. The cap is enforced at toggle
  // time, never here.
  favorite?: boolean;
  items: SheetItem[];
};

// Glyphs available for a Sheet. Reuses the `CategoryIcon` set so the
// same picker, validator allowlist, and rendering helper cover both
// the category chips and the sheet tabs; the names already lean
// money/account-oriented (wallet, banknote, piggy-bank, …) which is
// exactly the vocabulary sheets need.
export type SheetGlyph = CategoryIcon;
