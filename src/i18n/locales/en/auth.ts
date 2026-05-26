import type { Widen } from "./_widen";

const auth = {
  welcomeTitle: "Welcome — create your account",
  welcomeHint: "Choose a username and password to encrypt your data.",
  signIn: "Sign in",
  signingIn: "Signing in…",
  signOut: "Sign out",
  continueWithoutAccount: "Continue without account",
  continueAsGuest: "Continue as guest",
  loading: "Loading…",
  privacyHint:
    "Your budget is private to your account and encrypted on this device.",
  creatingAccount: "Creating…",
  username: "Username",
  password: "Password",
  confirmPassword: "Confirm password",
  showPassword: "Show password",
  hidePassword: "Hide password",
  createAccount: "Create account",
  createAccountTitle: "Create account",
  newAccountHint:
    "Pick a username and a strong password — at least {min} characters. Your budget is encrypted with this password; if you forget it the data on this device cannot be recovered.",
  guestImportHint:
    "Your guest session's budget will be moved into this account.",
  importLegacyLabel: "Import existing budget on this device",
  importLegacyHint:
    "A budget from before accounts were introduced was found. Bring it into this new account.",
  accountTaken: "That username is already in use.",
  noAccount: "No account with that name on this device.",
  useAtLeast: "Use at least {min} characters.",
  passwordsMismatch: "Passwords do not match.",
  invalidCredentials: "Wrong username or password.",
  rememberOnDevice: "Keep me signed in on this device",
  forgotPassword: "Forgot password?",
  noResetHint: "Your data is encrypted on your device. There is no reset.",
  switchUser: "Switch user",
  existingUser: "Existing user",
  newUser: "New user",
  addUser: "Add user",
  alreadyHaveAccount: "I already have an account",
  createNewAccount: "Create a new account",
  chooseStorage: "Choose where to store your budget",
  pickUser: "Pick a user",
  deleteUser: "Delete user",
  deleteUserConfirm:
    "Delete {name}? Their stored budget will be removed from this device.",
  encryptionOff: "Encryption off",
  encryptionOn: "Encryption on",
  encryptedStorage: "Encrypted storage",
  unencryptedStorage: "Unencrypted storage",
  weakPassword: "Pick a longer password.",
} as const;

export type AuthCatalog = Widen<typeof auth>;

export default auth;
