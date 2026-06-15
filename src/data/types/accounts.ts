import type { CategoryIcon } from "./categories";
import type { LineItemLink } from "./items";

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
// `collapsedIntoTransferId` is set by the cross-account transfer
// auto-collapse flow: when a pair of mirror entries (one on each side
// of an internal Swish) is merged into a single `Transfer`, both
// HistoryEntrys are flipped to `hidden: true` and stamped with the
// transfer's id so the operation is reversible (delete the
// transfer → clear the backref → un-hide) and idempotent
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
  // Same shape as `typeId`: optional reference to a `Company` in
  // `UserData.companies`. Each split row carries its own company
  // because the merchant of the parent bank entry might cover multiple
  // payees (a card swipe at a multi-tenant register can split into
  // distinct companies). `null` is reserved for explicit "no company"
  // when a future patch path needs to clear it.
  companyId?: string | null;
  // Optional per-split tags — references to `Tag`s in `UserData.tags`.
  // Each split carries its own set because one bank transaction can pay
  // for differently-tagged things (a Klarna autogiro covering several
  // unrelated purchases). The synthesizer copies these straight onto the
  // split's `HistoricRow.tagIds` — unlike the single-row path there's no
  // rule / hint union to fold in, the split's tags are authoritative.
  // Dangling ids (deleted tags) are dropped by the validator. Absent or
  // empty means the split carries no tags.
  tagIds?: string[];
};

export type HistoryEntry = {
  id: string;
  date: string;
  description: string;
  amount: number;
  balance?: number;
  importedAt: number;
  hidden?: boolean;
  // Optional fiscal-month override for this entry. Mirrors
  // `Row.fiscalMonthShift` — auto-set by the primary-income matcher
  // when the entry's date is earlier than the matching merchant's
  // anchor day, or set manually from the row-actions menu on the
  // synthesized history row. `synthesizeHistoryRow` propagates it to
  // the synthesized Row so the grouping pipeline's same-day cascade
  // sees it identically to a user-authored row.
  fiscalMonthShift?: -1 | 1;
  collapsedIntoTransferId?: string;
  // True when the user has flagged this bank row as an inter-account
  // transfer (set via the history-entry edit modal). The synthesized
  // row picks this up and the `hideTransfers` setting filters it out of
  // the budget projection. The amount still contributes to the running
  // balance — the row is suppressed, not deleted. Independent of the
  // auto-collapse path (`collapsedIntoTransferId`), which dedups a
  // matched pair into a single Transfer; this flag stands in when no
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
  // Per-entry link to a recurring series (`Row.seriesId`). Stamped when
  // a reconciliation match — silent rule-driven or user-confirmed —
  // pairs this bank entry with a budget row that belongs to a series:
  // the matched row is deleted as redundant, so without this the
  // series connection would be lost. `synthesizeHistoryRow` propagates
  // it onto the synthesized `HistoricRow.seriesId`, so the imported
  // instance keeps showing as part of the series and the recurring
  // entry can be tracked across all its historic occurrences. A
  // grouping id with no registry — same shape as `Row.seriesId`, so
  // the validator keeps any non-empty string rather than cross-checking
  // it. Absent means the entry isn't tied to a series. Fill-blank only:
  // a prior link is never overwritten by a later import.
  userSeriesId?: string;
  // Per-entry override for `companyId`. Set by the per-entry edit
  // modal (pen button on a history row) and any inline editor that
  // exposes the company picker. Higher priority than `MatchRule.companyId`
  // and `MerchantHint.companyId`. Absent means "fall through to rule /
  // hint / nothing"; a deleted company id is dropped silently by the
  // validator so the synthesizer doesn't render a chip pointing at
  // nothing.
  userCompanyId?: string;
  // Per-entry override for the synthesized row's `tagIds`. Set by the
  // per-entry edit modal (pen button on a history row). Unlike
  // `userTypeId` / `userCompanyId` — single values that fully override
  // the rule / hint — tags are a set, so the synthesizer UNIONs these
  // with any matching `MatchRule.tagIds` rather than replacing them: a
  // rule that tags every "Spotify" row "Subscriptions" and a per-entry
  // "Cancel me" tag both land on the row. Dangling ids (deleted tags)
  // are dropped silently by the validator, same contract as
  // `userTypeId`. Absent / empty means "no per-entry tags".
  userTagIds?: string[];
  // True when the user has explicitly opted this entry out of the
  // merchant-hint overlay. Set per-entry from the "Past matches" list
  // in the promote-to-recurring modal — checking off a row there
  // stamps this flag so the synthesizer skips the hint step in
  // `resolveEntryLabels` and falls back to rule / raw bank text.
  // `userDescription` / `userTypeId` (per-entry overrides) still win
  // when set; only the hint step is suppressed. Independent of
  // `hidden` — the row still renders, it just keeps its bank text.
  hintIgnored?: boolean;
  // True when the user has declared this entry doesn't need a company
  // tag. Read only by `BudgetMetadataModal`'s "needs metadata" check —
  // an entry with this flag set won't surface in metadata mode just
  // because `userCompanyId` is absent. Doesn't affect rendering: a
  // future per-entry company tag still resolves normally.
  noCompany?: boolean;
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
  // User-defined links tying part of this transaction's amount to owned
  // `Item`s — see `LineItemLink`. The per-entry overlay the synthesizer
  // projects onto the historic row (mirroring `userTypeId → typeId`),
  // edited via the `linkLineItemsToHistoryEntry` action. Unlike `splits`,
  // line items are a PARTIAL allocation: they need not sum to `amount` and
  // do not change how the entry renders or contributes to the balance — the
  // single row still shows, with the line items attached as metadata. Absent
  // / empty means no line items. Independent of `splits`: a split entry can
  // still carry line items on the unsplit total.
  lineItems?: LineItemLink[];
  // Relative path (inside the active backend's `receipts/` folder) of the
  // single receipt file attached to this transaction — proof of the
  // purchase its line items describe, shared by every item they link.
  // Absent = no receipt. The file lives in the folder / cloud backend,
  // not in the budget JSON, so it does NOT travel through export / import
  // — only this reference does. `synthesizeHistoryRow` propagates it onto
  // the synthesized row's `Row.receiptPath`; it is edited through the
  // `linkLineItemsToHistoryEntry` action. Never written on the browser
  // (localStorage) backend (no receipts capability).
  receiptPath?: string;
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

// One imported bank transaction a cover transfer accounts for. References
// the entry by its owning account (`UserData.history[accountId]`) plus the
// entry id. Only imported transactions are coverable — manually-entered
// budget rows are not — so a `HistoryEntry` id is the only shape needed.
export type CoveredExpense = {
  accountId: string;
  entryId: string;
};

// Present only on a "cover transfer": a transfer the user creates to
// reimburse — from a savings / spending account — expenses they charged to
// the wrong account (typically a main card). Beyond the plain
// `fromAccountId → toAccountId` movement it records the user's free-text
// `motivation`, a short (≤ COVER_MESSAGE_MAX_CHARS) bank-reference `message`
// generated at creation time so the posted transfer can be matched back on
// the next import, and the specific imported transactions it covers. Absent
// ⇒ an ordinary transfer. The covered entries are NOT hidden (they stay
// visible in the ledger, flagged with a check glyph) — only the cover
// transfer's own legs get hidden once they post and are detected on import.
export type CoverDetails = {
  motivation: string;
  message: string;
  covered: CoveredExpense[];
};

// One transfer between two accounts. Stored at the UserData level so a
// transfer can exist for accounts without a budget attached — the
// Accounts sheet renders the global list, and budget views synthesize
// the involving rows for the account they track. `amount` is always
// positive; direction is `fromAccountId → toAccountId`.
//
// `fromAccountId` / `toAccountId` reference an `Account` OR a `Saving` — both
// keep their transactions under their id in `UserData.history`, so either can
// be an endpoint. Savings only ever appear as the source of a cover transfer
// today, but the field is deliberately id-only (no kind tag) so name / glyph
// resolution stays a single lookup across the merged account+saving map.
export type Transfer = {
  id: string;
  date: string;
  description: string;
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  typeId?: string | null;
  completed?: boolean;
  // Set only on cover transfers — see `CoverDetails`. Absent ⇒ ordinary
  // transfer minted from the transfer modal or the auto-collapse flow.
  cover?: CoverDetails;
};
