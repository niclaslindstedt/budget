import { ConflictError, type Snapshot, type StorageAdapter } from "./adapter";
import { challengeFor, randomVerifier, redirectUri } from "./oauth-pkce";

// Dropbox-backed `StorageAdapter`. Talks to the v2 HTTP API directly
// (no SDK — two endpoints don't justify ~100kB of bundle) and stores
// the budget as a single file at `/budget.json` inside the app's
// scoped folder. Encryption happens one level up in `withEncryption`,
// so the bytes that land in Dropbox are the same AES-GCM envelope
// that localStorage would have held.
//
// Concurrency mirrors Dropbox's own `rev`: `Snapshot.revision` round-
// trips through the hook, and `save` uses the `update` write-mode
// variant (`{".tag":"update","update":<rev>}`) with the previous `rev`
// so a remote that moved underneath us surfaces as `ConflictError`
// instead of a silent overwrite.

// Public app key. Dropbox's PKCE flow doesn't require a client secret,
// and the key itself is published in the deployed JS bundle either
// way — bake it in for zero env-var infrastructure.
//
// The matching app is registered at
// https://www.dropbox.com/developers/apps as "Scoped access" with
// permission type "App folder" (folder name `budget.niclaslindstedt.se`).
// Its redirect URIs must include `https://budget.niclaslindstedt.se/`
// (prod) and `http://localhost:5173/` (dev) — `startDropboxAuth`
// derives the URI from `window.location.origin` and Dropbox requires
// an exact match.
export const DROPBOX_APP_KEY = "fjk4dj166rrzuiw";

// Public folder name inside the user's Dropbox `Apps/` directory. This
// matches the Dropbox app registration's "App folder" name and is what
// the user will see when browsing Dropbox in their file manager.
export const DROPBOX_APP_FOLDER = "budget.niclaslindstedt.se";

export const DROPBOX_FILE_PATH = "/budget.json";

// Web URL that opens the budget file's parent folder in Dropbox's web
// UI with the file pre-selected for preview. Used by the cloud-sync
// modal's "Open in Dropbox" button.
export function dropboxWebUrl(): string {
  const fileName = DROPBOX_FILE_PATH.replace(/^\//, "");
  return `https://www.dropbox.com/home/Apps/${DROPBOX_APP_FOLDER}?preview=${encodeURIComponent(fileName)}`;
}
const AUTH_BASE = "https://www.dropbox.com/oauth2/authorize";
const TOKEN_ENDPOINT = "https://api.dropboxapi.com/oauth2/token";
const UPLOAD_ENDPOINT = "https://content.dropboxapi.com/2/files/upload";
const DOWNLOAD_ENDPOINT = "https://content.dropboxapi.com/2/files/download";

// 5-minute coalescing window. The user explicitly asked for "every
// few minutes or on manual Save"; `saveNow()` (the disk button)
// still bypasses this for the immediate-flush escape hatch.
const SAVE_DEBOUNCE_MS = 5 * 60 * 1000;

// `sessionStorage` survives the OAuth redirect round-trip but is
// scoped to the tab, so a parallel auth flow in another tab can't
// race with this one.
const PKCE_VERIFIER_KEY = "budget.dropbox.pkce.verifier";

export type FetchImpl = typeof fetch;

// Live access to the user's Dropbox tokens. The access token is short-
// lived (~4 hours), so the adapter holds a mutable copy in its closure
// and exchanges the refresh token for a fresh one on any 401 before
// retrying the request. `onAccessTokenRefreshed` is the hook back into
// App-level state / localStorage so the new token survives reloads.
//
// `refreshToken` may be null for legacy connections that authorized
// before refresh tokens were captured — those users hit the existing
// "Sync failed" UI on expiry and have to reconnect from Settings.
export type DropboxAuth = {
  accessToken: string;
  refreshToken: string | null;
  onAccessTokenRefreshed: (accessToken: string) => void;
};

type FileMetadata = {
  rev: string;
};

// Dropbox's `WriteMode` is a tag union. `add` and `overwrite` carry no
// payload so the short string form is accepted, but `update` carries
// the parent `rev` and must use the explicit `{".tag":"update",…}`
// struct form — sending `update` as a sibling of `mode` makes the
// upload endpoint reject the call with `unknown field 'update'`.
type WriteMode = "add" | { ".tag": "update"; update: string };

export function createDropboxAdapter(
  auth: string | DropboxAuth,
  fetchImpl: FetchImpl = fetch,
): StorageAdapter {
  // Mutable so a silent refresh swap doesn't require rebuilding the
  // adapter (which would invalidate every other consumer of the
  // hook's state and trigger a reload). Plain string `auth` is still
  // accepted for tests and any caller that doesn't need refresh.
  let currentAccessToken: string;
  let refreshToken: string | null;
  let onAccessTokenRefreshed: ((token: string) => void) | null;
  if (typeof auth === "string") {
    currentAccessToken = auth;
    refreshToken = null;
    onAccessTokenRefreshed = null;
  } else {
    currentAccessToken = auth.accessToken;
    refreshToken = auth.refreshToken;
    onAccessTokenRefreshed = auth.onAccessTokenRefreshed;
  }

  // Coalesce in-flight refreshes so a concurrent load + save burst
  // doesn't trade the refresh_token in twice.
  let pendingRefresh: Promise<string> | null = null;
  async function refreshOnce(): Promise<string | null> {
    if (!refreshToken) return null;
    pendingRefresh ??= (async () => {
      try {
        const fresh = await refreshDropboxAccessToken(refreshToken!, fetchImpl);
        currentAccessToken = fresh;
        onAccessTokenRefreshed?.(fresh);
        return fresh;
      } finally {
        pendingRefresh = null;
      }
    })();
    try {
      return await pendingRefresh;
    } catch {
      return null;
    }
  }

  // Issues a request with the current bearer token; on 401 (expired
  // or revoked token), swaps in a new access token via the refresh
  // token and retries exactly once. Anything past one retry falls
  // through to the caller's existing error handling.
  async function authedFetch(
    url: string,
    build: (token: string) => RequestInit,
  ): Promise<Response> {
    let res = await fetchImpl(url, build(currentAccessToken));
    if (res.status === 401) {
      const fresh = await refreshOnce();
      if (fresh) res = await fetchImpl(url, build(fresh));
    }
    return res;
  }

  async function loadFromDropbox(): Promise<Snapshot | null> {
    const res = await authedFetch(DOWNLOAD_ENDPOINT, (token) => ({
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Dropbox-API-Arg": JSON.stringify({ path: DROPBOX_FILE_PATH }),
      },
    }));
    if (res.status === 409) {
      // path/not_found — the app folder is empty (first run on a
      // freshly-connected account). Hand back null so the hook seeds
      // `freshUserData`.
      return null;
    }
    if (!res.ok) {
      throw new Error(`Dropbox load failed: ${res.status} ${await res.text()}`);
    }
    const metaHeader = res.headers.get("Dropbox-API-Result");
    const meta = metaHeader ? (JSON.parse(metaHeader) as FileMetadata) : null;
    const text = await res.text();
    return { text, revision: meta?.rev };
  }

  return {
    id: "dropbox",
    label: "Dropbox",
    saveDebounceMs: SAVE_DEBOUNCE_MS,

    load: () => loadFromDropbox(),

    async save(text: string, baseRevision?: string): Promise<Snapshot> {
      const args: { path: string; mute: boolean; mode: WriteMode } = {
        path: DROPBOX_FILE_PATH,
        mute: true,
        mode: baseRevision ? { ".tag": "update", update: baseRevision } : "add",
      };
      const res = await authedFetch(UPLOAD_ENDPOINT, (token) => ({
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Dropbox-API-Arg": JSON.stringify(args),
          "Content-Type": "application/octet-stream",
        },
        body: text,
      }));
      if (res.status === 409) {
        // Either a write_conflict (the remote moved past our
        // baseRevision) or an "add" mode collision (something else
        // got there first). Re-read so the hook can surface a
        // proper ConflictError with the current bytes.
        const remote = await loadFromDropbox();
        if (remote) throw new ConflictError(remote);
        const detail = await res.text().catch(() => "conflict");
        throw new Error(`Dropbox save failed: 409 ${detail}`);
      }
      if (!res.ok) {
        throw new Error(
          `Dropbox save failed: ${res.status} ${await res.text()}`,
        );
      }
      const meta = (await res.json()) as FileMetadata;
      return { text, revision: meta.rev };
    },
  };
}

// ---- OAuth (PKCE) ---------------------------------------------------

// Kicks the user out to Dropbox's consent page. Returns nothing — the
// next thing that happens is a full-page redirect back to the app
// with `?code=…` set.
export async function startDropboxAuth(): Promise<void> {
  const verifier = randomVerifier();
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  const challenge = await challengeFor(verifier);
  const params = new URLSearchParams({
    client_id: DROPBOX_APP_KEY,
    response_type: "code",
    redirect_uri: redirectUri(),
    code_challenge: challenge,
    code_challenge_method: "S256",
    token_access_type: "offline",
    // Tag the redirect so a multi-provider app can route the ?code=
    // back to the right token exchange. Dropbox echoes `state` back
    // unchanged.
    state: "dropbox",
  });
  window.location.assign(`${AUTH_BASE}?${params.toString()}`);
}

// Trades the code from the redirect for an access + refresh token
// pair. Caller is responsible for persisting both and cleaning the
// URL. `refreshToken` is null only when Dropbox omits it (shouldn't
// happen with `token_access_type=offline`, but treat as best-effort).
// Throws on any failure so the caller can surface the error in the UI.
export type DropboxAuthResult = {
  accessToken: string;
  refreshToken: string | null;
};

export async function completeDropboxAuth(
  code: string,
  fetchImpl: FetchImpl = fetch,
): Promise<DropboxAuthResult> {
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  if (!verifier) {
    throw new Error("Missing PKCE verifier — restart the connect flow");
  }
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  const params = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: DROPBOX_APP_KEY,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
  const res = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`Dropbox token exchange failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
  };
  if (!json.access_token) {
    throw new Error("Dropbox token response missing access_token");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
  };
}

// Trades a refresh token for a fresh access token. Dropbox keeps the
// refresh token stable across calls under the PKCE flow, so the
// caller only needs to persist the new access token. Throws on any
// failure so the adapter can fall back to surfacing the original 401.
export async function refreshDropboxAccessToken(
  refreshToken: string,
  fetchImpl: FetchImpl = fetch,
): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: DROPBOX_APP_KEY,
  });
  const res = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`Dropbox token refresh failed: ${res.status}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("Dropbox refresh response missing access_token");
  }
  return json.access_token;
}
