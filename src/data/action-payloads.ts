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
  // When set, the parent should mint a new Account by this name and
  // attach it to the budget. Lets the user create both a sheet and
  // the account it lives on in a single round-trip through the
  // modal.
  newAccountName: string | null;
};

export type BulkPatch = {
  // `undefined` = don't touch; `null` (where applicable) = clear.
  typeId?: string | null;
  amount?: number;
  date?: string;
  // `true` flags every row as an inter-account transfer; `false`
  // clears the flag on every row; `undefined` leaves it alone.
  isTransfer?: boolean;
};

export type EditPatch = {
  description: string;
  amount: number | null;
  // `undefined` = don't touch the row's type; `null` = clear it (the
  // row falls back to its description as the primary label); a string
  // sets the typeId.
  typeId?: string | null;
};

export type EditScope =
  | { kind: "just-this" }
  | { kind: "future"; untilIso: string | null };

export type ComplexEntryDraft = {
  description: string;
  amount: number;
  // `null` = no type assigned (row falls back to its description as
  // the primary label); a string stamps every generated row with that
  // typeId so the cell renders the type's chip in the description
  // column.
  typeId: string | null;
  dates: string[];
  // Optional formula string in the canonical stored form (any
  // `sheet("…")` reference holds the target's stable id, not its
  // display name). When present, the dispatcher attaches it to each
  // generated row's `amountFormula`; the renderer recomputes the
  // effective amount on every render. `amount` still carries a
  // numeric preview for the cached cell so older builds without
  // formula support see a sensible static fallback.
  amountFormula?: string;
};

export type SplitSubmission = {
  description: string;
  amount: number;
  typeId: string | null;
};
