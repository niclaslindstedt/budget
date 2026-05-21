import { createLogger } from "../utils/logger";
import type { BackupOps, Snapshot, StorageAdapter } from "./adapter";
import { decryptEnvelope, encryptText, isEncryptedEnvelope } from "./crypto";

const log = createLogger("encrypt");

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
  const wrappedBackups: BackupOps | undefined = inner.backups
    ? {
        list: () => inner.backups!.list(),
        async create(text, metadata) {
          const password = passwordRef.current;
          if (!password) {
            log.warn(
              `backup create: no password — writing plaintext (${text.length} B)`,
            );
            await inner.backups!.create(text, {
              ...metadata,
              encrypted: false,
            });
            return;
          }
          log.info(`backup create: encrypting (${text.length} B)`);
          const payload = await encryptText(text, password);
          await inner.backups!.create(payload, {
            ...metadata,
            encrypted: true,
          });
        },
        async read(filename) {
          const raw = await inner.backups!.read(filename);
          if (!isEncryptedEnvelope(raw)) {
            log.info(`backup read: ${filename} is plaintext`);
            return raw;
          }
          const password = passwordRef.current;
          if (!password) {
            log.error(`backup read: ${filename} encrypted but no password`);
            throw new Error("Backup is encrypted; password is required");
          }
          log.info(`backup read: decrypting ${filename}`);
          return decryptEnvelope(raw, password);
        },
      }
    : undefined;

  return {
    id: inner.id,
    label: `${inner.label} (encrypted)`,
    saveDebounceMs: inner.saveDebounceMs,
    backups: wrappedBackups,

    // The hook hands us plaintext bytes here; the inner cache (in
    // `withCloudMirror`) expects the same envelope shape the cloud
    // holds. Encrypt before forwarding so a "keep remote" resolution
    // stamps the mirror with bytes that will decrypt cleanly on the
    // next load. Falls back to forwarding plaintext if the password
    // isn't held — the inner cache will then sit with plaintext and
    // the next online round-trip will replace it.
    markSynced: inner.markSynced
      ? (snapshot) => {
          const password = passwordRef.current;
          if (!password) {
            inner.markSynced!(snapshot);
            return;
          }
          void encryptText(snapshot.text, password).then((payload) => {
            inner.markSynced!({ ...snapshot, text: payload });
          });
        }
      : undefined,

    // No `loadSync`: even when the inner adapter can hand back bytes
    // synchronously, decryption is asynchronous. Callers fall back to
    // `load()` and tolerate the brief loading state.

    async load(): Promise<Snapshot | null> {
      log.info(`load: delegate to inner [${inner.id}]`);
      const snap = await inner.load();
      if (!snap) {
        log.info("load: inner returned null");
        return null;
      }
      if (!isEncryptedEnvelope(snap.text)) {
        // Plaintext leftover (e.g. encryption was just enabled and
        // the imperative re-wrap hasn't run yet) — hand it back as-is
        // so the budget survives the transition.
        log.info(`load: inner bytes are plaintext (${snap.text.length} B)`);
        return snap;
      }
      const password = passwordRef.current;
      if (!password) {
        log.error("load: encrypted envelope but no password available");
        throw new Error("Storage is encrypted; password is required");
      }
      log.info(`load: decrypting envelope (${snap.text.length} B)`);
      const start = performance.now();
      try {
        const text = await decryptEnvelope(snap.text, password);
        const ms = (performance.now() - start).toFixed(0);
        log.info(`load: decrypt ok (${ms}ms) → ${text.length} B plaintext`);
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
        log.info(`save: encrypting plaintext (${text.length} B)`);
      }
      const start = performance.now();
      const payload = password ? await encryptText(text, password) : text;
      if (password) {
        const ms = (performance.now() - start).toFixed(0);
        log.info(`save: encrypt ok (${ms}ms) → ${payload.length} B envelope`);
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
              log.info("watch: remote bytes are plaintext — forwarding");
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
                log.info("watch: decrypt ok — forwarding");
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
