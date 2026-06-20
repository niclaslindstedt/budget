import type { Widen } from "./_widen";

const splitRow = {
  title: "Split entry",
  intro:
    "Carve this entry into separate parts — useful when one payment " +
    "covers several different things (mortgage interest vs. " +
    "amortization, a bankgiro that paid for groceries and insurance " +
    "in one go, etc.). Each split becomes its own row on the same date.",
  original: "Original",
  splits: "Splits",
  splitN: "Split {n}",
  description: "Description",
  descriptionPlaceholder: "What is this part for?",
  amount: "Amount",
  type: "Type",
  company: "Company",
  addSplit: "Add another split",
  removeSplit: "Remove this split",
  remainder: "Remainder",
  remainderZero: "Everything is split — no remainder.",
  remainderHint:
    "What's left over stays on the original row and is pushed to the " +
    "bottom of the list.",
  remainderOpposite:
    "The splits add up to more than the original. The leftover will " +
    "be the opposite sign of the original.",
  button: "Split",
  buttonDisabled: "Add at least one split",
  needDescAndAmount: "Fill in description and amount on each split.",
  revert: "Revert split",
  revertTitle:
    "Drop the split and show the entry as the bank originally reported it.",
  cell: "Split entry",
  cellTitle: "Split this entry into separate parts",
  cantSplit: "This row can't be split",
} as const;

export type SplitRowCatalog = Widen<typeof splitRow>;

export default splitRow;
