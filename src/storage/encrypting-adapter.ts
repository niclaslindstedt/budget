import { debug } from "../utils/debug";
import type { Snapshot, StorageAdapter } from "./adapter";
import { decryptEnvelope, encryptText, isEncryptedEnvelope } from "./crypto";

const log = debug("encrypt");

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
      log.log(`load: delegate to inner [${inner.id}]`);
      const snap = await inner.load();
      if (!snap) {
        log.log("load: inner returned null");
        return null;
      }
      if (!isEncryptedEnvelope(snap.text)) {
        // Plaintext leftover (e.g. encryption was just enabled and
        // the imperative re-wrap hasn't run yet) — hand it back as-is
        // so the budget survives the transition.
        log.log(`load: inner bytes are plaintext (${snap.text.length} B)`);
        return snap;
      }
      const password = passwordRef.current;
      if (!password) {
        log.error("load: encrypted envelope but no password available");
        throw new Error("Storage is encrypted; password is required");
      }
      log.log(`load: decrypting envelope (${snap.text.length} B)`);
      const start = performance.now();
      try {
        const text = await decryptEnvelope(snap.text, password);
        const ms = (performance.now() - start).toFixed(0);
        log.log(`load: decrypt ok (${ms}ms) → ${text.length} B plaintext`);
        return { ...snap, text };
      } catch (err) {
        const ms = (performance.now() - start).toFixed(0);
        log.error(`load: decrypt failed (${ms}ms)`, err);
        throw err;
      }
    },

    async save(text: string, baseRevision?: string): Promise<Snapshot> {
      const password = passwordRef.current;
      if (!password) {
        log.warn(
          `save: no password — writing plaintext (${text.length} B) to inner [${inner.id}]`,
        );
      } else {
        log.log(`save: encrypting plaintext (${text.length} B)`);
      }
      const start = performance.now();
      const payload = password ? await encryptText(text, password) : text;
      if (password) {
        const ms = (performance.now() - start).toFixed(0);
        log.log(`save: encrypt ok (${ms}ms) → ${payload.length} B envelope`);
      }
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
              log.log("watch: remote bytes are plaintext — forwarding");
              onRemoteChange(snap);
              return;
            }
            const password = passwordRef.current;
            if (!password) {
              log.warn(
                "watch: remote is encrypted but no password — dropping update",
              );
              return;
            }
            decryptEnvelope(snap.text, password)
              .then((text) => {
                log.log("watch: decrypt ok — forwarding");
                onRemoteChange({ ...snap, text });
              })
              .catch((err) => {
                log.error("watch: decrypt failed — dropping update", err);
                // Wrong password / tampered remote — surface this in a
                // future iteration; silent for now to avoid breaking
                // the watcher contract.
              });
          })
      : undefined,
  };
}
