import { ConflictError, type Snapshot, type StorageAdapter } from "./adapter";

// Dropbox-backed `StorageAdapter`. Talks to the v2 HTTP API directly
// (no SDK — two endpoints don't justify ~100kB of bundle) and stores
// the budget as a single file at `/budget.json` inside the app's
// scoped folder. Encryption happens one level up in `withEncryption`,
// so the bytes that land in Dropbox are the same AES-GCM envelope
// that localStorage would have held.
//
// Concurrency mirrors Dropbox's own `rev`: `Snapshot.revision` round-
// trips through the hook, and `save` uses `update` mode with the
// previous `rev` so a remote that moved underneath us surfaces as
// `ConflictError` instead of a silent overwrite.

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

type FileMetadata = {
  rev: string;
};

type SaveArgs = { mode: "add" } | { mode: "update"; update: string };

async function loadFromDropbox(
  token: string,
  fetchImpl: FetchImpl,
): Promise<Snapshot | null> {
  const res = await fetchImpl(DOWNLOAD_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Dropbox-API-Arg": JSON.stringify({ path: DROPBOX_FILE_PATH }),
    },
  });
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

export function createDropboxAdapter(
  token: string,
  fetchImpl: FetchImpl = fetch,
): StorageAdapter {
  return {
    id: "dropbox",
    label: "Dropbox",
    saveDebounceMs: SAVE_DEBOUNCE_MS,

    load: () => loadFromDropbox(token, fetchImpl),

    async save(text: string, baseRevision?: string): Promise<Snapshot> {
      const args: { path: string; mute: boolean } & SaveArgs = baseRevision
        ? {
            path: DROPBOX_FILE_PATH,
            mode: "update",
            update: baseRevision,
            mute: true,
          }
        : { path: DROPBOX_FILE_PATH, mode: "add", mute: true };
      const res = await fetchImpl(UPLOAD_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Dropbox-API-Arg": JSON.stringify(args),
          "Content-Type": "application/octet-stream",
        },
        body: text,
      });
      if (res.status === 409) {
        // Either a write_conflict (the remote moved past our
        // baseRevision) or an "add" mode collision (something else
        // got there first). Re-read so the hook can surface a
        // proper ConflictError with the current bytes.
        const remote = await loadFromDropbox(token, fetchImpl);
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

function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function challengeFor(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function redirectUri(): string {
  // The OAuth app registration must list this exact URI; we use the
  // current page origin so prod and local dev work without forking.
  return `${window.location.origin}/`;
}

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
  });
  window.location.assign(`${AUTH_BASE}?${params.toString()}`);
}

// Trades the code from the redirect for an access token. Caller is
// responsible for persisting the result and cleaning the URL. Throws
// on any failure so the caller can surface the error in the UI.
export async function completeDropboxAuth(
  code: string,
  fetchImpl: FetchImpl = fetch,
): Promise<string> {
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
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("Dropbox token response missing access_token");
  }
  return json.access_token;
}
