import type { Widen } from "./_widen";

const items = {
  // ItemPicker
  pickItemEllipsis: "Pick an item…",
  noItemsYet: "No items yet.",
  clearItem: "Clear item",
  newItem: "New item",
  itemName: "Name",
  itemNamePlaceholder: "iPhone 15 Pro",
  subtypeOptional: "Subtype (optional)",
  // SubtypePicker
  pickSubtypeEllipsis: "Pick a subtype…",
  noSubtypesYet: "No subtypes yet.",
  clearSubtype: "Clear subtype",
  newSubtype: "New subtype",
  subtypeName: "Name",
  subtypeNamePlaceholder: "Laptop",
  subtypeDuplicateName:
    "A subtype with this name already exists under that type.",
  parentType: "Type",
  parentTypePlaceholder: "Pick a type…",
  // Shared
  create: "Create",
  // Line-items modal
  lineItemsTitle: "Line items",
  lineItemsIntro:
    "Tie part of this purchase to items you own. Anything you don't allocate stays as a remainder.",
  purchase: "Purchase",
  item: "Item",
  lineN: "Item {n}",
  removeLine: "Remove item",
  lineAmount: "Amount",
  lineNote: "Note (optional)",
  lineNotePlaceholder: "e.g. with AppleCare",
  addLine: "Add item",
  remainder: "Remainder",
  remainderZero: "Fully allocated",
  remainderHint: "The unallocated amount is left as a remainder.",
  remainderOver: "The line items exceed the purchase total.",
  needItemAndAmount: "Each line item needs both an item and an amount.",
  button: "Save",
  buttonDisabled: "Finish or clear the half-filled line item first.",
  // Edit-item modal
  editItemTitle: "Edit item",
  newItemTitle: "New item",
  purchasePrice: "Purchase price",
  purchasePricePlaceholder: "e.g. 12 000",
  linkedTotal: "Linked line items: {amount}",
  acquiredAt: "Acquired",
  depreciates: "Depreciates over time",
  ratePerYear: "Rate per year (%)",
  ratePerYearPlaceholder: "e.g. 20",
  depreciationFloor: "Value floor (optional)",
  resaleValue: "Resale value",
  disposed: "Sold or disposed",
  disposedAt: "Date",
  soldFor: "Sold for",
  itemNote: "Note",
  itemNotePlaceholder: "e.g. serial number, condition",
  deleteItem: "Delete item",
  deleteItemConfirm:
    "Delete this item? Its line-item links will be removed from every entry.",
  editItemAria: "Edit {name}",
  save: "Save",
  // Receipt section in the edit-item modal
  receipt: "Receipt",
  receiptUpload: "Upload receipt",
  receiptReplace: "Replace receipt",
  receiptView: "View",
  receiptRemove: "Remove",
  receiptUploading: "Uploading…",
  receiptUnsupported:
    "Receipts need the local-folder or a cloud storage backend. Switch backends in Settings → Storage to attach one.",
  receiptError: "Could not save the receipt. Please try again.",
  receiptMissing: "Receipt file not found on this storage.",
  // Subfolder name used by the type-folder naming pattern when an item
  // has no type set.
  receiptUncategorized: "Uncategorized",
  // Find items modal (scan bank history for likely purchases)
  find: {
    menu: "Find items",
    title: "Find items",
    intro:
      "These transactions look like item purchases. Add line items to catalogue what you bought, skip for now, ignore a single entry, or exclude every similar transaction at once.",
    empty:
      "No likely item purchases found. Adjust the amount or type filter in Settings → Items, or import more history.",
    addLineItems: "Add line items",
    skip: "Skip for now",
    ignore: "Ignore this transaction",
    excludeSimilar: "Exclude similar transactions",
    excludeSimilarHint:
      "Exclude every transaction with a similar description from now on",
    linkedCount: "{n} linked",
  },
} as const;

export type ItemsCatalog = Widen<typeof items>;

export default items;
