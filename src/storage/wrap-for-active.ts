import type { StorageAdapter } from "./adapter";
import type { EncryptionMode } from "./backend-preference";
import { withEncryption } from "./encrypting-adapter";

// Wrap a raw adapter with `withEncryption` when the active user has
// encryption on AND a password is in hand. Mirrors the gate used when
// assembling the live `adapter` in `useStorageBackend`, so source /
// target probes during the link flow see and write bytes through the
// same envelope the steady-state app does.
//
// Lives in its own file so both `useStorageBackend` (the orchestrator)
// and the per-backend hooks (`useFolderHandle`, future
// `useDropboxAuth` / `useGdriveAuth`) can call it without the sub-hooks
// having to import from the orchestrator — that direction would create
// a circular dependency once the sub-hooks live in sibling files.
export function wrapForActive(
  inner: StorageAdapter,
  encryption: EncryptionMode,
  passwordRef: React.MutableRefObject<string | null>,
): StorageAdapter {
  const password = passwordRef.current;
  return encryption === "encrypted" && password
    ? withEncryption(inner, passwordRef)
    : inner;
}
