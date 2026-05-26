import type { Widen } from "./_widen";

const bulkBar = {
  selectedCount: "{n} selected",
  selectedSuffix: "selected",
  edit: "Edit",
  editSelected: "Edit selected",
  delete: "Delete",
  deleteSelected: "Delete selected",
  move: "Move",
  moveSelected: "Move selected to another month",
  copy: "Copy",
  copySelected: "Copy selected to other months",
  moveCopy: "Move / copy",
  makeRecurring: "Make recurring",
  clear: "Clear selection",
  cancel: "Cancel",
  cancelSelection: "Cancel selection",
} as const;

export type BulkBarCatalog = Widen<typeof bulkBar>;

export default bulkBar;
