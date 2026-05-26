import type { Widen } from "./_widen";

const userMenu = {
  label: "User menu",
  signedInAs: "Signed in as",
  signedInAsName: "Signed in as {name}",
  guestMode: "Using guest mode",
  guestNoAccount: "No account",
  guestModeButton: "Using guest mode — no account",
  guestModeHint: "Create an account to lock your budget behind a password.",
  accountMenuLabel: "Account menu ({status})",
  settings: "Settings",
  signOut: "Sign out",
  switchUser: "Switch user",
  createAnother: "Create another account",
  createAccount: "Create account",
  clearData: "Clear data",
  clearingData: "Clearing…",
  deleteThisAccount: "Delete this account",
  deletingAccount: "Deleting…",
  clearGuestTitle: "Clear guest data?",
  deleteAccountTitle: "Delete account?",
  clearGuestHint:
    "This permanently removes the budget stored in this browser's guest session.",
  deleteAccountHint:
    "This permanently removes {username} and the budget data stored under it on this device.",
  confirmWithPassword: "Confirm with password",
  openMenu: "Open user menu",
  closeMenu: "Close user menu",
} as const;

export type UserMenuCatalog = Widen<typeof userMenu>;

export default userMenu;
