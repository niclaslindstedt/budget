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

export type BackendId = "local" | "dropbox" | "gdrive";

// Whether stored bytes are wrapped in the AES-GCM envelope before being
// handed to the adapter. Defaults to "encrypted" for every existing user
// so opting out is an explicit action taken from Settings.
export type EncryptionMode = "encrypted" | "plaintext";

const BACKEND_PREFIX = "budget.backend.";
const DROPBOX_TOKEN_PREFIX = "budget.dropbox.token.";
const GDRIVE_TOKEN_PREFIX = "budget.gdrive.token.";
const ENCRYPTION_PREFIX = "budget.encryption.";

function backendKey(userId: string): string {
  return `${BACKEND_PREFIX}${userId}`;
}

function dropboxTokenKey(userId: string): string {
  return `${DROPBOX_TOKEN_PREFIX}${userId}`;
}

function gdriveTokenKey(userId: string): string {
  return `${GDRIVE_TOKEN_PREFIX}${userId}`;
}

function encryptionKey(userId: string): string {
  return `${ENCRYPTION_PREFIX}${userId}`;
}

export function getBackend(userId: string): BackendId {
  const raw = readRawStorage(backendKey(userId));
  if (raw === "dropbox") return "dropbox";
  if (raw === "gdrive") return "gdrive";
  return "local";
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
