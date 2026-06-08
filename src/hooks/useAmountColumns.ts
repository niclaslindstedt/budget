// Single source of truth for how every sheet's money columns align —
// budget (amount / balance), accounts (balance), items (price / value),
// and salary (gross / tax / net). The four sheet tables used to hardcode
// their own alignment (budget / accounts right, items / salary left),
// which drifted as each page was touched. They now read it from here.
//
// `ALIGNMENT` is a deliberate code-level knob, not a user setting: flip
// this one constant and every sheet swaps between right- and left-aligned
// figures (and their header glyphs) in a single edit. Right is the
// default — it matches the budget ledger's classic decimal-aligned
// scanning, where the ones digit lines up down the column.
//
// Exposed through a hook (rather than a bare constant) so call sites read
// `const { cellClass } = useAmountColumns()` like any other styling hook,
// and so the seam is ready if alignment ever does become settings-driven
// — only this file would change, not the dozen cell / header call sites.

import type { CSSProperties } from "react";

export type AmountAlignment = "left" | "right";

export const ALIGNMENT: AmountAlignment = "right";

const RIGHT = ALIGNMENT === "right";

// Horizontal breathing room inside a money column, expressed in character
// widths. The app's face is monospaced, so a `ch` gutter scales with the
// user's chosen font size and keeps right-aligned figures in adjacent
// columns from crowding each other. Like `ALIGNMENT`, this is a single
// code-level knob (not a user setting): bump this one number and every
// money column that spreads `padStyle` loosens together. Tailwind can't
// JIT a class built from a runtime value, so the gutter is exposed as a
// ready-to-spread inline style rather than a `px-[…]` class.
export const PAD_CHARS = 1.25;

// Frozen so a component can hold the reference across renders without it
// ever counting as a changed dependency.
const AMOUNT_COLUMNS = Object.freeze({
  alignment: ALIGNMENT,
  // Money `<td>` class. `text-*` aligns the figure in the desktop
  // table-cell; `justify-*` aligns it in the mobile per-row flex grid
  // (where the cell is `display: flex` and text-align alone wouldn't
  // move the flex item). Both are needed — each takes effect in its own
  // layout.
  cellClass: RIGHT ? "text-right justify-end" : "text-left justify-start",
  // Money `<th>` text-align for the desktop table header.
  headerClass: RIGHT ? "text-right" : "text-left",
  // Tailwind `justify-*` for a money `<th>`'s glyph (+ label) flex row,
  // so the header glyph sits over the figure it labels on mobile.
  headerJustifyClass: RIGHT ? "justify-end" : "justify-start",
  // The gutter from `PAD_CHARS`, as a number (for callers that want to
  // size a track from it) and as an inline style ready to spread onto a
  // money `<th>` / `<td>` in place of a `px-*` class.
  padChars: PAD_CHARS,
  padStyle: { paddingInline: `${PAD_CHARS}ch` } as CSSProperties,
});

export type AmountColumns = typeof AMOUNT_COLUMNS;

export function useAmountColumns(): AmountColumns {
  return AMOUNT_COLUMNS;
}
