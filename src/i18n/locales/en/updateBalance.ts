import type { Widen } from "./_widen";

const updateBalance = {
  title: "Update balance",
  account: "Account",
  currentBalance: "Current balance",
  newBalance: "New balance",
  targetBalance: "Target balance",
  asOfDate: "As of",
  confirm: "Add correction",
  confirmUpdate: "Confirm balance update",
  noBudgetHint:
    "No budget sheet tracks this account yet. Add one (Sheet → Edit → pick this account) before recording a correction.",
  correctionHintPrefix: "Adds a balance correction of",
  correctionHintMiddle: "on",
  correctionHintEnd: "so the running balance lands on",
  alreadyAtBalance: "Already at this balance — nothing to record.",
} as const;

export type UpdateBalanceCatalog = Widen<typeof updateBalance>;

export default updateBalance;
