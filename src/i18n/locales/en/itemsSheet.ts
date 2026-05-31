import type { Widen } from "./_widen";

const itemsSheet = {
  title: "Items",
  name: "Name",
  purchased: "Purchased",
  purchaseValue: "Bought for",
  currentValue: "Worth now",
  actions: "Actions",
  addItem: "Add item",
  total: "Total",
  noItems: "No items yet. Add one with the button below.",
  glyphLabel: "{name} icon",
  editItemAria: "Edit {name}",
  editItemTitle: "Edit item",
  deleteItemAria: "Delete {name}",
  deleteItemTitle: "Delete item",
  showDescriptionAria: "Show description for {name}",
} as const;

export type ItemsSheetCatalog = Widen<typeof itemsSheet>;

export default itemsSheet;
