import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { unlock } from "../data/achievements";
import type { UserData } from "../data/types";
import {
  type PendingCloudLink,
  type PendingFolderLink,
} from "../components/CloudLinkDialog";
import type { StorageAdapter } from "./adapter";
import {
  type BackendId,
  type EncryptionMode,
  clearCloudOfflineMode,
  clearDropboxRefreshToken,
  clearDropboxToken,
  clearGdriveToken,
  getBackend,
  getCloudOfflineMode,
  getDropboxRefreshToken,
  getDropboxToken,
  getEncryption,
  getGdriveToken,
  setBackend,
  setCloudOfflineMode,
  setDropboxRefreshToken,
  setDropboxToken,
  setEncryption,
  setGdriveToken,
} from "./backend-preference";
import { withCloudMirror } from "./cloud-mirror";
import {
  type DropboxAuthResult,
  completeDropboxAuth,
  createDropboxAdapter,
  hasPendingDropboxAuth,
  startDropboxAuth,
} from "./dropbox-adapter";
import { withEncryption } from "./encrypting-adapter";
import { serializeUserData } from "./file";
import { createFolderAdapter } from "./folder-adapter";
import {
  clearDirectoryHandle,
  ensurePermission,
  loadDirectoryHandle,
  saveDirectoryHandle,
} from "./folder-handle-store";
import { createGdriveAdapter, startGdriveAuth } from "./gdrive-adapter";
import {
  clearCloudMirrorBytes,
  createIdbAdapter,
  createIdbCloudMirrorStorage,
} from "./idb-adapter";
import type { StoredUser } from "../data/types";
import { createLogger } from "../utils/logger";

const log = createLogger("app");

// Auth shape mirrored from App.tsx so the hook stays decoupled from the
// auth machinery — we only ever read `auth.kind` and `auth.user.id` /
// `auth.user.isDefault` from it.
export type AuthState =
  | { kind: "signed-out"; lastUsername: string | null }
  | { kind: "signed-in"; user: StoredUser; password: string };

// Build a raw `StorageAdapter` for one of the four backends. Single
// switch shared by the live-adapter `useMemo`, by the source probe
// path during link confirmation, by the disconnect handlers, and by
// the encryption-toggle re-wrap — every callsite that needs an inner
// adapter on demand. Returns `null` when the requested cloud backend
// has no token in hand (a token-less folder backend is handled the
// same way as "permission lost" by the caller and falls back to the
// browser adapter — kept inline here rather than null-returning so
// the caller doesn't have to special-case the folder branch).
type BuildInnerArgs = {
  userId: string;
  backend: BackendId;
  dropboxToken: string | null;
  dropboxRefreshTokenRef: React.MutableRefObject<string | null>;
  gdriveToken: string | null;
  folderHandle: FileSystemDirectoryHandle | null;
  onDropboxAccessTokenRefreshed: (next: string) => void;
  // Only the live-adapter callsite cares about permission loss; the
  // one-shot probes don't because they don't outlive a single load /
  // save round trip.
  onFolderPermissionLost?: () => void;
};

function buildInnerAdapter(args: BuildInnerArgs): StorageAdapter {
  const {
    userId,
    backend,
    dropboxToken,
    dropboxRefreshTokenRef,
    gdriveToken,
    folderHandle,
    onDropboxAccessTokenRefreshed,
    onFolderPermissionLost,
  } = args;
  if (backend === "dropbox" && dropboxToken) {
    return createDropboxAdapter({
      accessToken: dropboxToken,
      refreshToken: dropboxRefreshTokenRef.current,
      onAccessTokenRefreshed: onDropboxAccessTokenRefreshed,
    });
  }
  if (backend === "gdrive" && gdriveToken) {
    return createGdriveAdapter(gdriveToken);
  }
  if (backend === "folder" && folderHandle) {
    return createFolderAdapter({
      directoryHandle: folderHandle,
      onPermissionLost: onFolderPermissionLost,
    });
  }
  return createIdbAdapter({ userId });
}

// Wrap a raw adapter with `withEncryption` when the user keeps storage
// encrypted; otherwise return it untouched. Used everywhere we need an
// adapter that reads / writes the same envelope shape the steady-state
// live adapter does.
function wrapForActive(
  inner: StorageAdapter,
  encryption: EncryptionMode,
  passwordRef: React.MutableRefObject<string | null>,
): StorageAdapter {
  const password = passwordRef.current;
  return encryption === "encrypted" && password
    ? withEncryption(inner, passwordRef)
    : inner;
}

export type UseStorageBackendOptions = {
  auth: AuthState;
  // Held password for the active user. Read by the encrypting adapter
  // on every save / load; the hook reads it through the ref so silent
  // token refreshes don't have to rebuild the adapter `useMemo`.
  passwordRef: React.MutableRefObject<string | null>;
  // Mirror of AppShell's in-memory `UserData` so the OAuth-completion
  // and conflict-resolution paths can push the user's current budget
  // into a freshly-linked cloud backend.
  currentDataRef: React.MutableRefObject<UserData | null>;
};

export type UseStorageBackendResult = {
  adapter: StorageAdapter | null;
  backend: BackendId;
  dropboxConnected: boolean;
  gdriveConnected: boolean;
  folderConnected: boolean;
  folderReconnectNeeded: boolean;
  encryption: EncryptionMode;
  cloudOfflineMode: boolean;
  pendingCloudLink: PendingCloudLink | null;
  pendingFolderLink: PendingFolderLink | null;
  connectDropbox: () => void;
  disconnectDropbox: () => Promise<void>;
  connectGdrive: () => Promise<void>;
  disconnectGdrive: () => Promise<void>;
  connectFolder: () => Promise<void>;
  reconnectFolder: () => Promise<void>;
  disconnectFolder: () => Promise<void>;
  reconnectCloud: () => Promise<void>;
  selectBrowser: () => void;
  setEncryption: (mode: EncryptionMode) => Promise<void>;
  setCloudOfflineMode: (on: boolean) => void;
  resolveCloudLink: (action: "use-cloud" | "use-source") => Promise<void>;
  cancelCloudLink: () => void;
  resolveFolderLink: (action: "use-cloud" | "use-source") => Promise<void>;
  cancelFolderLink: () => void;
  // Eager per-user state sync. Called by App's auth handlers right
  // before `setAuth(...)` so the very first post-flip render sees both
  // the new auth AND the new per-user backend state in a single React
  // batch. Without this, the auth-effect below still catches up, but
  // not until after a render with stale per-user state — which is the
  // documented "blink" race the boot-time seeding goes to such lengths
  // to avoid.
  applySignedInUser: (user: StoredUser) => void;
};

export function useStorageBackend({
  auth,
  passwordRef,
  currentDataRef,
}: UseStorageBackendOptions): UseStorageBackendResult {
  // Per-user device-local storage preferences. Seeded from the current
  // `auth` so the very first adapter built by the `useMemo` below
  // matches what the auth effect would later set — same fix shape as
  // encryption below. Without this, a refresh on a cloud-backed account
  // boots with backend="browser", builds a local adapter whose
  // `loadSync()` hands back whatever stale bytes happen to live under
  // `userDataKey(uid)`, shows them on screen for a frame, then the auth
  // effect swaps the adapter to the real cloud one — which races a
  // queued auto-save of the stale bytes against the in-flight cloud
  // load. On mobile this surfaces as the real budget flashing in for a
  // moment ("blink") and then collapsing back to a fresh "Budget" with
  // the save button lit up dirty (the empty in-memory state vs. the
  // bytes the racing save wrote into `lastSavedText`).
  const [backend, setBackendState] = useState<BackendId>(() =>
    auth.kind === "signed-in" ? getBackend(auth.user.id) : "browser",
  );
  const [dropboxToken, setDropboxTokenState] = useState<string | null>(() =>
    auth.kind === "signed-in" ? getDropboxToken(auth.user.id) : null,
  );
  // The refresh token is held in a ref rather than React state because
  // silent refreshes update the access token in localStorage and inside
  // the adapter's closure — bouncing it through `setState` would
  // rebuild the `adapter` useMemo and trigger a needless reload of the
  // user's data.
  const dropboxRefreshTokenRef = useRef<string | null>(
    auth.kind === "signed-in" ? getDropboxRefreshToken(auth.user.id) : null,
  );
  const [gdriveToken, setGdriveTokenState] = useState<string | null>(() =>
    auth.kind === "signed-in" ? getGdriveToken(auth.user.id) : null,
  );
  // Live `FileSystemDirectoryHandle` for the folder backend, restored
  // from IndexedDB after auth flips. `folderHandleLoaded` distinguishes
  // "still probing IDB" from "no handle exists" so the `adapter`
  // useMemo can hold off on building anything during the async restore
  // (returning `null` from the memo, which the storage hook treats as
  // a no-op — same contract as the auth handshake). Seeded `true` for
  // non-folder users so the adapter useMemo isn't gated on a probe
  // that has nothing to find — without this gate, every cloud-backed
  // refresh would flicker through `folderHandleLoaded=false → true`
  // and rebuild the adapter for no reason.
  const [folderHandle, setFolderHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [folderHandleLoaded, setFolderHandleLoaded] = useState<boolean>(() => {
    if (auth.kind !== "signed-in") return true;
    return getBackend(auth.user.id) !== "folder";
  });
  // Set when a boot-time `queryPermission` returns anything other than
  // "granted" — the App keeps the IDB record around so the user can
  // re-grant with one click, but the Settings hint flips to a
  // "Reconnect folder" cue and the active adapter falls back to the
  // browser backend so editing keeps working.
  const [folderReconnectNeeded, setFolderReconnectNeeded] = useState(false);
  // Seeded from boot so the very first adapter built by the `useMemo`
  // below matches what the auth effect would later set. Without this,
  // a guest-with-data session boots with encryption="encrypted", the
  // adapter is wrapped with `withEncryption` (no `loadSync`), the
  // storage hook latches into status:"loading", and the auth effect's
  // swap to the bare local adapter races the in-flight load — the
  // load gets cancelled and "Loading budget…" never clears.
  const [encryption, setEncryptionState] = useState<EncryptionMode>(() => {
    if (auth.kind !== "signed-in") return "encrypted";
    return auth.user.isDefault ? "plaintext" : getEncryption(auth.user.id);
  });
  // Per-user, per-device opt-in for the cloud-mirror fallback. Off by
  // default — without it a cloud-backed session waits for the cloud to
  // answer before letting the user edit, which is the historical
  // contract. Seeded from the same per-user key as `encryption` above
  // so the adapter `useMemo` below sees the right wrapping on first
  // render.
  const [cloudOfflineMode, setCloudOfflineModeState] = useState<boolean>(() => {
    if (auth.kind !== "signed-in") return false;
    return getCloudOfflineMode(auth.user.id);
  });

  // Pending cloud-link conflict resolution. Non-null while the user is
  // being asked to decide between adopting the cloud file or replacing
  // it with their current budget — the tokens collected by OAuth are
  // parked here so the dialog's "Use cloud" / "Replace with current
  // budget" branches can finish the link with the right effect.
  const [pendingCloudLink, setPendingCloudLink] =
    useState<PendingCloudLink | null>(null);
  const [pendingFolderLink, setPendingFolderLink] =
    useState<PendingFolderLink | null>(null);

  // Sync state with the active user every time auth flips. The
  // default (no-password) user is pinned to plaintext storage — there
  // is no password to derive a key from, and the user explicitly
  // opted out of accounts.
  useEffect(() => {
    if (auth.kind !== "signed-in") {
      log.info("auth: signed-out — clearing per-user preferences");
      setBackendState("browser");
      setDropboxTokenState(null);
      dropboxRefreshTokenRef.current = null;
      setGdriveTokenState(null);
      setEncryptionState("encrypted");
      setCloudOfflineModeState(false);
      return;
    }
    const nextBackend = getBackend(auth.user.id);
    const nextDropboxToken = getDropboxToken(auth.user.id);
    const nextRefresh = getDropboxRefreshToken(auth.user.id);
    const nextGdriveToken = getGdriveToken(auth.user.id);
    const nextEncryption = auth.user.isDefault
      ? "plaintext"
      : getEncryption(auth.user.id);
    const nextOffline = getCloudOfflineMode(auth.user.id);
    log.info(
      `auth: signed-in user=${auth.user.username} isDefault=${Boolean(auth.user.isDefault)} backend=${nextBackend} hasDropboxToken=${Boolean(nextDropboxToken)} hasDropboxRefresh=${Boolean(nextRefresh)} hasGdriveToken=${Boolean(nextGdriveToken)} encryption=${nextEncryption} cloudOffline=${nextOffline}`,
    );
    setBackendState(nextBackend);
    setDropboxTokenState(nextDropboxToken);
    dropboxRefreshTokenRef.current = nextRefresh;
    setGdriveTokenState(nextGdriveToken);
    setEncryptionState(nextEncryption);
    setCloudOfflineModeState(nextOffline);
  }, [auth]);

  // Persist the OAuth tokens and flip the active backend in one batch,
  // so the adapter `useMemo` below rebuilds against the new cloud
  // backend exactly once. Split out from the OAuth effect because both
  // the "no remote file" branch and the conflict-resolution dialog
  // need the same commit step.
  const commitDropboxLink = useCallback(
    (userId: string, result: DropboxAuthResult) => {
      log.info(
        `commitDropboxLink: persisting tokens hasRefresh=${Boolean(result.refreshToken)}`,
      );
      setDropboxToken(userId, result.accessToken);
      if (result.refreshToken) {
        setDropboxRefreshToken(userId, result.refreshToken);
        dropboxRefreshTokenRef.current = result.refreshToken;
      } else {
        log.warn(
          "commitDropboxLink: no refresh token in response — silent refresh will not work",
        );
        // Shouldn't happen — `token_access_type=offline` should always
        // return one — but clear stale state if it does so we don't
        // try to refresh with the previous account's token.
        clearDropboxRefreshToken(userId);
        dropboxRefreshTokenRef.current = null;
      }
      setBackend(userId, "dropbox");
      setDropboxTokenState(result.accessToken);
      setBackendState("dropbox");
      unlock("cloudWalker");
    },
    [],
  );

  const commitGdriveLink = useCallback((userId: string, token: string) => {
    log.info("commitGdriveLink: persisting token");
    setGdriveToken(userId, token);
    setBackend(userId, "gdrive");
    setGdriveTokenState(token);
    setBackendState("gdrive");
    unlock("cloudWalker");
  }, []);

  // Wrap a raw adapter with `withEncryption` when the active user has
  // encryption on AND a password is in hand — mirrors the same gate
  // used when assembling the live `adapter` below, so source / target
  // probes during the link flow see and write the bytes through the
  // same envelope the steady-state app does.
  const wrapWithActiveEncryption = useCallback(
    (raw: StorageAdapter): StorageAdapter =>
      wrapForActive(raw, encryption, passwordRef),
    [encryption, passwordRef],
  );

  // Build a raw adapter for the *source* backend so the OAuth-
  // completion path can load the user's current bytes without
  // depending on `currentDataRef` — which only reflects whatever
  // AppShell happens to have loaded by the time the redirect lands
  // (typically `freshUserData()` on a cold boot, since cloud loads
  // are async). Returns null only when the source is a cloud backend
  // and the token has gone missing.
  const buildSourceRawAdapter = useCallback(
    (userId: string, fromBackend: BackendId): StorageAdapter | null => {
      if (fromBackend === "dropbox") {
        const token = getDropboxToken(userId);
        if (!token) return null;
        const refresh = getDropboxRefreshToken(userId);
        return createDropboxAdapter({
          accessToken: token,
          refreshToken: refresh,
          onAccessTokenRefreshed: (next) => {
            setDropboxToken(userId, next);
          },
        });
      }
      if (fromBackend === "gdrive") {
        const token = getGdriveToken(userId);
        if (!token) return null;
        return createGdriveAdapter(token);
      }
      if (fromBackend === "folder") {
        // The folder source needs the live handle held in App state,
        // not something we can rebuild from localStorage. Caller falls
        // back to the in-memory snapshot when the handle isn't there
        // — e.g. permission was revoked between sessions.
        if (!folderHandle) return null;
        return createFolderAdapter({ directoryHandle: folderHandle });
      }
      return createIdbAdapter({ userId });
    },
    [folderHandle],
  );

  // Read the source backend's current bytes, falling back to the
  // in-memory snapshot if the source adapter can't be built (e.g. a
  // cloud source whose token expired between sessions). The result
  // is plaintext UserData JSON ready to be re-written through a
  // wrapped target adapter on the resolve path.
  const loadSourceText = useCallback(
    async (userId: string, fromBackend: BackendId): Promise<string | null> => {
      const raw = buildSourceRawAdapter(userId, fromBackend);
      if (raw) {
        try {
          const wrapped = wrapWithActiveEncryption(raw);
          const snap = await wrapped.load();
          if (snap) return snap.text;
        } catch (err) {
          log.error("source load failed during cloud link", err);
        }
      }
      const fallback = currentDataRef.current;
      return fallback ? serializeUserData(fallback) : null;
    },
    [buildSourceRawAdapter, wrapWithActiveEncryption, currentDataRef],
  );

  // Complete the Dropbox OAuth round-trip when the redirect lands
  // back here. The user signed in before clicking Connect, so by the
  // time this fires they should already be signed-in again (or about
  // to be — we wait for that transition). Errors surface in the
  // console only; a future polish pass can surface them in UI.
  //
  // Google Drive uses a popup-based GIS token client (no redirect),
  // so only Dropbox arrives via this codepath. Pending-verifier check
  // guards against picking up a stray `?code=` from some other source
  // before kicking off the token exchange.
  //
  // Before flipping the backend we probe both sides — the target
  // cloud (so the dialog knows whether it already holds a budget)
  // and the source backend (so we have authoritative bytes to push,
  // independent of whether AppShell has finished its async load
  // into `currentDataRef`). The result is always parked in
  // `pendingCloudLink` so the user sees an explicit confirmation
  // dialog for the switch, even in the no-conflict cases — silently
  // flipping the backend has been the source of "did it work?"
  // confusion.
  useEffect(() => {
    if (auth.kind !== "signed-in") return;
    const rawSearch = window.location.search;
    const params = new URLSearchParams(rawSearch);
    const code = params.get("code");
    if (!code) return;
    // Pin the narrowed string into a local — TypeScript's
    // `if (!code) return` narrowing doesn't reach the nested function
    // declarations below, which would otherwise see `string | null`.
    const authCode = code;
    const state = params.get("state");
    const oauthErr = params.get("error");
    const dropboxPending = hasPendingDropboxAuth();
    // Echo the raw query string (sans the code, which is a secret) so
    // a misbehaving redirect chain — extra params, dropped `state`,
    // unexpected fragments — shows up in the console verbatim instead
    // of being inferred from the routing decision below.
    const sanitisedSearch = rawSearch.replace(/(code=)[^&]*/, "$1<redacted>");
    log.info(
      `oauth: redirect landed — search=${sanitisedSearch || "<empty>"} state=${state ?? "<none>"} error=${oauthErr ?? "<none>"} dropboxPending=${dropboxPending}`,
    );
    if (oauthErr) {
      log.error(
        `oauth: provider returned error=${oauthErr} desc=${params.get("error_description") ?? "<none>"}; aborting and cleaning URL`,
      );
      cleanCodeFromUrl();
      return;
    }
    if (!dropboxPending) {
      log.error(
        `oauth: ?code= present but no Dropbox verifier — ignoring and cleaning URL (state=${state ?? "<none>"})`,
      );
      cleanCodeFromUrl();
      return;
    }
    let cancelled = false;
    const userId = auth.user.id;
    const fromBackend = getBackend(userId);
    log.info(
      `oauth: ?code= present provider=dropbox (state=${state ?? "<none>"}) fromBackend=${fromBackend}`,
    );

    void doDropbox()
      .catch((err: unknown) => {
        log.error("oauth: dropbox connect failed", err);
      })
      .finally(cleanCodeFromUrl);

    async function doDropbox(): Promise<void> {
      log.info("oauth(dropbox): exchanging code for tokens");
      const result = await completeDropboxAuth(authCode);
      if (cancelled || auth.kind !== "signed-in") {
        log.info("oauth(dropbox): aborted after token exchange (cancelled)");
        return;
      }
      log.info("oauth(dropbox): probing remote + source in parallel");
      const probe = createDropboxAdapter({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        // Refresh-token swaps before commit have nowhere durable to
        // land — the user hasn't accepted the link yet. Drop the new
        // token on the floor; the post-commit adapter will mint its
        // own on the next 401.
        onAccessTokenRefreshed: () => {},
      });
      const [remote, sourceText] = await Promise.all([
        probe.load().catch((err: unknown) => {
          log.error("oauth(dropbox): probe failed", err);
          return null;
        }),
        loadSourceText(userId, fromBackend),
      ]);
      if (cancelled || auth.kind !== "signed-in") {
        log.info("oauth(dropbox): aborted after probe (cancelled)");
        return;
      }
      log.info(
        `oauth(dropbox): probe done remoteHasBytes=${Boolean(remote)} sourceHasBytes=${Boolean(sourceText)} — opening confirmation`,
      );
      setPendingCloudLink({
        provider: "dropbox",
        auth: result,
        fromBackend,
        remoteSnapshot: remote,
        sourceText,
      });
    }

    function cleanCodeFromUrl() {
      // Clean the OAuth round-trip params out of the URL regardless
      // of outcome so a page reload doesn't re-trigger the exchange
      // and so the URL bar isn't left littered with provider-specific
      // junk. `code`/`state` are ours; `error`/`error_description` are
      // standard OAuth 2.0 error fields; `iss` is RFC 9207 issuer
      // identification (Google sets it); `scope`, `authuser`, `prompt`,
      // and `hd` are Google-specific extras.
      const url = new URL(window.location.href);
      for (const key of [
        "code",
        "state",
        "error",
        "error_description",
        "iss",
        "scope",
        "authuser",
        "prompt",
        "hd",
      ]) {
        url.searchParams.delete(key);
      }
      window.history.replaceState({}, "", url.toString());
    }
    return () => {
      cancelled = true;
    };
  }, [auth, loadSourceText]);

  // Resolve a parked cloud-link confirmation. "use-cloud" just flips
  // the backend and lets the storage hook reload from the cloud (which
  // may itself be empty — that's the "both sides empty, just confirm"
  // case). "use-source" pushes the stashed `sourceText` through the
  // probe adapter first, threading the remote revision so the write
  // lands as an update rather than a colliding `add` when the cloud
  // already had a file; then flips the backend. The dialog is
  // dismissed as soon as the user picks so the path stays snappy;
  // any error from the upload is logged and the link silently aborts
  // (the user can retry from Settings).
  const resolveCloudLink = useCallback(
    async (action: "use-cloud" | "use-source"): Promise<void> => {
      const pending = pendingCloudLink;
      if (!pending || auth.kind !== "signed-in") return;
      log.info(
        `cloud-link resolve: ${pending.provider} action=${action} fromBackend=${pending.fromBackend}`,
      );
      setPendingCloudLink(null);
      const userId = auth.user.id;
      try {
        if (action === "use-source" && pending.sourceText !== null) {
          log.info(
            `cloud-link: pushing source bytes (${pending.sourceText.length}) into ${pending.provider}`,
          );
          const probeRaw =
            pending.provider === "dropbox"
              ? createDropboxAdapter({
                  accessToken: pending.auth.accessToken,
                  refreshToken: pending.auth.refreshToken,
                  onAccessTokenRefreshed: (next) => {
                    setDropboxToken(userId, next);
                  },
                })
              : createGdriveAdapter(pending.accessToken);
          const probe = wrapWithActiveEncryption(probeRaw);
          await probe.save(
            pending.sourceText,
            pending.remoteSnapshot?.revision,
          );
        }
        // Drop any cloud-mirror cache the previous backend left
        // behind. The mirror is per-user only, so without this the
        // new provider's load() would see the old provider's
        // pending edits and either push them into the new cloud or
        // surface a bogus cross-provider conflict — both of which
        // end with a blank budget on the freshly linked backend.
        // The cloud-mirror wrapper now also guards against this
        // internally via the backendId tag, but clearing here is
        // the explicit, observable handoff.
        log.info(
          `cloud-link: clearing cloud-mirror before flipping backend to ${pending.provider}`,
        );
        await clearCloudMirrorBytes(userId);
        log.info(
          `cloud-link: committing — flipping backend to ${pending.provider}`,
        );
        if (pending.provider === "dropbox") {
          commitDropboxLink(userId, pending.auth);
        } else {
          commitGdriveLink(userId, pending.accessToken);
        }
      } catch (err) {
        log.error(`cloud-link: ${pending.provider} link failed`, err);
      }
    },
    [
      auth,
      pendingCloudLink,
      commitDropboxLink,
      commitGdriveLink,
      wrapWithActiveEncryption,
    ],
  );

  const cancelCloudLink = useCallback(() => {
    setPendingCloudLink(null);
  }, []);

  const adapter = useMemo<StorageAdapter | null>(() => {
    if (auth.kind !== "signed-in") {
      log.info("adapter: null (not signed in)");
      return null;
    }
    const userId = auth.user.id;
    // Folder backend with the handle still being restored from IDB —
    // return null so the storage hook waits (same null-tolerated path
    // as the auth handshake). Without this gate the first render
    // would pick the browser fallback below and trigger an unwanted
    // load + replace before the folder handle lands.
    if (backend === "folder" && !folderHandleLoaded) {
      log.info("adapter: null (folder handle still loading)");
      return null;
    }
    const isCloud =
      (backend === "dropbox" && dropboxToken !== null) ||
      (backend === "gdrive" && gdriveToken !== null);
    if (backend === "dropbox" && dropboxToken) {
      log.info(
        `adapter: building dropbox (hasRefresh=${Boolean(dropboxRefreshTokenRef.current)})`,
      );
    } else if (backend === "gdrive" && gdriveToken) {
      log.info("adapter: building gdrive");
    } else if (backend === "folder" && folderHandle) {
      log.info("adapter: building folder");
    } else {
      log.info(
        `adapter: building browser (backend=${backend} dropboxToken=${Boolean(
          dropboxToken,
        )} gdriveToken=${Boolean(gdriveToken)} folderHandle=${Boolean(
          folderHandle,
        )})`,
      );
    }
    let inner = buildInnerAdapter({
      userId,
      backend,
      dropboxToken,
      dropboxRefreshTokenRef,
      gdriveToken,
      folderHandle,
      // Persist the silently-refreshed access token so the next
      // page load picks it up; deliberately do NOT touch React
      // state, since rebuilding the adapter mid-session would
      // discard our `lastSnapshot` and force a reload of the
      // user's data.
      onDropboxAccessTokenRefreshed: (next) => {
        log.info("dropbox: persisting refreshed access token");
        setDropboxToken(userId, next);
      },
      // The OS revoked access mid-session (rare, but possible
      // via site-settings while the tab is open). Drop the live
      // handle so the next render falls back to the browser
      // adapter, and surface the reconnect banner — the IDB
      // record is intentionally kept so the user can re-grant
      // with one click against the stored handle.
      onFolderPermissionLost: () => {
        log.warn("folder: permission lost during operation");
        setFolderHandle(null);
        setFolderReconnectNeeded(true);
      },
    });
    // Wrap cloud backends with the offline-mirror so a session that
    // boots without network can still load the last-known bytes and
    // accept edits. The wrapper sits *under* `withEncryption` so it
    // sees and mirrors the same ciphertext the cloud holds, keeping
    // the on-disk threat model end-to-end. Gated on the per-user
    // `cloudOfflineMode` preference — when off, cloud sessions
    // behave the historical way (wait for the cloud, surface errors
    // on failure).
    if (isCloud && cloudOfflineMode) {
      log.info(`adapter: wrapping ${inner.id} with cloud-mirror`);
      inner = withCloudMirror(inner, {
        storage: createIdbCloudMirrorStorage(userId),
      });
    }
    // Skip the encryption wrapper entirely when the user has opted
    // out — keeps `loadSync` available on local and writes plaintext
    // bytes to whichever inner backend is active (including the
    // cloud backends).
    if (encryption === "plaintext") {
      log.info(`adapter: encryption off — inner=${inner.id}`);
      return inner;
    }
    if (!passwordRef.current) {
      log.warn(
        `adapter: encryption on but no password held — load will fail with "password required" if the file is encrypted (inner=${inner.id})`,
      );
    } else {
      log.info(`adapter: wrapping ${inner.id} with encryption`);
    }
    return withEncryption(inner, passwordRef);
  }, [
    auth,
    backend,
    dropboxToken,
    gdriveToken,
    folderHandle,
    folderHandleLoaded,
    encryption,
    cloudOfflineMode,
    passwordRef,
  ]);

  const connectDropbox = useCallback(() => {
    void startDropboxAuth();
  }, []);

  // Re-issue OAuth for the active cloud backend after an
  // `auth-error` status. Distinct from `connectGdrive` /
  // `connectDropbox`, which go through the
  // `pendingCloudLink` confirmation flow — that flow exists for
  // linking a fresh backend, not refreshing a token on a backend the
  // user is already on. Here both copies live in the same cloud, so
  // we just persist the new token and let `useUserDataStorage`
  // re-run its load on the rebuilt adapter.
  //
  // Throws on failure (popup blocked, user dismissed, network) so the
  // calling button / modal can show the message inline instead of
  // silently swallowing it.
  const reconnectCloud = useCallback(async (): Promise<void> => {
    if (auth.kind !== "signed-in") return;
    if (backend === "gdrive") {
      const userId = auth.user.id;
      log.info("reconnect(gdrive): launching GIS popup");
      const token = await startGdriveAuth();
      if (auth.kind !== "signed-in") return;
      setGdriveToken(userId, token);
      setGdriveTokenState(token);
      return;
    }
    if (backend === "dropbox") {
      // Dropbox uses URL-redirect OAuth; the existing flow handles
      // the return trip. The auto-refresh in `authedFetch` covers the
      // common case, so a Dropbox auth-error means the refresh token
      // is gone or revoked — a full redirect re-link is appropriate.
      // The promise resolves once the navigation has been kicked off
      // — the page unloads shortly after.
      await startDropboxAuth();
    }
  }, [auth, backend]);

  // Google Drive uses GIS token client — popup, not redirect — so the
  // probe-and-park-pendingCloudLink dance that Dropbox runs from the
  // URL-redirect handler happens inline here, awaiting the popup
  // result.
  //
  // Throws on OAuth failure (popup blocked, GIS script unreachable,
  // user dismissed) so the caller can surface the error inline. The
  // Settings storage tab catches and displays it next to the picker
  // — silently returning here meant the picker option flipped to
  // Google Drive but nothing visible happened, leaving the user
  // wondering whether the app got the click.
  const connectGdrive = useCallback(async () => {
    if (auth.kind !== "signed-in") return;
    const userId = auth.user.id;
    const fromBackend = getBackend(userId);
    let token: string;
    try {
      log.info("oauth(gdrive): launching GIS popup");
      token = await startGdriveAuth();
    } catch (err) {
      log.error("oauth(gdrive): popup failed", err);
      throw err;
    }
    if (auth.kind !== "signed-in") {
      log.info("oauth(gdrive): aborted after token (signed out)");
      return;
    }
    log.info("oauth(gdrive): probing remote + source in parallel");
    const probe = createGdriveAdapter(token);
    const [remote, sourceText] = await Promise.all([
      probe.load().catch((err: unknown) => {
        log.error("oauth(gdrive): probe failed", err);
        return null;
      }),
      loadSourceText(userId, fromBackend),
    ]);
    if (auth.kind !== "signed-in") {
      log.info("oauth(gdrive): aborted after probe (signed out)");
      return;
    }
    log.info(
      `oauth(gdrive): probe done remoteHasBytes=${Boolean(remote)} sourceHasBytes=${Boolean(sourceText)} — opening confirmation`,
    );
    setPendingCloudLink({
      provider: "gdrive",
      accessToken: token,
      fromBackend,
      remoteSnapshot: remote,
      sourceText,
    });
  }, [auth, loadSourceText]);

  const selectBrowser = useCallback(() => {
    if (auth.kind !== "signed-in") return;
    setBackend(auth.user.id, "browser");
    setBackendState("browser");
    unlock("shapeShifter");
  }, [auth]);

  // Mirror the active cloud backend's current bytes back into the
  // browser backend, then clear the tokens and flip state. Best-
  // effort: a stale browser copy is a few-minute regression at worst
  // because `useUserDataStorage` saves on the same debounce. Used by
  // both the Dropbox and Google Drive disconnect flows — they only
  // differ in which inner adapter to read from and which token to
  // clear after the mirror.
  const disconnectCloud = useCallback(
    async (provider: "dropbox" | "gdrive") => {
      if (auth.kind !== "signed-in") return;
      const userId = auth.user.id;
      const sourceToken = provider === "dropbox" ? dropboxToken : gdriveToken;
      // Pull the latest cloud snapshot — through the encrypting
      // wrapper when the user keeps storage encrypted, raw otherwise —
      // so the bytes that land in localStorage match what was up
      // there. Failing to fetch is tolerated: the in-memory state has
      // just been auto-saved there moments ago, so worst case the
      // user loses the few minutes between the last sync and the
      // disconnect.
      if (sourceToken) {
        try {
          const cloudInner =
            provider === "dropbox"
              ? createDropboxAdapter({
                  accessToken: sourceToken,
                  refreshToken: dropboxRefreshTokenRef.current,
                  onAccessTokenRefreshed: (next) => {
                    setDropboxToken(userId, next);
                  },
                })
              : createGdriveAdapter(sourceToken);
          const cloud = wrapForActive(cloudInner, encryption, passwordRef);
          const snap = await cloud.load();
          if (snap) {
            const localInner = createIdbAdapter({ userId });
            const local = wrapForActive(localInner, encryption, passwordRef);
            await local.save(snap.text);
          }
        } catch (err) {
          log.error(`${provider} disconnect: failed to mirror to local`, err);
        }
      }
      if (provider === "dropbox") {
        clearDropboxToken(userId);
        clearDropboxRefreshToken(userId);
      } else {
        clearGdriveToken(userId);
      }
      setBackend(userId, "browser");
      // Dropping the cloud connection invalidates the cached cloud
      // bytes — leaving them around would let a future reconnect
      // surface a stale conflict against the new remote.
      await clearCloudMirrorBytes(userId);
      if (provider === "dropbox") {
        setDropboxTokenState(null);
        dropboxRefreshTokenRef.current = null;
      } else {
        setGdriveTokenState(null);
      }
      setBackendState("browser");
    },
    [auth, dropboxToken, gdriveToken, encryption, passwordRef],
  );

  const disconnectDropbox = useCallback(
    () => disconnectCloud("dropbox"),
    [disconnectCloud],
  );

  const disconnectGdrive = useCallback(
    () => disconnectCloud("gdrive"),
    [disconnectCloud],
  );

  // Restore the per-user folder handle from IndexedDB whenever the
  // signed-in user changes. We always reset `folderHandleLoaded` to
  // false up front so the `adapter` useMemo holds off on building a
  // browser-fallback adapter during the async probe — without that
  // gate, a folder-backed session would flash a fresh-budget render
  // on every reload.
  //
  // At boot we only `queryPermission` (no `requestPermission`) since
  // no user gesture is in scope. On "denied" / "prompt" we keep the
  // IDB record around so the Reconnect button in Settings can
  // re-grant in one click against the stored handle, and surface the
  // reconnect cue so the user knows their folder isn't live.
  useEffect(() => {
    if (auth.kind !== "signed-in") {
      setFolderHandle(null);
      setFolderHandleLoaded(true);
      setFolderReconnectNeeded(false);
      return;
    }
    const userId = auth.user.id;
    // Skip the probe when the user isn't on folder backend — the
    // adapter useMemo only consults `folderHandle` / `folderHandleLoaded`
    // when `backend === "folder"`, so probing IDB on every refresh for
    // every cloud / browser user just churns state and rebuilds the
    // adapter for nothing.
    if (getBackend(userId) !== "folder") {
      setFolderHandle(null);
      setFolderHandleLoaded(true);
      setFolderReconnectNeeded(false);
      return;
    }
    let cancelled = false;
    setFolderHandleLoaded(false);
    setFolderReconnectNeeded(false);
    void (async () => {
      const stored = await loadDirectoryHandle(userId);
      if (cancelled) return;
      if (!stored) {
        setFolderHandle(null);
        setFolderHandleLoaded(true);
        return;
      }
      const status = await ensurePermission(stored, "readwrite", false);
      if (cancelled) return;
      if (status === "granted") {
        setFolderHandle(stored);
        setFolderReconnectNeeded(false);
      } else {
        setFolderHandle(null);
        setFolderReconnectNeeded(true);
      }
      setFolderHandleLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [auth]);

  // Commit a freshly-picked folder as the active backend. Persists the
  // handle to IDB, mirrors any source-side bytes through the encrypting
  // wrapper if they need to land in the folder, then flips state.
  const commitFolderLink = useCallback(
    async (userId: string, handle: FileSystemDirectoryHandle) => {
      await saveDirectoryHandle(userId, handle);
      setBackend(userId, "folder");
      setFolderHandle(handle);
      setFolderHandleLoaded(true);
      setFolderReconnectNeeded(false);
      setBackendState("folder");
      unlock("cloudWalker");
    },
    [],
  );

  // Pick a folder and probe both sides for an existing budget. Same
  // probe-and-confirm pattern as the cloud OAuth flow: if both the
  // folder and the current source already hold data, the dialog asks
  // the user which one to keep. Otherwise commits straight away.
  const connectFolder = useCallback(async () => {
    if (auth.kind !== "signed-in") return;
    if (typeof window === "undefined" || !window.showDirectoryPicker) return;
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch (err) {
      // AbortError = user cancelled the picker; nothing to do.
      if (err instanceof DOMException && err.name === "AbortError") return;
      log.error("folder picker failed", err);
      return;
    }
    const userId = auth.user.id;
    const fromBackend = getBackend(userId);
    const probeInner = createFolderAdapter({ directoryHandle: handle });
    const probe = wrapWithActiveEncryption(probeInner);
    const [remote, sourceText] = await Promise.all([
      probe.load().catch((err: unknown) => {
        log.error("folder probe failed during link", err);
        return null;
      }),
      loadSourceText(userId, fromBackend),
    ]);
    if (auth.kind !== "signed-in") return;
    if (remote === null && sourceText === null) {
      // Nothing on either side — just commit, no dialog needed.
      await commitFolderLink(userId, handle);
      return;
    }
    if (remote !== null && sourceText === null) {
      // Folder already has bytes, source is empty — adopt them silently
      // (matches the cloud-link "use cloud" branch with nothing to lose).
      await commitFolderLink(userId, handle);
      return;
    }
    if (remote === null && sourceText !== null) {
      // Folder is empty, source has bytes — push the source into the
      // folder before flipping so the folder's first read returns the
      // user's actual budget rather than nothing.
      try {
        await probe.save(sourceText);
      } catch (err) {
        log.error("folder seed failed during link", err);
      }
      await commitFolderLink(userId, handle);
      return;
    }
    // Both sides have data — ask the user which one wins.
    setPendingFolderLink({
      handle,
      fromBackend,
      remoteSnapshot: remote,
      sourceText,
    });
  }, [auth, commitFolderLink, loadSourceText, wrapWithActiveEncryption]);

  // Resolve the folder-link confirmation. Mirrors `resolveCloudLink`:
  // "use-source" pushes the parked source bytes into the folder
  // (threading the remote revision so the write lands as an update),
  // then commits; "use-cloud" — the folder's existing budget wins —
  // just commits.
  const resolveFolderLink = useCallback(
    async (action: "use-cloud" | "use-source"): Promise<void> => {
      const pending = pendingFolderLink;
      if (!pending || auth.kind !== "signed-in") return;
      setPendingFolderLink(null);
      const userId = auth.user.id;
      try {
        if (action === "use-source" && pending.sourceText !== null) {
          const probeInner = createFolderAdapter({
            directoryHandle: pending.handle,
          });
          const probe = wrapWithActiveEncryption(probeInner);
          await probe.save(
            pending.sourceText,
            pending.remoteSnapshot?.revision,
          );
        }
        await commitFolderLink(userId, pending.handle);
      } catch (err) {
        log.error("folder link failed", err);
      }
    },
    [auth, pendingFolderLink, commitFolderLink, wrapWithActiveEncryption],
  );

  const cancelFolderLink = useCallback(() => {
    setPendingFolderLink(null);
  }, []);

  // Re-grant permission against the already-stored handle. The
  // `requestPermission` call requires a user gesture, which is why
  // this lives in a click handler rather than the boot effect.
  const reconnectFolder = useCallback(async () => {
    if (auth.kind !== "signed-in") return;
    const userId = auth.user.id;
    const stored = await loadDirectoryHandle(userId);
    if (!stored) {
      // No stored handle to re-grant against — escalate to the full
      // picker flow instead.
      void connectFolder();
      return;
    }
    const status = await ensurePermission(stored, "readwrite", true);
    if (status === "granted") {
      setFolderHandle(stored);
      setFolderReconnectNeeded(false);
    }
  }, [auth, connectFolder]);

  // Mirror the folder's current bytes back into the browser backend
  // (same pattern as the Dropbox / GDrive disconnect), then clear the
  // handle from IDB and flip state. Best-effort: a stale browser copy
  // is a few-edit regression at worst, since `useUserDataStorage`
  // saves on debounce.
  const disconnectFolder = useCallback(async () => {
    if (auth.kind !== "signed-in") return;
    const userId = auth.user.id;
    if (folderHandle) {
      try {
        const folderInner = createFolderAdapter({
          directoryHandle: folderHandle,
        });
        const folder = wrapForActive(folderInner, encryption, passwordRef);
        const snap = await folder.load();
        if (snap) {
          const browserInner = createIdbAdapter({ userId });
          const browserAdapter = wrapForActive(
            browserInner,
            encryption,
            passwordRef,
          );
          await browserAdapter.save(snap.text);
        }
      } catch (err) {
        log.error("folder disconnect: failed to mirror to browser", err);
      }
    }
    await clearDirectoryHandle(userId);
    setBackend(userId, "browser");
    setFolderHandle(null);
    setFolderReconnectNeeded(false);
    setBackendState("browser");
  }, [auth, folderHandle, encryption, passwordRef]);

  // Flip the per-user encryption preference, re-wrapping the bytes
  // already in the active backend so the next load isn't reading the
  // wrong envelope. Reads through the *current* preference and writes
  // through the *new* one. Backend choice (local vs Dropbox vs
  // Google Drive) is independent — encryption is just whether the
  // adapter wraps with `withEncryption` on top.
  const setEncryptionMode = useCallback(
    async (next: EncryptionMode) => {
      if (auth.kind !== "signed-in") return;
      // The default (no-password) user has no key to derive — pin to
      // plaintext and ignore any toggle attempts.
      if (auth.user.isDefault) return;
      if (next === encryption) return;
      const userId = auth.user.id;
      const buildInner = (): StorageAdapter =>
        buildInnerAdapter({
          userId,
          backend,
          dropboxToken,
          dropboxRefreshTokenRef,
          gdriveToken,
          folderHandle,
          onDropboxAccessTokenRefreshed: (nextToken) => {
            setDropboxToken(userId, nextToken);
          },
        });
      const innerForCurrent: StorageAdapter = buildInner();
      const innerForNext: StorageAdapter = buildInner();
      const current =
        encryption === "plaintext"
          ? innerForCurrent
          : withEncryption(innerForCurrent, passwordRef);
      const target =
        next === "plaintext"
          ? innerForNext
          : withEncryption(innerForNext, passwordRef);
      try {
        const snap = await current.load();
        if (snap) await target.save(snap.text);
      } catch (err) {
        log.error("encryption toggle: failed to re-wrap bytes", err);
        return;
      }
      setEncryption(userId, next);
      setEncryptionState(next);
      if (next === "encrypted") unlock("paranoidMode");
    },
    [
      auth,
      backend,
      dropboxToken,
      gdriveToken,
      folderHandle,
      encryption,
      passwordRef,
    ],
  );

  // Flip the per-user offline-mirror opt-in. Persisted to localStorage
  // and reflected in React state so the adapter `useMemo` above rebuilds
  // — turning the toggle off also drops the cached mirror bytes so the
  // user doesn't leave a stale copy behind on a shared device.
  const setCloudOfflineModePref = useCallback(
    (on: boolean) => {
      if (auth.kind !== "signed-in") return;
      const userId = auth.user.id;
      if (on) {
        log.info("cloud-offline: enabling for user");
        setCloudOfflineMode(userId, true);
      } else {
        log.info("cloud-offline: disabling for user — clearing mirror");
        clearCloudOfflineMode(userId);
        // Fire-and-forget — the UI flips state immediately and the
        // IDB delete settles a moment later.
        void clearCloudMirrorBytes(userId);
      }
      setCloudOfflineModeState(on);
    },
    [auth],
  );

  // Imperative eager sync. App's auth handlers call this right before
  // `setAuth(...)` so the very first post-flip render sees both the
  // new auth AND the new per-user backend state in a single React
  // batch — the auth-effect above still catches up, but it doesn't
  // run until after the render, leaving the documented "blink" race
  // window otherwise. The sign-out path doesn't need an equivalent
  // helper because the auth-effect's `signed-out` branch handles the
  // clear before any post-flip render that consults this state.
  const applySignedInUser = useCallback((user: StoredUser) => {
    setBackendState(getBackend(user.id));
    setDropboxTokenState(getDropboxToken(user.id));
    dropboxRefreshTokenRef.current = getDropboxRefreshToken(user.id);
    setEncryptionState(user.isDefault ? "plaintext" : getEncryption(user.id));
  }, []);

  return {
    adapter,
    backend,
    dropboxConnected: dropboxToken !== null,
    gdriveConnected: gdriveToken !== null,
    folderConnected: folderHandle !== null,
    folderReconnectNeeded,
    encryption,
    cloudOfflineMode,
    pendingCloudLink,
    pendingFolderLink,
    connectDropbox,
    disconnectDropbox,
    connectGdrive,
    disconnectGdrive,
    connectFolder,
    reconnectFolder,
    disconnectFolder,
    reconnectCloud,
    selectBrowser,
    setEncryption: setEncryptionMode,
    setCloudOfflineMode: setCloudOfflineModePref,
    resolveCloudLink,
    cancelCloudLink,
    resolveFolderLink,
    cancelFolderLink,
    applySignedInUser,
  };
}
