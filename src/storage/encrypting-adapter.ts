import type { Snapshot, StorageAdapter } from "./adapter";
import { decryptEnvelope, encryptText, isEncryptedEnvelope } from "./crypto";

// Higher-order adapter that wraps any `StorageAdapter` and applies
// password-based encryption at the byte boundary. The underlying
// adapter still sees opaque bytes, so the same wrapper works whether
// the bytes ultimately live in localStorage, a Dropbox app folder,
// or a Google Drive file.
//
// The password is held by reference so it can change at runtime
// (enable / disable encryption from settings) without re-creating
// the adapter. A null `passwordRef.current` means "pass through" —
// useful for the transitional window after the user clicks "enable"
// but before the imperative re-wrap of existing storage has run.

export type PasswordRef = { readonly current: string | null };

export function withEncryption(
  inner: StorageAdapter,
  passwordRef: PasswordRef,
): StorageAdapter {
  return {
    id: inner.id,
    label: `${inner.label} (encrypted)`,
    saveDebounceMs: inner.saveDebounceMs,

    // No `loadSync`: even when the inner adapter can hand back bytes
    // synchronously, decryption is asynchronous. Callers fall back to
    // `load()` and tolerate the brief loading state.

    async load(): Promise<Snapshot | null> {
      const snap = await inner.load();
      if (!snap) return null;
      if (!isEncryptedEnvelope(snap.text)) {
        // Plaintext leftover (e.g. encryption was just enabled and
        // the imperative re-wrap hasn't run yet) — hand it back as-is
        // so the budget survives the transition.
        return snap;
      }
      const password = passwordRef.current;
      if (!password) {
        throw new Error("Storage is encrypted; password is required");
      }
      const text = await decryptEnvelope(snap.text, password);
      return { ...snap, text };
    },

    async save(text: string, baseRevision?: string): Promise<Snapshot> {
      const password = passwordRef.current;
      const payload = password ? await encryptText(text, password) : text;
      const written = await inner.save(payload, baseRevision);
      // The hook compares revisions, not bytes, so it's safe to hand
      // back the plaintext alongside the revision the inner adapter
      // produced for the ciphertext.
      return { ...written, text };
    },

    watch: inner.watch
      ? (onRemoteChange) =>
          inner.watch!((snap) => {
            if (!isEncryptedEnvelope(snap.text)) {
              onRemoteChange(snap);
              return;
            }
            const password = passwordRef.current;
            if (!password) return;
            decryptEnvelope(snap.text, password)
              .then((text) => onRemoteChange({ ...snap, text }))
              .catch(() => {
                // Wrong password / tampered remote — surface this in a
                // future iteration; silent for now to avoid breaking
                // the watcher contract.
              });
          })
      : undefined,
  };
}
