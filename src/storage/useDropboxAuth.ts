import { useCallback, useEffect, useRef, useState } from "react";

import { unlock } from "../data/achievements";
import type { PendingCloudLink } from "./cloud-link-types";
import {
  clearDropboxRefreshToken,
  clearDropboxToken,
  type BackendId,
  getBackend,
  getDropboxRefreshToken,
  getDropboxToken,
  setBackend,
  setDropboxRefreshToken,
  setDropboxToken,
} from "./backend-preference";
import {
  type DropboxAuthResult,
  completeDropboxAuth,
  createDropboxAdapter,
  hasPendingDropboxAuth,
  startDropboxAuth,
} from "./dropbox-adapter";
import type { StoredUser } from "../data/types";
import type { AuthState } from "./useStorageBackend";
import { createLogger } from "../utils/logger";

const log = createLogger("storage-dropbox");

// Inputs the Dropbox hook shares with the outer storage hook. The
// hook owns the access / refresh tokens, the OAuth start / completion
// (URL-redirect path), and the commit-on-link step. The cross-cutting
// concerns — `pendingCloudLink` state, the shared `disconnectCloud` /
// `reconnectCloud` orchestration, `loadSourceText` — stay in the
// outer hook and are passed in (or absent — the outer hook calls
// into the hook's `markDisconnected` after the shared mirror runs).
type Params = {
  auth: AuthState;
  // Read the source backend's current bytes (plaintext UserData JSON)
  // so the OAuth probe can decide whether the dialog should ask the
  // user to keep the cloud copy or push the source bytes up.
  loadSourceText: (
    userId: string,
    fromBackend: BackendId,
  ) => Promise<string | null>;
  // The outer hook's parked-link state setter. The OAuth completion
  // effect populates this when a dialog needs to ask the user whether
  // to keep the cloud copy or push the source bytes.
  setPendingCloudLink: (pending: PendingCloudLink | null) => void;
  // Flip the per-user-persisted backend choice. Dropbox commit
  // updates this so the outer hook's `backend` state rebuilds the
  // adapter useMemo against the new cloud provider.
  setBackendState: (next: BackendId) => void;
};

export type DropboxAuth = {
  // The current Dropbox access token (or null if not connected). The
  // outer adapter useMemo reads this — every silent refresh updates
  // it through `onAccessTokenRefreshed`, persisted via `setDropboxToken`,
  // and surfaced here so the adapter rebuilds.
  dropboxToken: string | null;
  // The refresh token is held in a ref rather than React state because
  // silent refreshes update the access token in localStorage and inside
  // the adapter's closure — bouncing it through `setState` would
  // rebuild the `adapter` useMemo and trigger a needless reload of the
  // user's data.
  dropboxRefreshTokenRef: React.MutableRefObject<string | null>;
  // Start the OAuth redirect. The completion effect inside this hook
  // catches the `?code=` on return and finishes the link.
  connectDropbox: () => void;
  // Persist the OAuth tokens and flip the active backend in one
  // batch, so the outer adapter useMemo rebuilds against the new
  // cloud backend exactly once. Consumed by the outer hook's
  // `resolveCloudLink` when the user confirms the dialog.
  commitDropboxLink: (userId: string, result: DropboxAuthResult) => void;
  // Drop the in-memory token state + clear the persisted tokens.
  // Called by the outer hook's `disconnectCloud` after the shared
  // mirror-to-browser step runs.
  markDisconnected: (userId: string) => void;
  // Eager per-user sync. Called by the outer hook's
  // `applySignedInUser` right before `setAuth(...)` so the very first
  // post-flip render sees the new per-user Dropbox state in a single
  // React batch.
  applySignedInUser: (user: StoredUser) => void;
};

// Owns the Dropbox backend's auth lifecycle: access + refresh token
// state, the OAuth start / completion (URL-redirect path), the
// commit-on-link step, and the per-user auth-sync. The shared cloud
// orchestration (`pendingCloudLink` resolution, the cross-provider
// `disconnectCloud` / `reconnectCloud` flows) lives in the outer
// `useStorageBackend` hook; this hook exposes the callbacks the
// orchestrator needs.
export function useDropboxAuth(params: Params): DropboxAuth {
  const { auth, loadSourceText, setPendingCloudLink, setBackendState } = params;

  const [dropboxToken, setDropboxTokenState] = useState<string | null>(() =>
    auth.kind === "signed-in" ? getDropboxToken(auth.user.id) : null,
  );
  const dropboxRefreshTokenRef = useRef<string | null>(
    auth.kind === "signed-in" ? getDropboxRefreshToken(auth.user.id) : null,
  );

  // Sync Dropbox state with the active user every time auth flips.
  // The outer hook handles its own per-user state (backend pref,
  // encryption, cloud-offline) in a parallel effect; this one stays
  // focused on the Dropbox token state so adding / removing a cloud
  // backend doesn't bloat the outer effect.
  useEffect(() => {
    if (auth.kind !== "signed-in") {
      setDropboxTokenState(null);
      dropboxRefreshTokenRef.current = null;
      return;
    }
    setDropboxTokenState(getDropboxToken(auth.user.id));
    dropboxRefreshTokenRef.current = getDropboxRefreshToken(auth.user.id);
  }, [auth]);

  // Persist the OAuth tokens and flip the active backend in one batch.
  // Split out from the OAuth effect because both the "no remote file"
  // branch and the conflict-resolution dialog need the same commit
  // step.
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
    [setBackendState],
  );

  // Watch for the redirect back from the Dropbox OAuth consent screen.
  // The `?code=` query param signals a successful authorisation; we
  // exchange it for tokens, probe both sides for an existing budget,
  // and either commit silently or park the result on
  // `pendingCloudLink` so the user can pick which side wins.
  useEffect(() => {
    if (typeof window === "undefined") return;
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
  }, [auth, loadSourceText, setPendingCloudLink]);

  const connectDropbox = useCallback(() => {
    void startDropboxAuth();
  }, []);

  const markDisconnected = useCallback((userId: string) => {
    clearDropboxToken(userId);
    clearDropboxRefreshToken(userId);
    setDropboxTokenState(null);
    dropboxRefreshTokenRef.current = null;
  }, []);

  const applySignedInUser = useCallback((user: StoredUser) => {
    setDropboxTokenState(getDropboxToken(user.id));
    dropboxRefreshTokenRef.current = getDropboxRefreshToken(user.id);
  }, []);

  return {
    dropboxToken,
    dropboxRefreshTokenRef,
    connectDropbox,
    commitDropboxLink,
    markDisconnected,
    applySignedInUser,
  };
}
