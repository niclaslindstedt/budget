import type { Widen } from "./_widen";

const transfer = {
  title: "Transfer",
  titleEdit: "Edit transfer",
  titleNew: "New transfer",
  date: "Date",
  description: "Description",
  descriptionPlaceholder: "What is this transfer for?",
  amount: "Amount",
  transfer: "Transfer",
  from: "From",
  to: "To",
  type: "Type",
  swap: "Swap from and to accounts",
  needTwoAccounts: "A transfer needs two different accounts.",
  markAsDone: "Mark as done",
  pickAccount: "Pick an account",
  deleteTitle: "Delete transfer?",
  deleteHint: "The two bank entries it collapsed will come back.",
  isTransfer: "This is a transfer between two accounts",
  importedLockedHint:
    "Imported from bank history — date, amount, and accounts are locked. Uncheck the transfer toggle to expose the two original bank entries.",
  uncollapseTitle: "Mark as non-transfer?",
  uncollapseHint:
    "The two bank entries it collapsed will reappear in their respective accounts. Any description or type you set on the transfer is discarded — those describe the merged transfer, not the underlying bank entries.",
  uncollapseConfirm: "Mark as non-transfer",
} as const;

export type TransferCatalog = Widen<typeof transfer>;

export default transfer;
