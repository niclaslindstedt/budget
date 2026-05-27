import type { Widen } from "./_widen";

const bulkBar = {
  selectedCount: "{n} selected",
  selectedSuffix: "selected",
  editSelected: "Edit selected",
  deleteSelected: "Delete selected",
  move: "Move",
  moveSelected: "Move selected to another month",
  copy: "Copy",
  copySelected: "Copy selected to other months",
  moveCopy: "Move / copy",
  makeRecurring: "Make recurring",
  clear: "Clear selection",
  cancelSelection: "Cancel selection",
} as const;

export type BulkBarCatalog = Widen<typeof bulkBar>;

export default bulkBar;
