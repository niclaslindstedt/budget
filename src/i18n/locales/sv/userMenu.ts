import type { UserMenuCatalog } from "../en/userMenu";

const userMenu: UserMenuCatalog = {
  label: "Användarmeny",
  signedInAs: "Inloggad som",
  signedInAsName: "Inloggad som {name}",
  guestMode: "Använder gästläge",
  guestNoAccount: "Inget konto",
  guestModeButton: "Använder gästläge — inget konto",
  guestModeHint: "Skapa ett konto för att låsa din budget bakom ett lösenord.",
  accountMenuLabel: "Kontomeny ({status})",
  settings: "Inställningar",
  signOut: "Logga ut",
  switchUser: "Byt användare",
  createAnother: "Skapa ytterligare konto",
  createAccount: "Skapa konto",
  clearData: "Rensa data",
  clearingData: "Rensar…",
  deleteThisAccount: "Ta bort detta konto",
  deletingAccount: "Tar bort…",
  clearGuestTitle: "Rensa gästdata?",
  deleteAccountTitle: "Ta bort konto?",
  clearGuestHint:
    "Detta tar permanent bort budgeten som lagrats i denna webbläsares gästsession.",
  deleteAccountHint:
    "Detta tar permanent bort {username} och den budgetdata som lagras under det här kontot på denna enhet.",
  confirmWithPassword: "Bekräfta med lösenord",
  openMenu: "Öppna användarmenyn",
  closeMenu: "Stäng användarmenyn",
};

export default userMenu;
