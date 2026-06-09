import type { CategoryIcon } from "./categories";

// The Savings sheet tracks money the user sets aside — a buffer account, a
// vacation fund, money saved toward something known or unknown. Unlike a
// transactional `Account`, a savings account isn't reconciled against a bank
// statement row-by-row: the user records its current balance with a date, and
// the listing shows the latest. Lives at the `UserData` level (like `Account`
// / `Property`) so the workspace-wide Savings sheet renders the whole
// collection and a future per-account roll-up can read it directly.

// One manually-entered snapshot of a savings account's balance. "Update
// balance" on the Savings page appends one of these; the account's current
// balance is simply the latest point by date. Carries its own `id` (rather
// than being keyed by `date`) so two snapshots taken on the same day can be
// edited / deleted independently. Mirrors `PropertyValuePoint`.
export type SavingBalancePoint = {
  id: string;
  date: string; // ISO yyyy-mm-dd the balance was recorded for
  value: number; // the balance at that date, in the user's currency
};

// A savings account. `kind` is the discriminator that leaves room for a
// future `"investments"` flavour — a savings account is one type of saving;
// savings differ from investments in that they're not expected to grow.
//
// The displayed balance is a manually-recorded dated snapshot
// (`balanceHistory`), not a figure derived from transactions. A savings
// account still stores transactions under its id in `UserData.history` (so it
// participates in cross-account transfer detection, just like a regular
// account), but those transactions are NOT surfaced on the Savings page.
//
// All bank-detail fields beyond `id` / `kind` / `name` are optional display
// metadata — the create / edit modal collects them, the listing surfaces
// them. New optional fields land here without a migration, exactly as
// `Account` documents.
export type Saving = {
  id: string;
  kind: "savings";
  name: string;
  description?: string;
  glyph?: CategoryIcon;
  color?: string;
  bank?: string;
  // Swedish clearingnummer (4–5 digits identifying the branch).
  clearing?: string;
  // Local account number (without the clearing prefix).
  accountNumber?: string;
  // Free-form currency token that overrides Settings.currency when rendering
  // this account's balance. Empty / undefined means "use the global setting".
  currency?: string;
  // Manually-recorded balance over time. The current balance is the latest
  // point by date; an empty history means "no balance recorded yet". The
  // create-account modal seeds the first point with the balance the user
  // enters, dated today.
  balanceHistory: SavingBalancePoint[];
};
