import { nsCloudPath, nsKey } from "../data/constants/storage";
import { createLogger } from "../utils/logger";
import {
  AuthError,
  ConflictError,
  RateLimitError,
  type Snapshot,
  type StorageAdapter,
} from "./adapter";
import { createBackupOps } from "./backup-ops";
import {
  type OAuthConfig,
  type TokenResult,
  completeAuth,
  refreshAccessToken,
  startAuth,
} from "./oauth-pkce";

const log = createLogger("dropbox");

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
// way — but it's read from a build-time env var so a fork can plug in
// its own Dropbox app without inheriting the upstream developer's
// identifier. Set `VITE_DROPBOX_APP_KEY` in `.env.local` for dev and
// as a GitHub Actions secret for the production build (see
// `.github/workflows/pages.yml`). Unset means the Dropbox backend is
// disabled in the picker.
//
// The matching app is registered at
// https://www.dropbox.com/developers/apps as "Scoped access" with
// permission type "App folder" (folder name `budget.niclaslindstedt.se`).
// Its redirect URIs must include `https://budget.niclaslindstedt.se`
// (prod) and `http://localhost:5173` (dev), no trailing slash —
// `startDropboxAuth` derives the URI from `window.location.origin`
// and Dropbox requires an exact match.
export const DROPBOX_APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY ?? "";

export function isDropboxConfigured(): boolean {
  return DROPBOX_APP_KEY.length > 0;
}

// Public folder name inside the user's Dropbox `Apps/` directory. This
// matches the Dropbox app registration's "App folder" name and is what
// the user will see when browsing Dropbox in their file manager.
export const DROPBOX_APP_FOLDER = "budget.niclaslindstedt.se";

// Preview build writes to a `/preview/` subfolder inside the same
// registered Dropbox app folder so it cannot read or overwrite the
// production budget file or its backups.
export const DROPBOX_FILE_PATH = nsCloudPath("/budget.json");
export const DROPBOX_BACKUPS_FOLDER = nsCloudPath("/backups");
export const DROPBOX_BACKUPS_INDEX_PATH = `${DROPBOX_BACKUPS_FOLDER}/index.json`;
export const DROPBOX_RECEIPTS_FOLDER = nsCloudPath("/receipts");
export const DROPBOX_PAYSLIPS_FOLDER = nsCloudPath("/payslips");
export const DROPBOX_PROPERTIES_FOLDER = nsCloudPath("/properties");
export const DROPBOX_EXPORTS_FOLDER = nsCloudPath("/exports");

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
const DELETE_ENDPOINT = "https://api.dropboxapi.com/2/files/delete_v2";

// 1-second coalescing window so cloud sync matches local-storage
// "save on every change" in feel — rapid keystrokes within a single
// edit gesture collapse into one network save, but anything the user
// would recognise as a discrete change lands in Dropbox right after
// they finish it. `saveNow()` (the disk button) still bypasses this
// for the immediate-flush escape hatch.
const SAVE_DEBOUNCE_MS = 1000;

// Floor for the cooldown after Dropbox returns 429 "too_many_write_operations".
// Dropbox normally sets `Retry-After`, but we clamp to at least this so a
// missing / zero / one-second header still gives the burst a chance to
// settle before we try again.
const RATE_LIMIT_FALLBACK_MS = 5000;

// `sessionStorage` survives the OAuth redirect round-trip but is
// scoped to the tab, so a parallel auth flow in another tab can't
// race with this one.
const PKCE_VERIFIER_KEY = nsKey("budget.dropbox.pkce.verifier");

export type FetchImpl = typeof fetch;

// Serialize an argument struct for the `Dropbox-API-Arg` header. The
// header travels as an HTTP header value, which the browser's `fetch`
// refuses to send when it contains a code point above U+00FF — it throws
// a bare `TypeError: Load failed` before the request leaves the tab. A
// receipt / payslip path derived from a user-typed merchant or item name
// routinely carries such characters (an em dash "—", a smart quote "’",
// an emoji, any non-Latin script), so a raw `JSON.stringify` would make
// those uploads fail with no useful error. Dropbox documents the fix and
// ships it in its own SDKs as `http_header_safe_json`: ASCII-escape every
// character at or above U+0080 to its `\uXXXX` form, which is valid JSON
// Dropbox decodes back to the original string. Latin-1-but-non-ASCII
// characters (å, é, …) also need escaping — the byte the header would
// otherwise carry is misread by Dropbox as Latin-1, not UTF-8 — so the
// threshold is U+0080, not U+0100.
export function dropboxApiArg(arg: unknown): string {
  return JSON.stringify(arg).replace(
    /[\u0080-\uffff]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

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
  log.info(
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
      log.info("refreshing access token");
    } else {
      log.info("refresh already in flight — joining");
    }
    pendingRefresh ??= (async () => {
      try {
        const start = performance.now();
        const fresh = await refreshDropboxAccessToken(refreshToken!, fetchImpl);
        const ms = (performance.now() - start).toFixed(0);
        log.info(`refresh ok (${ms}ms)`);
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
    log.info(`fetch ${shortUrl(url)}`);
    let res: Response;
    try {
      res = await fetchImpl(url, build(currentAccessToken));
    } catch (err) {
      log.error(`fetch network error ${shortUrl(url)}`, err);
      throw err;
    }
    const ms = (performance.now() - start).toFixed(0);
    log.info(`fetch ${shortUrl(url)} → ${res.status} (${ms}ms)`);
    if (res.status === 401) {
      log.info("401 received — attempting silent refresh");
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
        log.info(`retry ${shortUrl(url)} → ${res.status} (${retryMs}ms)`);
      } else {
        log.warn("no refresh available — surfacing original 401");
      }
    }
    // Refresh failed (no refresh token, or refresh request itself
    // returned 401), or the retry came back 401 again. Surface as
    // AuthError so the storage hook can offer Reconnect instead of a
    // generic Try-again that would fail the same way.
    if (res.status === 401) {
      const body = await res.text().catch(() => "<unreadable>");
      throw new AuthError(`Dropbox auth failed: 401 ${body}`);
    }
    return res;
  }

  async function loadFromDropbox(): Promise<Snapshot | null> {
    log.info(`load: download path=${DROPBOX_FILE_PATH}`);
    const res = await authedFetch(DOWNLOAD_ENDPOINT, (token) => ({
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Dropbox-API-Arg": dropboxApiArg({ path: DROPBOX_FILE_PATH }),
      },
    }));
    if (res.status === 409) {
      // path/not_found — the app folder is empty (first run on a
      // freshly-connected account). Hand back null so the hook seeds
      // `freshUserData`.
      log.info("load: 409 path/not_found — empty app folder");
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
    log.info(
      `load: read body ${text.length} bytes (${readMs}ms) rev=${meta?.rev ?? "<none>"}`,
    );
    return { text, revision: meta?.rev };
  }

  async function readBackupFile(path: string): Promise<string | null> {
    const res = await authedFetch(DOWNLOAD_ENDPOINT, (token) => ({
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Dropbox-API-Arg": dropboxApiArg({ path }),
      },
    }));
    if (res.status === 409) return null;
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      throw new Error(`Dropbox backup download failed: ${res.status} ${body}`);
    }
    return res.text();
  }

  async function deleteBackupFile(path: string): Promise<void> {
    const res = await authedFetch(DELETE_ENDPOINT, (token) => ({
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path }),
    }));
    // 409 is Dropbox's "path not found" — treat as already gone so the
    // manifest update below can still run.
    if (res.status === 409) return;
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      throw new Error(`Dropbox backup delete failed: ${res.status} ${body}`);
    }
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
        "Dropbox-API-Arg": dropboxApiArg(args),
        "Content-Type": "application/octet-stream",
      },
      body: text,
    }));
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      throw new Error(`Dropbox backup upload failed: ${res.status} ${body}`);
    }
  }

  const backups = createBackupOps({
    readFile: readBackupFile,
    writeFile: uploadBackupFile,
    deleteFile: deleteBackupFile,
    backupKey: (filename) => `${DROPBOX_BACKUPS_FOLDER}/${filename}`,
    indexKey: DROPBOX_BACKUPS_INDEX_PATH,
    log,
  });

  // Binary blob-folder ops (receipts, payslips) under a fixed folder
  // inside the app folder. Dropbox auto-creates intermediate folders on
  // upload, so the receipt type-subdirectory pattern needs no separate
  // folder call. `kind` only flavours the error messages.
  function makeBlobFolderOps(folder: string, kind: string) {
    return {
      async upload(path: string, blob: Blob): Promise<void> {
        const args = {
          path: `${folder}/${path}`,
          mute: true,
          mode: "overwrite",
          autorename: false,
        };
        const buffer = await blob.arrayBuffer();
        const res = await authedFetch(UPLOAD_ENDPOINT, (token) => ({
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Dropbox-API-Arg": dropboxApiArg(args),
            "Content-Type": "application/octet-stream",
          },
          body: buffer,
        }));
        if (!res.ok) {
          const body = await res.text().catch(() => "<unreadable>");
          throw new Error(
            `Dropbox ${kind} upload failed: ${res.status} ${body}`,
          );
        }
      },

      async download(path: string): Promise<Blob | null> {
        const res = await authedFetch(DOWNLOAD_ENDPOINT, (token) => ({
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Dropbox-API-Arg": dropboxApiArg({
              path: `${folder}/${path}`,
            }),
          },
        }));
        if (res.status === 409) return null;
        if (!res.ok) {
          const body = await res.text().catch(() => "<unreadable>");
          throw new Error(
            `Dropbox ${kind} download failed: ${res.status} ${body}`,
          );
        }
        return res.blob();
      },

      async remove(path: string): Promise<void> {
        const res = await authedFetch(DELETE_ENDPOINT, (token) => ({
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ path: `${folder}/${path}` }),
        }));
        // 409 is Dropbox's "path not found" — treat as already gone.
        if (res.status === 409) return;
        if (!res.ok) {
          const body = await res.text().catch(() => "<unreadable>");
          throw new Error(
            `Dropbox ${kind} delete failed: ${res.status} ${body}`,
          );
        }
      },
    };
  }

  const receipts = makeBlobFolderOps(DROPBOX_RECEIPTS_FOLDER, "receipt");
  const payslips = makeBlobFolderOps(DROPBOX_PAYSLIPS_FOLDER, "payslip");
  // Per-property attachment store — repair receipts and uploaded files,
  // laid out per-property under nested subfolders. Dropbox auto-creates the
  // intermediate folders on upload.
  const propertyFiles = makeBlobFolderOps(
    DROPBOX_PROPERTIES_FOLDER,
    "property file",
  );
  // Generated archives the user saves to the backend (property handover ZIPs).
  // Flat filenames under a sibling `exports/` folder.
  const exportsOps = makeBlobFolderOps(DROPBOX_EXPORTS_FOLDER, "export");

  return {
    id: "dropbox",
    label: "Dropbox",
    saveDebounceMs: SAVE_DEBOUNCE_MS,
    capabilities: new Set([
      "backups",
      "receipts",
      "payslips",
      "propertyFiles",
      "exports",
    ]),
    backups,
    receipts,
    payslips,
    propertyFiles,
    exports: exportsOps,

    load: () => loadFromDropbox(),

    async save(text: string, baseRevision?: string): Promise<Snapshot> {
      const args: { path: string; mute: boolean; mode: WriteMode } = {
        path: DROPBOX_FILE_PATH,
        mute: true,
        mode: baseRevision ? { ".tag": "update", update: baseRevision } : "add",
      };
      log.info(
        `save: upload bytes=${text.length} mode=${
          baseRevision ? `update(${baseRevision})` : "add"
        }`,
      );
      const res = await authedFetch(UPLOAD_ENDPOINT, (token) => ({
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Dropbox-API-Arg": dropboxApiArg(args),
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
      if (res.status === 429) {
        // Dropbox returns 429 when the app exceeds its per-user write
        // quota. The hook converts the carried cooldown into a soft
        // `throttled` status and resumes automatically — pending edits
        // ride along on the next full-blob save.
        const headerSeconds = Number(res.headers.get("Retry-After") ?? "");
        const headerMs = Number.isFinite(headerSeconds)
          ? Math.max(0, headerSeconds) * 1000
          : 0;
        const retryAfterMs = Math.max(headerMs, RATE_LIMIT_FALLBACK_MS);
        log.warn(`save: 429 — throttled retryAfter=${retryAfterMs}ms`);
        throw new RateLimitError(retryAfterMs);
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "<unreadable>");
        log.error(`save: failed ${res.status}`, body);
        throw new Error(`Dropbox save failed: ${res.status} ${body}`);
      }
      const meta = (await res.json()) as FileMetadata;
      log.info(`save: ok rev=${meta.rev}`);
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

// True when a Dropbox OAuth flow is mid-flight — i.e. `startDropboxAuth`
// stashed a PKCE verifier in `sessionStorage` and the redirect back
// from Dropbox has not yet been consumed by `completeDropboxAuth`.
// Used by the OAuth completion handler in `App.tsx` to identify which
// provider issued an inbound `?code=` when the URL's `state` param has
// been stripped or mangled in transit.
export function hasPendingDropboxAuth(): boolean {
  const present = sessionStorage.getItem(PKCE_VERIFIER_KEY) !== null;
  log.info(
    `hasPendingDropboxAuth: key=${PKCE_VERIFIER_KEY} present=${present}`,
  );
  return present;
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
