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
} as const;

export type ItemsCatalog = Widen<typeof items>;

export default items;
