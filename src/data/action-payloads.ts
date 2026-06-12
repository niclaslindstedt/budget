// Action payloads — pure data shapes the reducer consumes from the
// modal-driven UI. Defined here (in `data/`) rather than alongside the
// modals that emit them so the reducer can import them without dragging
// a runtime dependency from `data/` into `components/`. The matching
// modal files in `src/components/` re-export each type for callers that
// still grab it from the modal's own surface.

import type { SheetGlyph, SheetType } from "./types";

export type SheetDraft = {
  name: string;
  type: SheetType;
  glyph: SheetGlyph;
  color: string;
  description: string;
  // Type-specific payload. Today only `budget` exists and carries an
  // optional account id; future flavours can grow their own branches
  // without affecting the existing shape.
  accountId: string | null;
  // The tax profile bound to a salary sheet's `salaryView` item. `null`
  // = no profile (don't estimate gross). Ignored for non-salary sheets.
  taxProfileId: string | null;
  // The base budget bound to a scenarios sheet's `scenariosView` item.
  // `null` = no base yet (the page opens its picker). Ignored for
  // non-scenarios sheets. Applying a change goes through the
  // `setScenariosBaseSheet` action, which clears every scenario's
  // deltas — the modal warns before save.
  baseSheetId: string | null;
  // When set, the parent should mint a new Account by this name and
  // attach it to the budget. Lets the user create both a sheet and
  // the account it lives on in a single round-trip through the
  // modal.
  newAccountName: string | null;
};

export type BulkPatch = {
  // `undefined` = don't touch; `null` (where applicable) = clear.
  typeId?: string | null;
  companyId?: string | null;
  amount?: number;
  date?: string;
  // `true` flags every row as an inter-account transfer; `false`
  // clears the flag on every row; `undefined` leaves it alone.
  isTransfer?: boolean;
  // `undefined` = leave each row's tags alone; an array replaces every
  // selected row's `tagIds` with this set (empty array clears tags).
  tagIds?: string[];
};

export type EditPatch = {
  description: string;
  amount: number | null;
  // `undefined` = don't touch the row's type; `null` = clear it (the
  // row falls back to its description as the primary label); a string
  // sets the typeId.
  typeId?: string | null;
  // Same shape as `typeId`, applied to the row's `companyId`.
  companyId?: string | null;
  // `undefined` = leave the row's tags alone; an array replaces the
  // row's `tagIds` with this set (empty array clears tags).
  tagIds?: string[];
  // `undefined` = don't touch; `true` flags every row in scope as an
  // inter-account transfer (so `hideTransfers` can suppress it);
  // `false` clears the flag.
  isTransfer?: boolean;
  // Signed day-offset applied to every row in the edit scope; lets the
  // user nudge a series whose original anchor day was off by a few
  // days (e.g. recurring landed on day 24 instead of 25). Omitted or
  // 0 leaves dates untouched.
  dateShiftDays?: number;
  // Optional signed amount range for an "estimate" row. `undefined`
  // leaves the row's range untouched; `null` clears it back to an exact
  // row; a number sets that bound. Both bounds move together — the
  // modal only ever sends both numbers or both nulls.
  amountMin?: number | null;
  amountMax?: number | null;
};

export type EditScope =
  | { kind: "just-this" }
  | { kind: "future"; untilIso: string | null }
  // Whole-series scope. Reserved for cosmetic fields (description, type)
  // — the modal disables the amount input under this scope because
  // touching the amount on past, already-reconciled occurrences would
  // silently rewrite history.
  | { kind: "all" };

export type ComplexEntryDraft = {
  description: string;
  amount: number;
  // `null` = no type assigned (row falls back to its description as
  // the primary label); a string stamps every generated row with that
  // typeId so the cell renders the type's chip in the description
  // column.
  typeId: string | null;
  // Optional company id stamped on every generated row alongside the
  // type. `null` (or absent) leaves the row's `companyId` blank.
  companyId?: string | null;
  // Optional tag ids stamped on every generated row. Absent (or an
  // empty array) leaves the row's `tagIds` unset.
  tagIds?: string[];
  // When true, every generated row is flagged as an inter-account
  // transfer so the `hideTransfers` setting can suppress it.
  isTransfer?: boolean;
  // When set, every generated row lands with this completed state.
  // Absent falls back to the per-date default (`defaultCompletedForDate`)
  // so callers that don't carry the flag keep the old behaviour.
  completed?: boolean;
  dates: string[];
  // Optional formula string in the canonical stored form (any
  // `sheet("…")` reference holds the target's stable id, not its
  // display name). When present, the dispatcher attaches it to each
  // generated row's `amountFormula`; the renderer recomputes the
  // effective amount on every render. `amount` still carries a
  // numeric preview for the cached cell so older builds without
  // formula support see a sensible static fallback.
  amountFormula?: string;
  // Optional signed amount range for an "estimate" row. When both are
  // present, every generated row gets `amountMin` / `amountMax` set
  // (the estimate stays in `amount`). Mutually exclusive with
  // `amountFormula` — a formula row computes its amount dynamically.
  amountMin?: number;
  amountMax?: number;
};

export type SplitSubmission = {
  description: string;
  amount: number;
  typeId: string | null;
  companyId?: string | null;
};
