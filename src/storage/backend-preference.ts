import { nsKey } from "../data/constants/storage";
import {
  clearRawStorage,
  readRawStorage,
  writeRawStorage,
} from "./local-adapter";

// The legacy `budget.cloud.reauthAutoOpen` localStorage key used to
// live here. As of v35 the preference rides along inside the synced
// `UserData.settings.cloudReauthAutoOpen` field so the user's choice
// follows them across devices; the v34 → v35 migration absorbs and
// clears any leftover localStorage value, so no reader / writer for
// it remains in this module.

// Per-device, per-user preferences that select which `StorageAdapter`
// backs the active budget — and the cloud access tokens that unlock
// the cloud backends. Kept in localStorage on purpose: putting the
// backend choice inside `UserData` would be a chicken-and-egg loop
// (the bytes select the place that holds the bytes), and a user
// signing in on a fresh device should land on local until they
// reconnect their cloud backend of choice there.

export type BackendId = "browser" | "folder" | "dropbox" | "gdrive";

// Whether stored bytes are wrapped in the AES-GCM envelope before being
// handed to the adapter. Defaults to "encrypted" for every existing user
// so opting out is an explicit action taken from Settings.
export type EncryptionMode = "encrypted" | "plaintext";

const BACKEND_PREFIX = "budget.backend.";
const DROPBOX_TOKEN_PREFIX = "budget.dropbox.token.";
// Long-lived companion to the short-lived access token. Stored under
// its own key so a legacy install (access token only) round-trips
// unchanged and just doesn't get silent refresh until the user
// reconnects once.
const DROPBOX_REFRESH_PREFIX = "budget.dropbox.refresh.";
const GDRIVE_TOKEN_PREFIX = "budget.gdrive.token.";
const ENCRYPTION_PREFIX = "budget.encryption.";

// Per-user toggle: when on, cloud backends are wrapped with
// `withCloudMirror` so a copy of the latest cloud bytes is kept in
// localStorage. The cached copy is rendered immediately on open and
// the cloud fetch revalidates in the background (stale-while-
// revalidate), so the budget appears instantly instead of blanking
// until the cloud answers; the same cache lets the user keep editing
// when the network is unreachable. Default is on — opting out is an
// explicit action from Settings, stored as "off". Stored per user so
// a multi-account device can mix offline-tolerant and strictly-online
// accounts.
const CLOUD_OFFLINE_PREFIX = "budget.cloud.offline.";

function backendKey(userId: string): string {
  return nsKey(`${BACKEND_PREFIX}${userId}`);
}

function dropboxTokenKey(userId: string): string {
  return nsKey(`${DROPBOX_TOKEN_PREFIX}${userId}`);
}

function dropboxRefreshKey(userId: string): string {
  return nsKey(`${DROPBOX_REFRESH_PREFIX}${userId}`);
}

function gdriveTokenKey(userId: string): string {
  return nsKey(`${GDRIVE_TOKEN_PREFIX}${userId}`);
}

function encryptionKey(userId: string): string {
  return nsKey(`${ENCRYPTION_PREFIX}${userId}`);
}

function cloudOfflineKey(userId: string): string {
  return nsKey(`${CLOUD_OFFLINE_PREFIX}${userId}`);
}

export function getBackend(userId: string): BackendId {
  const raw = readRawStorage(backendKey(userId));
  if (raw === "dropbox") return "dropbox";
  if (raw === "gdrive") return "gdrive";
  if (raw === "folder") return "folder";
  // Legacy value "local" predates the rename to "browser" — silently
  // migrate. Any other unknown / missing value also falls through to
  // the browser default.
  return "browser";
}

export function setBackend(userId: string, backend: BackendId): void {
  writeRawStorage(backend, backendKey(userId));
}

export function getDropboxToken(userId: string): string | null {
  return readRawStorage(dropboxTokenKey(userId));
}

export function setDropboxToken(userId: string, token: string): void {
  writeRawStorage(token, dropboxTokenKey(userId));
}

export function clearDropboxToken(userId: string): void {
  clearRawStorage(dropboxTokenKey(userId));
}

export function getDropboxRefreshToken(userId: string): string | null {
  return readRawStorage(dropboxRefreshKey(userId));
}

export function setDropboxRefreshToken(userId: string, token: string): void {
  writeRawStorage(token, dropboxRefreshKey(userId));
}

export function clearDropboxRefreshToken(userId: string): void {
  clearRawStorage(dropboxRefreshKey(userId));
}

export function getGdriveToken(userId: string): string | null {
  return readRawStorage(gdriveTokenKey(userId));
}

export function setGdriveToken(userId: string, token: string): void {
  writeRawStorage(token, gdriveTokenKey(userId));
}

export function clearGdriveToken(userId: string): void {
  clearRawStorage(gdriveTokenKey(userId));
}

export function getEncryption(userId: string): EncryptionMode {
  const raw = readRawStorage(encryptionKey(userId));
  return raw === "plaintext" ? "plaintext" : "encrypted";
}

export function setEncryption(userId: string, mode: EncryptionMode): void {
  writeRawStorage(mode, encryptionKey(userId));
}

// Defaults to "on" — a cloud-backed session renders its locally
// cached copy immediately and revalidates against the cloud in the
// background, so the budget doesn't blank out while the cloud is
// fetched. Only an explicit "off" (written when the user opts out
// from Settings) disables it; a missing key reads as on so existing
// cloud users pick up the cache-first behaviour without re-toggling.
export function getCloudOfflineMode(userId: string): boolean {
  return readRawStorage(cloudOfflineKey(userId)) !== "off";
}

export function setCloudOfflineMode(userId: string, on: boolean): void {
  writeRawStorage(on ? "on" : "off", cloudOfflineKey(userId));
}

export function clearCloudOfflineMode(userId: string): void {
  clearRawStorage(cloudOfflineKey(userId));
}
