import {
  clearRawStorage,
  readRawStorage,
  writeRawStorage,
} from "./local-adapter";

// Per-device, per-user preferences that select which `StorageAdapter`
// backs the active budget — and the Dropbox access token that unlocks
// the cloud backend. Kept in localStorage on purpose: putting the
// backend choice inside `UserData` would be a chicken-and-egg loop
// (the bytes select the place that holds the bytes), and a user
// signing in on a fresh device should land on local until they
// reconnect Dropbox there.

export type BackendId = "local" | "dropbox";

const BACKEND_PREFIX = "budget.backend.";
const DROPBOX_TOKEN_PREFIX = "budget.dropbox.token.";

function backendKey(userId: string): string {
  return `${BACKEND_PREFIX}${userId}`;
}

function dropboxTokenKey(userId: string): string {
  return `${DROPBOX_TOKEN_PREFIX}${userId}`;
}

export function getBackend(userId: string): BackendId {
  const raw = readRawStorage(backendKey(userId));
  return raw === "dropbox" ? "dropbox" : "local";
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
