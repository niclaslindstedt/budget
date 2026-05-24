// Shared Tailwind class fragments used by every cell renderer.
//
// `CELL_BASE` is the bordered `<td>` shell every cell paints on top of.
// `INPUT_BASE` is the transparent textarea/input shell used by editable
// cells (date trigger, amount, description) so focus styling and resets
// stay aligned across cell types.
//
// The vertical column divider is no longer baked in here: it's painted
// by an unlayered rule in `src/styles.css` keyed off
// `:root[data-column-borders="true"]` so the "Show column borders"
// Appearance toggle drives both the budget sheet and the accounts
// transfer table without a per-cell class flip.

export const CELL_BASE = "border-b border-line bg-surface";

export const INPUT_BASE =
  "field-input w-full border-0 bg-transparent px-2.5 py-2 font-mono text-inherit outline-none";
