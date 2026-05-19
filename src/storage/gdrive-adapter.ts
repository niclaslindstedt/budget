import { nsCloudPath } from "../data/constants";
import { debug } from "../utils/debug";
import {
  type BackupOps,
  ConflictError,
  type Snapshot,
  type StorageAdapter,
} from "./adapter";
import {
  BACKUP_INDEX_FILENAME,
  parseBackupIndex,
  serializeBackupIndex,
} from "./backup-index";

const log = debug("gdrive");

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

// Public OAuth client id. The Drive flow uses Google Identity
// Services' token client (popup + postMessage), which is the SPA-
// friendly path Google steers public clients to today — no client
// secret, no redirect URI, no code-for-token exchange. The id itself
// is published in the deployed JS bundle either way; it's read from a
// build-time env var so a fork can plug in its own Google Cloud
// project without inheriting the upstream developer's identifier. Set
// `VITE_GOOGLE_CLIENT_ID` in `.env.local` for dev and as a GitHub
// Actions secret for the production build (see
// `.github/workflows/pages.yml`). Unset means the Google Drive
// backend is disabled in the picker.
//
// Setup:
//   1. Create a Google Cloud project at
//      https://console.cloud.google.com/.
//   2. Enable the Google Drive API for the project (APIs & Services →
//      Library → "Google Drive API" → Enable).
//   3. Create an OAuth 2.0 Client ID (APIs & Services → Credentials →
//      "Create Credentials" → "OAuth client ID" → Application type
//      "Web application"). The token client works with this type.
//   4. Authorized JavaScript origins (the only origin check GIS runs
//      against — it matches `window.location.origin` of the page that
//      calls `requestAccessToken`):
//        https://budget.niclaslindstedt.se
//        http://localhost:5173
//   5. Authorized redirect URIs: leave empty. The token client uses a
//      Google-hosted popup that posts results back via `postMessage`;
//      the app's origin is never the target of a redirect.
//   6. The credential page issues a client secret. Ignore it — public
//      clients running in a browser can't keep one, and the token
//      client never asks for it.
//   7. Expose the client id to the build as `VITE_GOOGLE_CLIENT_ID`.
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

export function isGdriveConfigured(): boolean {
  return GOOGLE_CLIENT_ID.length > 0;
}

// Name of the single file the app reads / writes inside the user's
// My Drive. Surfaced to the user in `SyncDetailsModal`. The preview
// build writes to `budget-preview.json` instead, so the two builds
// share an OAuth registration but never share a file.
export const GDRIVE_FILE_NAME = nsCloudPath("budget.json");

// `drive.file` lets the app see and manage only files it created.
// The file is visible to the user in Drive's UI, which mirrors the
// Dropbox "App folder" visibility model. Switching to
// `drive.appdata` would hide the file but is not what the user picked.
export const GDRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

// Name of the folder Drive backups live inside. Sibling to the main
// `budget.json` file at the root of My Drive — the user can browse
// it directly to spot-check backups or hand them to another tool.
// Preview build uses `budget-backups-preview` so production backups
// are untouched.
export const GDRIVE_BACKUPS_FOLDER_NAME = nsCloudPath("budget-backups");
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

const DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";

// 1-second coalescing window — matches the Dropbox adapter so the
// "save on every change" behaviour is consistent regardless of the
// active cloud backend. Rapid keystrokes inside a single edit gesture
// collapse into one network save; `saveNow()` bypasses this.
const SAVE_DEBOUNCE_MS = 1000;

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
  log.log(`adapter created hasToken=${Boolean(token)}`);
  // The Drive file id never changes for the lifetime of the file, so
  // we look it up by name once and cache it in the closure. The
  // cache is invalidated on 404 (file deleted in Drive) so the next
  // save recreates it.
  let cachedFileId: string | null = null;

  function authHeader(): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  async function findFileId(): Promise<string | null> {
    if (cachedFileId) {
      log.log(`findFileId: cache hit ${cachedFileId}`);
      return cachedFileId;
    }
    const q = `name='${GDRIVE_FILE_NAME}' and trashed=false`;
    const url = `${DRIVE_FILES_API}?q=${encodeURIComponent(
      q,
    )}&spaces=drive&fields=files(id)`;
    log.log(`findFileId: query ${q}`);
    const start = performance.now();
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: authHeader() });
    } catch (err) {
      log.error("findFileId: network error", err);
      throw err;
    }
    const ms = (performance.now() - start).toFixed(0);
    log.log(`findFileId: → ${res.status} (${ms}ms)`);
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      log.error(`findFileId: failed ${res.status}`, body);
      throw new Error(`Google Drive search failed: ${res.status} ${body}`);
    }
    const json = (await res.json()) as DriveListResponse;
    cachedFileId = json.files?.[0]?.id ?? null;
    log.log(`findFileId: result ${cachedFileId ?? "<none>"}`);
    return cachedFileId;
  }

  async function load(): Promise<Snapshot | null> {
    log.log("load: start");
    const fileId = await findFileId();
    if (!fileId) {
      log.log("load: no file id — empty");
      return null;
    }
    const url = `${DRIVE_FILES_API}/${fileId}?alt=media`;
    const start = performance.now();
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: authHeader() });
    } catch (err) {
      log.error("load: network error", err);
      throw err;
    }
    const ms = (performance.now() - start).toFixed(0);
    log.log(`load: download → ${res.status} (${ms}ms)`);
    if (res.status === 404) {
      // File was deleted between the search and the download. Drop
      // the cache so the next save recreates it.
      log.warn("load: 404 — cached id is stale, clearing");
      cachedFileId = null;
      return null;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      log.error(`load: failed ${res.status}`, body);
      throw new Error(`Google Drive load failed: ${res.status} ${body}`);
    }
    const text = await res.text();
    const revision = res.headers.get("ETag") ?? undefined;
    log.log(`load: bytes=${text.length} etag=${revision ?? "<none>"}`);
    return { text, revision };
  }

  async function create(text: string): Promise<Snapshot> {
    log.log(`create: multipart upload bytes=${text.length}`);
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
    const start = performance.now();
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
    const ms = (performance.now() - start).toFixed(0);
    log.log(`create: → ${res.status} (${ms}ms)`);
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      log.error(`create: failed ${res.status}`, body);
      throw new Error(`Google Drive create failed: ${res.status} ${body}`);
    }
    const meta2 = (await res.json()) as DriveFile;
    cachedFileId = meta2.id;
    log.log(`create: ok id=${cachedFileId}, fetching ETag`);
    const head = await fetchImpl(
      `${DRIVE_FILES_API}/${cachedFileId}?fields=id`,
      {
        headers: authHeader(),
      },
    );
    const revision = head.headers.get("ETag") ?? undefined;
    log.log(`create: etag=${revision ?? "<none>"}`);
    return { text, revision };
  }

  async function save(text: string, baseRevision?: string): Promise<Snapshot> {
    log.log(`save: bytes=${text.length} baseRev=${baseRevision ?? "<none>"}`);
    const fileId = await findFileId();
    if (!fileId) {
      log.log("save: no file id — creating");
      return create(text);
    }
    const headers: Record<string, string> = {
      ...authHeader(),
      "Content-Type": "application/octet-stream",
    };
    if (baseRevision) headers["If-Match"] = baseRevision;
    const start = performance.now();
    const res = await fetchImpl(
      `${DRIVE_UPLOAD_API}/${fileId}?uploadType=media`,
      { method: "PATCH", headers, body: text },
    );
    const ms = (performance.now() - start).toFixed(0);
    log.log(`save: PATCH → ${res.status} (${ms}ms)`);
    if (res.status === 412) {
      log.warn("save: 412 If-Match failed — re-reading remote");
      // Precondition failed — the remote ETag moved past our
      // baseRevision. Re-fetch so the hook can surface a proper
      // ConflictError with the current bytes.
      const remote = await load();
      if (remote) throw new ConflictError(remote);
      log.error("save: 412 with no remote bytes");
      throw new Error("Google Drive save failed: 412 with no remote bytes");
    }
    if (res.status === 404) {
      log.warn("save: 404 — cached id stale, recreating");
      // The cached fileId is stale (user deleted the file in Drive).
      // Drop the cache and recreate from scratch.
      cachedFileId = null;
      return create(text);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      log.error(`save: failed ${res.status}`, body);
      throw new Error(`Google Drive save failed: ${res.status} ${body}`);
    }
    const revision = res.headers.get("ETag") ?? undefined;
    log.log(`save: ok etag=${revision ?? "<none>"}`);
    return { text, revision };
  }

  // Drive folders are first-class file objects keyed by ID. Looking
  // up the backups folder is one extra round trip — cached in the
  // adapter closure so subsequent backup ops skip the query.
  let cachedBackupsFolderId: string | null = null;

  async function ensureBackupsFolder(): Promise<string> {
    if (cachedBackupsFolderId) return cachedBackupsFolderId;
    const q =
      `name='${GDRIVE_BACKUPS_FOLDER_NAME}' and mimeType='${FOLDER_MIME_TYPE}'` +
      ` and trashed=false`;
    const url = `${DRIVE_FILES_API}?q=${encodeURIComponent(
      q,
    )}&spaces=drive&fields=files(id)`;
    log.log(`backups: ensureFolder query`);
    const res = await fetchImpl(url, { headers: authHeader() });
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      throw new Error(
        `Google Drive folder lookup failed: ${res.status} ${body}`,
      );
    }
    const json = (await res.json()) as DriveListResponse;
    const existing = json.files?.[0]?.id;
    if (existing) {
      cachedBackupsFolderId = existing;
      log.log(`backups: folder found ${existing}`);
      return existing;
    }
    log.log("backups: folder missing — creating");
    const createRes = await fetchImpl(`${DRIVE_FILES_API}?fields=id`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: GDRIVE_BACKUPS_FOLDER_NAME,
        mimeType: FOLDER_MIME_TYPE,
      }),
    });
    if (!createRes.ok) {
      const body = await createRes.text().catch(() => "<unreadable>");
      throw new Error(
        `Google Drive folder create failed: ${createRes.status} ${body}`,
      );
    }
    const meta = (await createRes.json()) as DriveFile;
    cachedBackupsFolderId = meta.id;
    return meta.id;
  }

  // Look up a file by name inside the backups folder. Returns null
  // when no such file exists — both the index and individual backup
  // bodies can be missing on first run.
  async function findInBackupsFolder(name: string): Promise<string | null> {
    const folderId = await ensureBackupsFolder();
    const q =
      `name='${escapeDriveQuery(name)}' and '${folderId}' in parents` +
      ` and trashed=false`;
    const url = `${DRIVE_FILES_API}?q=${encodeURIComponent(
      q,
    )}&spaces=drive&fields=files(id)`;
    const res = await fetchImpl(url, { headers: authHeader() });
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      throw new Error(
        `Google Drive backup lookup failed: ${res.status} ${body}`,
      );
    }
    const json = (await res.json()) as DriveListResponse;
    return json.files?.[0]?.id ?? null;
  }

  async function downloadBackup(name: string): Promise<string | null> {
    const id = await findInBackupsFolder(name);
    if (!id) return null;
    const res = await fetchImpl(`${DRIVE_FILES_API}/${id}?alt=media`, {
      headers: authHeader(),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      throw new Error(
        `Google Drive backup download failed: ${res.status} ${body}`,
      );
    }
    return res.text();
  }

  async function uploadBackup(name: string, text: string): Promise<void> {
    const folderId = await ensureBackupsFolder();
    const existing = await findInBackupsFolder(name);
    if (existing) {
      const res = await fetchImpl(
        `${DRIVE_UPLOAD_API}/${existing}?uploadType=media`,
        {
          method: "PATCH",
          headers: {
            ...authHeader(),
            "Content-Type": "application/octet-stream",
          },
          body: text,
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "<unreadable>");
        throw new Error(
          `Google Drive backup update failed: ${res.status} ${body}`,
        );
      }
      return;
    }
    const meta = JSON.stringify({ name, parents: [folderId] });
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
      const body = await res.text().catch(() => "<unreadable>");
      throw new Error(
        `Google Drive backup create failed: ${res.status} ${body}`,
      );
    }
  }

  const backups: BackupOps = {
    async list() {
      log.log("backups: list");
      const raw = await downloadBackup(BACKUP_INDEX_FILENAME);
      return parseBackupIndex(raw);
    },
    async create(text, metadata) {
      log.log(`backups: create ${metadata.filename} bytes=${text.length}`);
      await uploadBackup(metadata.filename, text);
      const existing = parseBackupIndex(
        await downloadBackup(BACKUP_INDEX_FILENAME),
      );
      const next = [
        metadata,
        ...existing.filter((m) => m.filename !== metadata.filename),
      ];
      await uploadBackup(BACKUP_INDEX_FILENAME, serializeBackupIndex(next));
    },
    async read(filename) {
      log.log(`backups: read ${filename}`);
      const text = await downloadBackup(filename);
      if (text === null) {
        throw new Error(`Backup not found: ${filename}`);
      }
      return text;
    },
  };

  return {
    id: "gdrive",
    label: "Google Drive",
    saveDebounceMs: SAVE_DEBOUNCE_MS,
    backups,
    load,
    save,
  };
}

// Drive's `q` parameter takes single-quoted string literals. The only
// characters that need escaping inside one are `'` and `\` — Google's
// docs spell out exactly these two. The backup filenames we mint
// don't include either today, but the escape is cheap insurance.
function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function randomBoundary(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

// ---- OAuth (GIS token client) --------------------------------------

// Google Identity Services token client. The popup flow is the modern
// SPA path — no redirect URI, no `/token` exchange, no client secret.
// `requestAccessToken` opens a Google-hosted consent popup; the popup
// posts the result back to GIS via `postMessage`, and GIS hands us an
// access token through `callback`. Tokens are short-lived (~1h) and
// there is no refresh token; the user reconnects when an API call
// returns 401.
//
// The GIS script is loaded lazily on first connect so an offline app
// load doesn't hang on accounts.google.com.

const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";

type GisTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GisTokenClientConfig = {
  client_id: string;
  scope: string;
  callback: (response: GisTokenResponse) => void;
  error_callback?: (err: GisErrorResponse) => void;
};

type GisTokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
};

type GisErrorResponse = {
  type: string;
  message?: string;
};

type GisGlobal = {
  accounts: {
    oauth2: {
      initTokenClient(config: GisTokenClientConfig): GisTokenClient;
    };
  };
};

declare global {
  interface Window {
    google?: GisGlobal;
  }
}

let gisLoaderPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (typeof window !== "undefined" && window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gisLoaderPromise) return gisLoaderPromise;
  log.log("loadGisScript: injecting <script>");
  gisLoaderPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) {
        log.log("loadGisScript: ready");
        resolve();
      } else {
        log.error("loadGisScript: loaded but globals missing");
        gisLoaderPromise = null;
        reject(
          new Error("Google Identity Services loaded but globals missing"),
        );
      }
    };
    script.onerror = () => {
      log.error("loadGisScript: network error");
      gisLoaderPromise = null;
      reject(new Error("Failed to load Google Identity Services script"));
    };
    document.head.appendChild(script);
  });
  return gisLoaderPromise;
}

// Opens the Google consent popup and resolves with a short-lived
// access token. Throws when the user dismisses the popup, the popup
// is blocked, or Google returns an error. Caller persists the token
// (via `commitGdriveLink`) once any post-auth confirmation is done.
export async function startGdriveAuth(): Promise<string> {
  log.log("startGdriveAuth: loading GIS");
  await loadGisScript();
  const gis = window.google?.accounts?.oauth2;
  if (!gis) {
    throw new Error("Google Identity Services unavailable after load");
  }
  log.log("startGdriveAuth: opening consent popup");
  return new Promise<string>((resolve, reject) => {
    const client = gis.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GDRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error) {
          const desc = resp.error_description ?? resp.error;
          log.error(`token client: error ${resp.error} (${desc})`);
          reject(new Error(`Google sign-in failed: ${desc}`));
          return;
        }
        if (!resp.access_token) {
          log.error("token client: no access_token in response");
          reject(new Error("Google did not return an access token"));
          return;
        }
        log.log(`token client: token received expires_in=${resp.expires_in}`);
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        log.error(`token client: error_callback type=${err.type}`);
        reject(
          new Error(
            err.message ?? `Google sign-in ${err.type ?? "failed"}`,
          ),
        );
      },
    });
    client.requestAccessToken();
  });
}
