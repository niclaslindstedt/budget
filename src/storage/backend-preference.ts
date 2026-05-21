import { nsKey } from "../data/constants";
import {
  clearRawStorage,
  readRawStorage,
  writeRawStorage,
} from "./local-adapter";

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
// Device-wide UI preference, not per-user: when on (the default) a
// cloud auth failure auto-opens `SyncDetailsModal` with the Reconnect
// button. Some users find Google Drive's hourly token expiry annoying
// and prefer to notice the cloud-status pill themselves, so they can
// turn the auto-open off without disabling the underlying detection.
const CLOUD_REAUTH_AUTO_OPEN_KEY = "budget.cloud.reauthAutoOpen";

// Per-user opt-in: when on, cloud backends are wrapped with
// `withCloudMirror` so a copy of the latest cloud bytes is kept in
// localStorage and surfaced when the network is unreachable. Default
// is off — without it the app waits for the cloud to answer before
// the user can edit, which is the historical contract. Stored per
// user so a multi-account device can mix offline-tolerant and
// strictly-online accounts.
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

export function getCloudReauthAutoOpen(): boolean {
  return readRawStorage(nsKey(CLOUD_REAUTH_AUTO_OPEN_KEY)) !== "off";
}

export function setCloudReauthAutoOpen(on: boolean): void {
  writeRawStorage(on ? "on" : "off", nsKey(CLOUD_REAUTH_AUTO_OPEN_KEY));
}

// Defaults to "off" — the historical contract is that a cloud-backed
// session waits for the cloud before letting the user edit, so users
// have to opt in to the local-mirror fallback. Any value other than
// "on" reads as off (covers missing keys and the legacy "off" value).
export function getCloudOfflineMode(userId: string): boolean {
  return readRawStorage(cloudOfflineKey(userId)) === "on";
}

export function setCloudOfflineMode(userId: string, on: boolean): void {
  writeRawStorage(on ? "on" : "off", cloudOfflineKey(userId));
}

export function clearCloudOfflineMode(userId: string): void {
  clearRawStorage(cloudOfflineKey(userId));
}
