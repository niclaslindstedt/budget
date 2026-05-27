import { useCallback, useMemo, useRef, useState } from "react";

import { AuthScreen } from "./components/AuthScreen";
import { AppShell } from "./components/AppShell";
import type {
  AppShellAuth,
  AppShellStorage,
} from "./components/AppShell/types";
import {
  CloudLinkDialog,
  FolderLinkDialog,
} from "./components/CloudLinkDialog";
import { unlock } from "./data/achievements";
import { STORAGE_KEY } from "./data/constants/storage";
import type { StoredUser, UserData } from "./data/types";
import { type AuthState, readBootAuth } from "./storage/boot-auth";
import { clearCloudOfflineMode } from "./storage/backend-preference";
import { encryptText, isEncryptedEnvelope } from "./storage/crypto";
import { isFolderBackendAvailable } from "./storage/folder-handle-store";
import {
  clearCloudMirrorBytes,
  clearUserDataBytes,
  readUserDataBytes,
  writeUserDataBytes,
} from "./storage/idb-adapter";
import { clearRawStorage, readRawStorage } from "./storage/local-adapter";
import { clearSession, saveSession } from "./storage/session";
import { useStorageBackend } from "./storage/useStorageBackend";
import {
  createDefaultUser,
  createUser,
  findDefaultUser,
  saveUsersFile,
  verifyPassword,
} from "./storage/users";

export function App() {
  // Compute boot state exactly once — the result feeds `useState` and
  // `useRef` initial values below, and we don't want to re-read
  // sessionStorage on every render.
  const bootRef = useRef<ReturnType<typeof readBootAuth> | null>(null);
  if (bootRef.current === null) bootRef.current = readBootAuth();
  const boot = bootRef.current;

  const [users, setUsers] = useState<StoredUser[]>(boot.users);

  const [auth, setAuth] = useState<AuthState>(boot.auth);

  // Whether any plaintext pre-account data is sitting in the legacy
  // `STORAGE_KEY` bucket. Detected once at mount and offered to the
  // first account that gets created. Encrypted legacy envelopes are
  // ignored — we don't have the old password to unwrap them, so the
  // user has to recover that data via Import after signing in.
  const legacyBudgetAvailable = useMemo(() => {
    const legacy = readRawStorage(STORAGE_KEY);
    return Boolean(legacy && !isEncryptedEnvelope(legacy));
  }, []);

  // Held password for the active user. Read by the encrypting adapter
  // on every save / load; cleared whenever auth flips to signed-out.
  // Seeded from the boot session so the encrypting adapter can decrypt
  // straight away after a refresh that restored a cached password.
  const passwordRef = useRef<string | null>(
    boot.auth.kind === "signed-in" ? boot.auth.password : null,
  );

  // Mirror of AppShell's in-memory `UserData` so the OAuth-completion
  // and conflict-resolution paths can push the user's current budget
  // into a freshly-linked cloud backend. AppShell updates this on
  // every render — see the `useEffect` near `useUserDataStorage` — and
  // null means "no budget loaded yet" (e.g. between mount and the
  // first async load on a cloud adapter).
  const currentDataRef = useRef<UserData | null>(null);

  // Per-user backend / token / encryption state + handlers. The hook
  // owns every storage-backend concern (which backend is active, OAuth
  // tokens, folder handle, cloud-mirror opt-in, pending link
  // confirmations) and returns the live `StorageAdapter` for the
  // active user, so `App.tsx` only has to forward the result down.
  const storage = useStorageBackend({
    auth,
    passwordRef,
    currentDataRef,
  });
  const {
    adapter,
    backend,
    dropboxConnected,
    gdriveConnected,
    folderConnected,
    folderReconnectNeeded,
    encryption,
    cloudOfflineMode,
    pendingCloudLink,
    pendingFolderLink,
    applySignedInUser,
  } = storage;

  const persistRegistry = useCallback(
    (nextUsers: StoredUser[], activeUserId: string | null) => {
      saveUsersFile({ version: 1, users: nextUsers, activeUserId });
    },
    [],
  );

  const handleSignIn = useCallback(
    async (user: StoredUser, password: string) => {
      const ok = await verifyPassword(user, password);
      if (!ok) throw new Error("Wrong password");
      passwordRef.current = password;
      persistRegistry(users, user.id);
      saveSession(user.id, password);
      applySignedInUser(user);
      setAuth({ kind: "signed-in", user, password });
    },
    [users, persistRegistry, applySignedInUser],
  );

  const handleCreateAccount = useCallback(
    async (username: string, password: string, importLegacy: boolean) => {
      unlock("localHero");
      const user = await createUser(username, password);
      const existingDefault = findDefaultUser(users);
      const realUsers = users.filter((u) => !u.isDefault);
      // The first real account always absorbs the guest session's data
      // — that's the whole "first user consumes the default user" rule.
      // Bytes live in plaintext under `userDataKey(defaultUser.id)`;
      // re-wrap them under the new account's password so the rest of
      // the app sees a normal encrypted envelope from the first read.
      // Falls back to the legacy pre-account `STORAGE_KEY` migration
      // when no default user is around and the user opted in.
      if (existingDefault) {
        const guestBytes = await readUserDataBytes(existingDefault.id);
        if (guestBytes) {
          const envelope = await encryptText(guestBytes, password);
          await writeUserDataBytes(user.id, envelope);
        }
        await clearUserDataBytes(existingDefault.id);
      } else if (importLegacy && realUsers.length === 0) {
        const legacy = readRawStorage(STORAGE_KEY);
        // Only migrate plaintext legacy data — an encrypted envelope
        // would need the old password to decrypt and our migration
        // doesn't have it. The user can recover that data later via
        // the Import button, which prompts for it.
        if (legacy && !isEncryptedEnvelope(legacy)) {
          const envelope = await encryptText(legacy, password);
          await writeUserDataBytes(user.id, envelope);
          clearRawStorage(STORAGE_KEY);
        }
      }
      if (realUsers.length > 0) unlock("household");
      const nextUsers = [...realUsers, user];
      setUsers(nextUsers);
      persistRegistry(nextUsers, user.id);
      passwordRef.current = password;
      saveSession(user.id, password);
      // Sync the per-user backend / encryption preferences in the
      // same batch as the auth flip so the adapter useMemo rebuilds
      // with the right wrappers on the very first post-flip render.
      // Skipping this leaves a flash where the new user's encrypted
      // bytes are read through a plaintext adapter (from the guest
      // session's state) and momentarily render as a fresh budget.
      applySignedInUser(user);
      setAuth({ kind: "signed-in", user, password });
    },
    [users, persistRegistry, applySignedInUser],
  );

  const handleContinueWithoutAccount = useCallback(async () => {
    unlock("localHero");
    // Re-use an existing guest account if one is already in the
    // registry (e.g. user signed out then changed their mind). Only
    // mint a new one when there isn't one — keeps the data intact
    // across "sign out → continue without account" round trips.
    const existing = findDefaultUser(users);
    const user = existing ?? createDefaultUser();
    const nextUsers = existing ? users : [...users, user];
    if (!existing) {
      setUsers(nextUsers);
    }
    persistRegistry(nextUsers, user.id);
    passwordRef.current = "";
    saveSession(user.id, "");
    applySignedInUser(user);
    setAuth({ kind: "signed-in", user, password: "" });
  }, [users, persistRegistry, applySignedInUser]);

  const handleSignOut = useCallback(() => {
    passwordRef.current = null;
    clearSession();
    setAuth((prev) => {
      const lastUsername =
        prev.kind === "signed-in"
          ? prev.user.username
          : prev.kind === "signed-out"
            ? prev.lastUsername
            : null;
      return { kind: "signed-out", lastUsername };
    });
    persistRegistry(users, null);
  }, [users, persistRegistry]);

  const handleSwitchUser = useCallback(() => {
    // Same as sign-out but explicitly clears the "last user" hint so
    // the picker comes up blank instead of pre-filling the just-left
    // account.
    passwordRef.current = null;
    clearSession();
    setAuth({ kind: "signed-out", lastUsername: null });
    persistRegistry(users, null);
  }, [users, persistRegistry]);

  const handleStartCreateAccountFromMenu = useCallback(() => {
    // The auth screen detects an empty username hint and lands on the
    // sign-up form when no users exist; we surface that affordance
    // here too by signing out + setting the hint to null.
    passwordRef.current = null;
    clearSession();
    setAuth({ kind: "signed-out", lastUsername: null });
    persistRegistry(users, null);
  }, [users, persistRegistry]);

  const handleDeleteAccount = useCallback(
    async (password: string) => {
      if (auth.kind !== "signed-in") return;
      // Default (no-password) users skip verification — there's no
      // password to check, and the menu omits the password prompt
      // for them anyway. Real accounts still require their password.
      if (!auth.user.isDefault) {
        const ok = await verifyPassword(auth.user, password);
        if (!ok) throw new Error("Wrong password");
      }
      const remaining = users.filter((u) => u.id !== auth.user.id);
      await clearUserDataBytes(auth.user.id);
      // Mop up the per-user cloud mirror so a future account on the
      // same device can't accidentally resurrect this user's bytes
      // from a cached snapshot.
      await clearCloudMirrorBytes(auth.user.id);
      clearCloudOfflineMode(auth.user.id);
      setUsers(remaining);
      persistRegistry(remaining, null);
      passwordRef.current = null;
      clearSession();
      setAuth({ kind: "signed-out", lastUsername: null });
    },
    [auth, users, persistRegistry],
  );

  if (auth.kind === "signed-out") {
    const realUsers = users.filter((u) => !u.isDefault);
    const guestAvailable = findDefaultUser(users) !== undefined;
    return (
      <AuthScreen
        users={users}
        initialUsername={auth.kind === "signed-out" ? auth.lastUsername : null}
        legacyBudgetAvailable={legacyBudgetAvailable && realUsers.length === 0}
        guestAvailable={guestAvailable}
        onSignIn={handleSignIn}
        onCreateAccount={handleCreateAccount}
        onContinueWithoutAccount={handleContinueWithoutAccount}
      />
    );
  }
  if (adapter === null) {
    // The adapter useMemo returns null while the folder handle is
    // being restored from IndexedDB. Show a quiet hold rather than
    // the AuthScreen — the user is signed in, just briefly waiting
    // on a permission probe that usually completes in milliseconds.
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-dvh items-center justify-center px-4 text-sm text-muted"
      >
        Restoring folder access…
      </div>
    );
  }

  // Real (non-guest) users on the device. Guest accounts never coexist
  // with real ones at steady state, but filtering keeps "Switch user"
  // honest mid-flow.
  const otherRealUsers = users.filter(
    (u) => !u.isDefault && u.id !== auth.user.id,
  );

  const authBundle: AppShellAuth = {
    user: auth.user,
    password: auth.password,
    hasOtherUsers: otherRealUsers.length > 0,
    getEncryptionPassword: () => passwordRef.current,
    onSignOut: handleSignOut,
    onSwitchUser: handleSwitchUser,
    onCreateAccount: handleStartCreateAccountFromMenu,
    onDeleteAccount: handleDeleteAccount,
  };
  const storageBundle: AppShellStorage = {
    adapter,
    backend,
    encryption,
    cloudOfflineMode,
    dropboxConnected,
    gdriveConnected,
    folderConnected,
    folderAvailable: isFolderBackendAvailable(),
    folderReconnectNeeded,
    onConnectDropbox: storage.connectDropbox,
    onDisconnectDropbox: storage.disconnectDropbox,
    onConnectGdrive: storage.connectGdrive,
    onDisconnectGdrive: storage.disconnectGdrive,
    onReconnectCloud: storage.reconnectCloud,
    onConnectFolder: storage.connectFolder,
    onReconnectFolder: storage.reconnectFolder,
    onDisconnectFolder: storage.disconnectFolder,
    onSelectBrowser: storage.selectBrowser,
    onSetEncryption: storage.setEncryption,
    onSetCloudOfflineMode: storage.setCloudOfflineMode,
  };

  return (
    <>
      <AppShell
        auth={authBundle}
        storage={storageBundle}
        currentDataRef={currentDataRef}
      />
      <CloudLinkDialog
        pending={pendingCloudLink}
        onResolve={storage.resolveCloudLink}
        onCancel={storage.cancelCloudLink}
      />
      <FolderLinkDialog
        pending={pendingFolderLink}
        onResolve={storage.resolveFolderLink}
        onCancel={storage.cancelFolderLink}
      />
    </>
  );
}
