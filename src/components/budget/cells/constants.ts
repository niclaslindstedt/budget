// Shared Tailwind class fragments used by every cell renderer.
//
// `CELL_BASE` is the bordered `<td>` shell every cell paints on top of.
// `INPUT_BASE` is the transparent textarea/input shell used by editable
// cells (date trigger, amount, description) so focus styling and resets
// stay aligned across cell types.

export const CELL_BASE =
  "border-r border-b border-line bg-surface last:border-r-0";

export const INPUT_BASE =
  "field-input w-full border-0 bg-transparent px-[var(--table-cell-px)] py-[var(--table-cell-py)] font-mono text-inherit outline-none";
