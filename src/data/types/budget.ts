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
  // Override the fiscal month this row is grouped into. `+1` lifts the
  // row into the next fiscal bucket; `-1` drops it into the previous
  // one. Used when a "great income of the month" lands a few days early
  // (e.g. payday on the 25th arriving on the 22nd due to a weekend) and
  // should still count statistically as the next month's income. The
  // grouping pipeline cascades the shift to every other row dated the
  // same day so transfers + same-day expenses ride along automatically;
  // only the anchor row carries the explicit field.
  fiscalMonthShift?: -1 | 1;
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
  // Runtime-only markers populated by `synthesizeTransferRow` when a
  // Transfer is interleaved into a budget view. Never persisted —
  // synthesized rows live outside `item.rows` (the budget view merges
  // them in at render time), and the validator/schema do not list
  // these fields. The cell renderer reads them to disable inline
  // editing, swap the row glyph, and offer the transfer-edit modal
  // in place of the usual delete/recurring actions.
  transferId?: string;
  peerAccountId?: string;
  peerAccountName?: string;
  // Runtime-only marker populated by `synthesizeHistoryRow` when an
  // imported bank-statement entry is projected into a budget view.
  // Like the transfer markers, this is never persisted — history
  // rows live in `UserData.history`, not in `item.rows`. The cell
  // renderer reads it to disable inline editing and surface a
  // "promote to recurring" action in place of the usual edit dialog.
  historyEntryId?: string;
  // Runtime-only marker populated by `synthesizeHistoryRow` when the
  // resolved description in `cells[descColumnId]` is a fallback
  // (company / type / bank text) — i.e. the underlying HistoryEntry
  // has no userDescription / rule.description / hint.description
  // override. Carries the raw bank text so the description cell can
  // (a) render the fallback in italic + glyph color, signalling that
  // the row has no user-authored description, and (b) seed the inline
  // editor with an empty textarea + this string as the placeholder
  // when the user opens it to type a real description. Undefined on
  // every other row (regular budget rows, transfers, splits, and
  // history rows whose underlying entry already has an override).
  descriptionPlaceholder?: string;
  // Runtime-only carrier for the underlying bank entry's raw memo on
  // history rows where the user (or a rule / hint) has overridden it
  // — i.e. the inverse of `descriptionPlaceholder`. The description
  // popover renders this as a read-only "original from bank" line
  // beneath the textarea so the user can still see what the bank
  // reported even after relabelling the row. Skipped when the bank
  // text is already serving as the cell's display value (covered by
  // `descriptionPlaceholder`) and on every non-history row.
  bankDescription?: string;
  // Optional dynamic amount: a small formula string whose evaluation
  // produces this row's effective amount at render time. When set, it
  // overrides the numeric value in `cells[amountColumnId]` (which is
  // still written as a best-effort preview cache). Stored in the
  // canonical id-keyed form — any `sheet("…")` reference holds the
  // target sheet's id, not its mutable display name, so renames don't
  // break formulas. The amount column becomes read-only for rows that
  // carry a formula; editing flows through the BudgetComplexEntryModal.
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
  // Synthesized transfer rows (those carrying `peerAccountId`) are
  // implicitly transfers and don't need this flag set.
  isTransfer?: boolean;
  // True when the user has manually assigned `typeId` for this row
  // (via the type cell picker, the edit-row modal, or any other
  // explicit choice). Locks the row out of automatic pattern-driven
  // type assignment so a later description edit can't silently
  // overwrite a deliberate label. Cleared when the user clears the
  // typeId so a freshly-blank row can pick up a pattern again.
  typeIdLocked?: boolean;
  // Optional reference to a reusable `Company` in `UserData.companies`.
  // The "merchant" / "organisation" the entry transacts with — Fortum,
  // Ellevio, H&M. Sits between the row's free-text description and the
  // type chip: a row paying H&M might carry `typeId: accessories` plus
  // `companyId: hm`, with a free-form description like "Sunglasses" on
  // top. When no description is set, the description cell falls back
  // to the company name; when no company is set, it falls back to the
  // type name; absent both, to the raw bank text for history rows.
  companyId?: string;
  // Runtime-only mirror of `HistoryEntry.noCompany`, propagated by
  // `synthesizeHistoryRow` so the description popover's inline picker
  // can offer "Omit company" with the right initial state. Never
  // persisted on user-authored rows — only history-derived rows
  // carry it.
  noCompany?: boolean;
};
