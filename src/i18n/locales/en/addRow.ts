import type { Widen } from "./_widen";

const addRow = {
  button: "Add row",
  ariaLabel: "Add row (long-press for recurring or categorised entry)",
  longPressHint: "Long-press for more",
} as const;

export type AddRowCatalog = Widen<typeof addRow>;

export default addRow;
