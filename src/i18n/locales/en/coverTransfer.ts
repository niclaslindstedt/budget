import type { Widen } from "./_widen";

const coverTransfer = {
  // Create modal
  createTitle: "Cover with a transfer",
  createHint:
    "Reimburse these expenses from another account. We'll total them and generate a short message to put on the transfer so it can be matched back when you import your bank later.",
  motivationLabel: "Motivation",
  motivationPlaceholder: "Why are you covering these? (e.g. kids' clothes)",
  fromLabel: "Cover from",
  fromPlaceholder: "Select an account",
  accountsGroup: "Accounts",
  savingsGroup: "Savings accounts",
  totalLabel: "Total",
  coveringOne: "Covering {n} transaction",
  coveringOther: "Covering {n} transactions",
  create: "Create cover transfer",
  sameAccountError: "All covered transactions must be on the same account.",
  noFromError: "Pick the account to transfer from.",
  // Info modal
  infoTitle: "Cover transfer",
  amountToTransfer: "Amount to transfer",
  messageLabel: "Message",
  copyAmount: "Copy amount",
  copyMessage: "Copy message",
  copied: "Copied",
  instructions:
    "Make this transfer in your bank using the amount and message above. It's detected automatically on your next import.",
  motivationHeading: "Motivation",
  coveredHeading: "Covered transactions",
  routeLabel: "From → To",
  statusPending: "Not transferred yet",
  statusCompleted: "Transferred",
  // Toolbar + row affordances
  coverAction: "Cover",
  coverSelected: "Cover selected transactions",
  menuCover: "Cover with transfer",
  coveredGlyphTitle: "Accounted for by a cover transfer — tap for details",
  openInfo: "Show cover transfer details",
} as const;

export type CoverTransferCatalog = Widen<typeof coverTransfer>;

export default coverTransfer;
