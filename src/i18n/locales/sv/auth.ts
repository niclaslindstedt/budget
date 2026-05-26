import type { AuthCatalog } from "../en/auth";

const auth: AuthCatalog = {
  welcomeTitle: "Välkommen — skapa ditt konto",
  welcomeHint: "Välj användarnamn och lösenord för att kryptera din data.",
  signIn: "Logga in",
  signingIn: "Loggar in…",
  signOut: "Logga ut",
  continueWithoutAccount: "Fortsätt utan konto",
  continueAsGuest: "Fortsätt som gäst",
  loading: "Laddar…",
  privacyHint:
    "Din budget är privat för ditt konto och krypterad på denna enhet.",
  creatingAccount: "Skapar…",
  username: "Användarnamn",
  password: "Lösenord",
  confirmPassword: "Bekräfta lösenord",
  showPassword: "Visa lösenord",
  hidePassword: "Dölj lösenord",
  createAccount: "Skapa konto",
  createAccountTitle: "Skapa konto",
  newAccountHint:
    "Välj ett användarnamn och ett starkt lösenord — minst {min} tecken. Din budget krypteras med detta lösenord; om du glömmer det kan datan på denna enhet inte återställas.",
  guestImportHint: "Din gästsessions budget flyttas in i detta konto.",
  importLegacyLabel: "Importera befintlig budget på denna enhet",
  importLegacyHint:
    "En budget från innan konton infördes hittades. Ta med den till det nya kontot.",
  accountTaken: "Användarnamnet används redan.",
  noAccount: "Inget konto med det namnet på denna enhet.",
  useAtLeast: "Använd minst {min} tecken.",
  passwordsMismatch: "Lösenorden stämmer inte överens.",
  invalidCredentials: "Fel användarnamn eller lösenord.",
  rememberOnDevice: "Håll mig inloggad på den här enheten",
  forgotPassword: "Glömt lösenord?",
  noResetHint:
    "Din data är krypterad på din enhet. Det går inte att återställa.",
  switchUser: "Byt användare",
  existingUser: "Befintlig användare",
  newUser: "Ny användare",
  addUser: "Lägg till användare",
  alreadyHaveAccount: "Jag har redan ett konto",
  createNewAccount: "Skapa ett nytt konto",
  chooseStorage: "Välj var din budget ska lagras",
  pickUser: "Välj en användare",
  deleteUser: "Ta bort användare",
  deleteUserConfirm:
    "Ta bort {name}? Deras sparade budget tas bort från den här enheten.",
  encryptionOff: "Kryptering av",
  encryptionOn: "Kryptering på",
  encryptedStorage: "Krypterad lagring",
  unencryptedStorage: "Okrypterad lagring",
  weakPassword: "Välj ett längre lösenord.",
};

export default auth;
