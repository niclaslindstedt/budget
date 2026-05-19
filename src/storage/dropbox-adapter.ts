import { debug } from "../utils/debug";
import {
  type BackupOps,
  ConflictError,
  type Snapshot,
  type StorageAdapter,
} from "./adapter";
import { parseBackupIndex, serializeBackupIndex } from "./backup-index";
import {
  type OAuthConfig,
  type TokenResult,
  completeAuth,
  refreshAccessToken,
  startAuth,
} from "./oauth-pkce";

const log = debug("dropbox");

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
// Its redirect URIs must include `https://budget.niclaslindstedt.se`
// (prod) and `http://localhost:5173` (dev), no trailing slash —
// `startDropboxAuth` derives the URI from `window.location.origin`
// and Dropbox requires an exact match.
export const DROPBOX_APP_KEY = "fjk4dj166rrzuiw";

// Public folder name inside the user's Dropbox `Apps/` directory. This
// matches the Dropbox app registration's "App folder" name and is what
// the user will see when browsing Dropbox in their file manager.
export const DROPBOX_APP_FOLDER = "budget.niclaslindstedt.se";

export const DROPBOX_FILE_PATH = "/budget.json";
export const DROPBOX_BACKUPS_FOLDER = "/backups";
export const DROPBOX_BACKUPS_INDEX_PATH = `${DROPBOX_BACKUPS_FOLDER}/index.json`;

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

// 1-second coalescing window so cloud sync matches local-storage
// "save on every change" in feel — rapid keystrokes within a single
// edit gesture collapse into one network save, but anything the user
// would recognise as a discrete change lands in Dropbox right after
// they finish it. `saveNow()` (the disk button) still bypasses this
// for the immediate-flush escape hatch.
const SAVE_DEBOUNCE_MS = 1000;

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
  log.log(
    `adapter created hasAccessToken=${Boolean(currentAccessToken)} hasRefreshToken=${Boolean(refreshToken)}`,
  );

  // Coalesce in-flight refreshes so a concurrent load + save burst
  // doesn't trade the refresh_token in twice.
  let pendingRefresh: Promise<string> | null = null;
  async function refreshOnce(): Promise<string | null> {
    if (!refreshToken) {
      log.warn("refresh skipped — no refresh token (legacy connection)");
      return null;
    }
    if (!pendingRefresh) {
      log.log("refreshing access token");
    } else {
      log.log("refresh already in flight — joining");
    }
    pendingRefresh ??= (async () => {
      try {
        const start = performance.now();
        const fresh = await refreshDropboxAccessToken(refreshToken!, fetchImpl);
        const ms = (performance.now() - start).toFixed(0);
        log.log(`refresh ok (${ms}ms)`);
        currentAccessToken = fresh;
        onAccessTokenRefreshed?.(fresh);
        return fresh;
      } finally {
        pendingRefresh = null;
      }
    })();
    try {
      return await pendingRefresh;
    } catch (err) {
      log.error("refresh failed", err);
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
    const start = performance.now();
    log.log(`fetch ${shortUrl(url)}`);
    let res: Response;
    try {
      res = await fetchImpl(url, build(currentAccessToken));
    } catch (err) {
      log.error(`fetch network error ${shortUrl(url)}`, err);
      throw err;
    }
    const ms = (performance.now() - start).toFixed(0);
    log.log(`fetch ${shortUrl(url)} → ${res.status} (${ms}ms)`);
    if (res.status === 401) {
      log.log("401 received — attempting silent refresh");
      const fresh = await refreshOnce();
      if (fresh) {
        const retryStart = performance.now();
        try {
          res = await fetchImpl(url, build(fresh));
        } catch (err) {
          log.error(`retry network error ${shortUrl(url)}`, err);
          throw err;
        }
        const retryMs = (performance.now() - retryStart).toFixed(0);
        log.log(`retry ${shortUrl(url)} → ${res.status} (${retryMs}ms)`);
      } else {
        log.warn("no refresh available — surfacing original 401");
      }
    }
    return res;
  }

  async function loadFromDropbox(): Promise<Snapshot | null> {
    log.log(`load: download path=${DROPBOX_FILE_PATH}`);
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
      log.log("load: 409 path/not_found — empty app folder");
      return null;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      log.error(`load: failed ${res.status}`, body);
      throw new Error(`Dropbox load failed: ${res.status} ${body}`);
    }
    const metaHeader = res.headers.get("Dropbox-API-Result");
    let meta: FileMetadata | null = null;
    if (metaHeader) {
      try {
        meta = JSON.parse(metaHeader) as FileMetadata;
      } catch (err) {
        log.warn("load: Dropbox-API-Result header was not valid JSON", err);
      }
    }
    const readStart = performance.now();
    const text = await res.text();
    const readMs = (performance.now() - readStart).toFixed(0);
    log.log(
      `load: read body ${text.length} bytes (${readMs}ms) rev=${meta?.rev ?? "<none>"}`,
    );
    return { text, revision: meta?.rev };
  }

  async function readBackupFile(path: string): Promise<string | null> {
    const res = await authedFetch(DOWNLOAD_ENDPOINT, (token) => ({
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Dropbox-API-Arg": JSON.stringify({ path }),
      },
    }));
    if (res.status === 409) return null;
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      throw new Error(`Dropbox backup download failed: ${res.status} ${body}`);
    }
    return res.text();
  }

  async function uploadBackupFile(path: string, text: string): Promise<void> {
    const args = {
      path,
      mute: true,
      mode: "overwrite",
      autorename: false,
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
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      throw new Error(`Dropbox backup upload failed: ${res.status} ${body}`);
    }
  }

  const backups: BackupOps = {
    async list() {
      log.log("backups: list");
      const raw = await readBackupFile(DROPBOX_BACKUPS_INDEX_PATH);
      return parseBackupIndex(raw);
    },
    async create(text, metadata) {
      log.log(`backups: create ${metadata.filename} bytes=${text.length}`);
      await uploadBackupFile(
        `${DROPBOX_BACKUPS_FOLDER}/${metadata.filename}`,
        text,
      );
      const existing = parseBackupIndex(
        await readBackupFile(DROPBOX_BACKUPS_INDEX_PATH),
      );
      const next = [
        metadata,
        ...existing.filter((m) => m.filename !== metadata.filename),
      ];
      await uploadBackupFile(
        DROPBOX_BACKUPS_INDEX_PATH,
        serializeBackupIndex(next),
      );
    },
    async read(filename) {
      log.log(`backups: read ${filename}`);
      const text = await readBackupFile(
        `${DROPBOX_BACKUPS_FOLDER}/${filename}`,
      );
      if (text === null) {
        throw new Error(`Backup not found: ${filename}`);
      }
      return text;
    },
  };

  return {
    id: "dropbox",
    label: "Dropbox",
    saveDebounceMs: SAVE_DEBOUNCE_MS,
    backups,

    load: () => loadFromDropbox(),

    async save(text: string, baseRevision?: string): Promise<Snapshot> {
      const args: { path: string; mute: boolean; mode: WriteMode } = {
        path: DROPBOX_FILE_PATH,
        mute: true,
        mode: baseRevision ? { ".tag": "update", update: baseRevision } : "add",
      };
      log.log(
        `save: upload bytes=${text.length} mode=${
          baseRevision ? `update(${baseRevision})` : "add"
        }`,
      );
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
        log.warn("save: 409 — re-reading remote to surface conflict");
        // Either a write_conflict (the remote moved past our
        // baseRevision) or an "add" mode collision (something else
        // got there first). Re-read so the hook can surface a
        // proper ConflictError with the current bytes.
        const remote = await loadFromDropbox();
        if (remote) throw new ConflictError(remote);
        const detail = await res.text().catch(() => "conflict");
        log.error(`save: 409 with no remote bytes: ${detail}`);
        throw new Error(`Dropbox save failed: 409 ${detail}`);
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "<unreadable>");
        log.error(`save: failed ${res.status}`, body);
        throw new Error(`Dropbox save failed: ${res.status} ${body}`);
      }
      const meta = (await res.json()) as FileMetadata;
      log.log(`save: ok rev=${meta.rev}`);
      return { text, revision: meta.rev };
    },
  };
}

// ---- OAuth (PKCE) ---------------------------------------------------

const DROPBOX_OAUTH: OAuthConfig = {
  authBase: AUTH_BASE,
  tokenEndpoint: TOKEN_ENDPOINT,
  clientId: DROPBOX_APP_KEY,
  state: "dropbox",
  verifierKey: PKCE_VERIFIER_KEY,
  providerName: "Dropbox",
  extraAuthParams: { token_access_type: "offline" },
};

export type DropboxAuthResult = TokenResult;

export function startDropboxAuth(): Promise<void> {
  return startAuth(DROPBOX_OAUTH);
}

export function completeDropboxAuth(
  code: string,
  fetchImpl: FetchImpl = fetch,
): Promise<DropboxAuthResult> {
  return completeAuth(DROPBOX_OAUTH, code, fetchImpl);
}

export function refreshDropboxAccessToken(
  refreshToken: string,
  fetchImpl: FetchImpl = fetch,
): Promise<string> {
  return refreshAccessToken(DROPBOX_OAUTH, refreshToken, fetchImpl);
}

// Short tail of a URL, used in logs so each line stays readable
// without dumping the full `content.dropboxapi.com/2/files/<endpoint>`
// preamble every time.
function shortUrl(url: string): string {
  const idx = url.lastIndexOf("/");
  return idx >= 0 ? url.slice(idx + 1) : url;
}
