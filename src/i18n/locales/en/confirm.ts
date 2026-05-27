import type { Widen } from "./_widen";

const confirm = {
  title: "Are you sure?",
  confirm: "Confirm",
  confirmDelete: "Yes, delete",
  confirmDiscard: "Yes, discard",
  deleteRow: "Delete row",
  deleteRecurring: "Delete recurring entry",
  deleteRecurringHint:
    "This entry is part of a recurring series. How much should be removed?",
  deleteRecurringStopAfter: "Stop after a date",
  deleteRowHint: "This row will be permanently removed.",
  deleteSelectedHintOne: "{n} row will be permanently removed.",
  deleteSelectedHintOther: "{n} rows will be permanently removed.",
  deleteSheetHint:
    "{name} and all of its rows will be permanently removed. This can't be undone.",
  deleteAccountHint:
    "{name} will be permanently removed, along with its transfers and bank history. Sheets attached to it will be detached. This can't be undone.",
  correctionRemoveHint:
    "The {delta} correction will be removed and the running balance will revert.",
  signOutWarningOne:
    "For your security, you'll be signed out in {n} second unless you stay signed in.",
  signOutWarningOther:
    "For your security, you'll be signed out in {n} seconds unless you stay signed in.",
  stayActive: "Stay signed in",
} as const;

export type ConfirmCatalog = Widen<typeof confirm>;

export default confirm;
