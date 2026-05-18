import { ConflictError, type Snapshot, type StorageAdapter } from "./adapter";
import { type OAuthConfig, completeAuth, startAuth } from "./oauth-pkce";

// Google-Drive-backed `StorageAdapter`. Talks to the Drive v3 REST
// API directly (no SDK — Drive v3 is two endpoints away from "two
// fetch calls", same shape as the Dropbox adapter). Bytes land at
// `/budget.json` in the user's My Drive, written under the
// `drive.file` scope so the file is visible to the user (they can
// browse it, share it, or delete it directly from drive.google.com).
//
// Concurrency rides on Drive's ETag: `Snapshot.revision` is the ETag
// returned from the previous `load` / `save`, and the next `save`
// passes it back via `If-Match`. A 412 surfaces as `ConflictError`
// carrying the fresh remote snapshot.

// Public OAuth client id. PKCE makes the client secret unnecessary
// for browser-based public clients, and the id itself is published in
// the deployed JS bundle either way — bake it in for zero env-var
// infrastructure.
//
// Setup:
//   1. Create a Google Cloud project at
//      https://console.cloud.google.com/.
//   2. Enable the Google Drive API for the project (APIs & Services →
//      Library → "Google Drive API" → Enable).
//   3. Create an OAuth 2.0 Client ID (APIs & Services → Credentials →
//      "Create Credentials" → "OAuth client ID" → Application type
//      "Web application").
//   4. Authorized JavaScript origins:
//        https://budget.niclaslindstedt.se
//        http://localhost:5173
//      Authorized redirect URIs (no trailing slash — Google rejects
//      that, and `redirectUri()` matches by returning the bare
//      origin):
//        https://budget.niclaslindstedt.se
//        http://localhost:5173
//   5. The credential page issues a client secret. PKCE makes it
//      optional — ignore it here.
//   6. Paste the client id below.
export const GOOGLE_CLIENT_ID =
  "945081762861-mgrai26dghkrtpt4csrnspvj54afjvib.apps.googleusercontent.com";

// Name of the single file the app reads / writes inside the user's
// My Drive. Surfaced to the user in `SyncDetailsModal`.
export const GDRIVE_FILE_NAME = "budget.json";

// `drive.file` lets the app see and manage only files it created.
// The file is visible to the user in Drive's UI, which mirrors the
// Dropbox "App folder" visibility model. Switching to
// `drive.appdata` would hide the file but is not what the user picked.
export const GDRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";

// 1-second coalescing window — matches the Dropbox adapter so the
// "save on every change" behaviour is consistent regardless of the
// active cloud backend. Rapid keystrokes inside a single edit gesture
// collapse into one network save; `saveNow()` bypasses this.
const SAVE_DEBOUNCE_MS = 1000;

// `sessionStorage` survives the OAuth redirect round-trip but is
// scoped to the tab, so a parallel auth flow in another tab can't
// race with this one. Per-provider key so the Dropbox and Drive
// verifiers can coexist if the user kicks off both.
const PKCE_VERIFIER_KEY = "budget.gdrive.pkce.verifier";

export type FetchImpl = typeof fetch;

// Returns a URL that opens the budget file (or the Drive home, if
// the file id isn't known here) in Drive's web UI. Used by the
// cloud-sync modal's "Open in Google Drive" button.
export function gdriveWebUrl(fileId: string | null): string {
  return fileId
    ? `https://drive.google.com/file/d/${fileId}/view`
    : "https://drive.google.com/drive/my-drive";
}

type DriveFile = { id: string };
type DriveListResponse = { files?: DriveFile[] };

export function createGdriveAdapter(
  token: string,
  fetchImpl: FetchImpl = fetch,
): StorageAdapter {
  // The Drive file id never changes for the lifetime of the file, so
  // we look it up by name once and cache it in the closure. The
  // cache is invalidated on 404 (file deleted in Drive) so the next
  // save recreates it.
  let cachedFileId: string | null = null;

  function authHeader(): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  async function findFileId(): Promise<string | null> {
    if (cachedFileId) return cachedFileId;
    const q = `name='${GDRIVE_FILE_NAME}' and trashed=false`;
    const url = `${DRIVE_FILES_API}?q=${encodeURIComponent(
      q,
    )}&spaces=drive&fields=files(id)`;
    const res = await fetchImpl(url, { headers: authHeader() });
    if (!res.ok) {
      throw new Error(
        `Google Drive search failed: ${res.status} ${await res.text()}`,
      );
    }
    const json = (await res.json()) as DriveListResponse;
    cachedFileId = json.files?.[0]?.id ?? null;
    return cachedFileId;
  }

  async function load(): Promise<Snapshot | null> {
    const fileId = await findFileId();
    if (!fileId) return null;
    const res = await fetchImpl(`${DRIVE_FILES_API}/${fileId}?alt=media`, {
      headers: authHeader(),
    });
    if (res.status === 404) {
      // File was deleted between the search and the download. Drop
      // the cache so the next save recreates it.
      cachedFileId = null;
      return null;
    }
    if (!res.ok) {
      throw new Error(
        `Google Drive load failed: ${res.status} ${await res.text()}`,
      );
    }
    const text = await res.text();
    const revision = res.headers.get("ETag") ?? undefined;
    return { text, revision };
  }

  async function create(text: string): Promise<Snapshot> {
    // Multipart upload — one part is the metadata (the file name),
    // the other is the body. Drive returns the new file id but not
    // the ETag in this response, so we issue a tiny follow-up HEAD
    // to pick up the revision token.
    const meta = JSON.stringify({ name: GDRIVE_FILE_NAME });
    const boundary = `budget-${randomBoundary()}`;
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n${text}\r\n` +
      `--${boundary}--`;
    const res = await fetchImpl(
      `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id`,
      {
        method: "POST",
        headers: {
          ...authHeader(),
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );
    if (!res.ok) {
      throw new Error(
        `Google Drive create failed: ${res.status} ${await res.text()}`,
      );
    }
    const meta2 = (await res.json()) as DriveFile;
    cachedFileId = meta2.id;
    const head = await fetchImpl(
      `${DRIVE_FILES_API}/${cachedFileId}?fields=id`,
      {
        headers: authHeader(),
      },
    );
    const revision = head.headers.get("ETag") ?? undefined;
    return { text, revision };
  }

  async function save(text: string, baseRevision?: string): Promise<Snapshot> {
    const fileId = await findFileId();
    if (!fileId) return create(text);
    const headers: Record<string, string> = {
      ...authHeader(),
      "Content-Type": "application/octet-stream",
    };
    if (baseRevision) headers["If-Match"] = baseRevision;
    const res = await fetchImpl(
      `${DRIVE_UPLOAD_API}/${fileId}?uploadType=media`,
      { method: "PATCH", headers, body: text },
    );
    if (res.status === 412) {
      // Precondition failed — the remote ETag moved past our
      // baseRevision. Re-fetch so the hook can surface a proper
      // ConflictError with the current bytes.
      const remote = await load();
      if (remote) throw new ConflictError(remote);
      throw new Error("Google Drive save failed: 412 with no remote bytes");
    }
    if (res.status === 404) {
      // The cached fileId is stale (user deleted the file in Drive).
      // Drop the cache and recreate from scratch.
      cachedFileId = null;
      return create(text);
    }
    if (!res.ok) {
      throw new Error(
        `Google Drive save failed: ${res.status} ${await res.text()}`,
      );
    }
    const revision = res.headers.get("ETag") ?? undefined;
    return { text, revision };
  }

  return {
    id: "gdrive",
    label: "Google Drive",
    saveDebounceMs: SAVE_DEBOUNCE_MS,
    load,
    save,
  };
}

function randomBoundary(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

// ---- OAuth (PKCE) ---------------------------------------------------

const GDRIVE_OAUTH: OAuthConfig = {
  authBase: AUTH_BASE,
  tokenEndpoint: TOKEN_ENDPOINT,
  clientId: GOOGLE_CLIENT_ID,
  state: "gdrive",
  verifierKey: PKCE_VERIFIER_KEY,
  providerName: "Google",
  extraAuthParams: {
    scope: GDRIVE_SCOPE,
    // Short-lived access token only. Refresh tokens for browser-
    // based clients are discouraged by Google; the user reconnects
    // manually when the access token expires (~1h).
    access_type: "online",
    include_granted_scopes: "true",
  },
};

export function startGdriveAuth(): Promise<void> {
  return startAuth(GDRIVE_OAUTH);
}

export async function completeGdriveAuth(
  code: string,
  fetchImpl: FetchImpl = fetch,
): Promise<string> {
  const result = await completeAuth(GDRIVE_OAUTH, code, fetchImpl);
  return result.accessToken;
}
