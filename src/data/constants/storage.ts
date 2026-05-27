import { IS_PREVIEW } from "../../utils/build-env";

// Build-time namespace segment inserted into every persistence key,
// cloud path, and IndexedDB DB name when the bundle is the `/preview/`
// build. Production = "" (untouched legacy keys); preview = "preview".
// The single flag drives `nsKey` / `nsCloudPath` / `nsIdbName` so
// adding a new persisted surface only requires routing it through
// these helpers — no further wiring.
//
// Why this matters: the `/` slot serves the latest released tag and
// the `/preview/` slot serves current `main`. Without isolation, a
// visit to `/preview/` would migrate the shared localStorage / cloud
// file to the (possibly newer) preview schema; reloading `/` would
// then fail to read its own data. Namespacing every key keeps the
// two builds in completely separate worlds on the same machine and
// the same cloud account.
const STORAGE_NS = IS_PREVIEW ? "preview" : "";

// Insert the namespace segment after the leading "budget." in any
// storage key, e.g. "budget.users.v1" → "budget.preview.users.v1".
// Keys without that prefix pass through unchanged.
export function nsKey(key: string): string {
  if (!STORAGE_NS) return key;
  return key.replace(/^budget\./, `budget.${STORAGE_NS}.`);
}

// Prepend the namespace segment to a cloud-storage path so the
// preview build writes to a sibling location inside the same Dropbox
// app folder or GDrive root. e.g. "/budget.json" →
// "/preview/budget.json"; "/backups" → "/preview/backups". Paths that
// don't start with "/" (GDrive bare filenames) get the namespace as a
// filename suffix instead: "budget.json" → "budget-preview.json",
// "budget-backups" → "budget-preview-backups". Returns the path
// unchanged for the production build.
export function nsCloudPath(path: string): string {
  if (!STORAGE_NS) return path;
  if (path.startsWith("/")) return `/${STORAGE_NS}${path}`;
  // Bare filename / folder name: splice "-preview" before the
  // extension (or at the end if there's no extension).
  const dotIdx = path.lastIndexOf(".");
  if (dotIdx === -1 || path.indexOf("/") !== -1) {
    return `${path}-${STORAGE_NS}`;
  }
  return `${path.slice(0, dotIdx)}-${STORAGE_NS}${path.slice(dotIdx)}`;
}

// Suffix an IndexedDB database name with the namespace so the
// preview build opens a completely separate DB.
export function nsIdbName(name: string): string {
  if (!STORAGE_NS) return name;
  return `${name}-${STORAGE_NS}`;
}

// Legacy single-user bucket. Read only on first launch so data from
// before user accounts existed can be migrated into the first account
// that gets created; otherwise unused. The string value keeps its
// historical "budget.v1" prefix so existing installs still find it
// (production); the preview build sees "budget.preview.v1" via the
// `nsKey` namespace and never touches the production bucket.
export const STORAGE_KEY = nsKey("budget.v1");

// Registry of all accounts on this device, plus the id of whichever
// one is currently active. Plain JSON — usernames and password hashes
// (PBKDF2) are not secrets in the cryptographic sense. The preview
// build has its own registry under "budget.preview.users.v1", which
// starts empty.
export const USERS_KEY = nsKey("budget.users.v1");

// Per-user data bytes live under their own key so a delete leaves
// other users untouched and a future "switch account" stays a pure
// pointer flip. The key value retains the "budget.user." prefix for
// backwards compatibility with installs created before the type was
// renamed from Budget to UserData. The preview build prefixes
// "budget.preview.user.<id>" so its accounts (created in its own
// registry) cannot collide with production accounts.
export function userDataKey(userId: string): string {
  return nsKey(`budget.user.${userId}`);
}

// Device-local flags driving the Developer settings tab and the Logs
// tab. Stored outside `Settings` so they don't ride along in an
// export / import cycle — debug capture is per device, not per
// budget. Plain "true" / absent semantics; any other value is treated
// as absent. The logs blob lives under its own key so clearing it
// doesn't touch any other state.
export const DEV_MODE_KEY = nsKey("budget.devMode");
export const CAPTURE_LOGS_KEY = nsKey("budget.captureLogs");
export const LOGS_KEY = nsKey("budget.logs");

// Device-local sticky flag that hides the install hint after the user
// dismisses (or completes) the install once. Stored outside `Settings`
// because the hint is per-device (a desktop browser should not inherit
// a dismissal the user made on their iPhone) and because it is pure
// UI state, not budget data — it must not ride along in an export /
// import cycle. Value semantics: "1" = dismissed; absent = not
// dismissed yet. The storage string keeps its historical
// "iosInstallHintDismissed" name — the hint shipped iOS-only first
// and renaming the key would orphan early dismissals.
export const INSTALL_HINT_DISMISSED_KEY = nsKey(
  "budget.iosInstallHintDismissed",
);

// Ring-buffer cap for captured log entries. localStorage has a ~5 MB
// quota shared with budget data; 500 entries averaging a few hundred
// bytes each stays well inside that ceiling while giving a long
// enough tail for a typical mobile debugging session.
export const MAX_LOG_ENTRIES = 500;

// Per-user, per-device mirror of the active cloud backend. Holds the
// last bytes the cloud returned plus any offline edits that haven't
// pushed yet, so `withCloudMirror` can serve a snapshot on a cold
// load when the network is down. Keyed alongside the user's bucket
// so deleting a user wipes the mirror too. Preview build sees the
// `budget.preview.cloud-mirror.<id>` namespace.
export function cloudMirrorKey(userId: string): string {
  return nsKey(`budget.cloud-mirror.${userId}`);
}

// PBKDF2 parameters for the login password hash. Matches the data
// encryption module's iterations so an attacker sees no cheaper
// attack path; the salt is per-user, the iteration count is
// persisted on each user so a future bump can coexist with old
// records.
export const PASSWORD_HASH_ITERATIONS = 600_000;
export const PASSWORD_HASH_BITS = 256;
export const PASSWORD_SALT_BYTES = 16;

// Display name of the no-password "guest" account behind the
// "Continue without account" flow. Reserved — real accounts can't
// be created under this name while a default user is around.
export const DEFAULT_USERNAME = "Guest";
