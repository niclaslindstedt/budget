import { createLogger } from "../utils/logger";
import type {
  AdapterCapability,
  BackupOps,
  ReceiptOps,
  Snapshot,
  StorageAdapter,
} from "./adapter";
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

// Receipts are binary, but the AES-GCM envelope (`crypto.ts`) operates
// on text. We bridge by base64-encoding the bytes and prefixing the
// blob's MIME type (so a decrypted receipt still opens as the right
// image / PDF), then encrypting that string. The on-disk filename stays
// the pattern-clean name either way — only the bytes become an
// envelope, detected on read exactly like the budget JSON.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function encryptBlob(blob: Blob, password: string): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const payload = `${blob.type}\n${bytesToBase64(bytes)}`;
  const envelope = await encryptText(payload, password);
  return new Blob([envelope], { type: "application/json" });
}

async function decryptBlob(blob: Blob, password: string): Promise<Blob> {
  const text = await blob.text();
  const payload = await decryptEnvelope(text, password);
  const nl = payload.indexOf("\n");
  const type = nl === -1 ? "" : payload.slice(0, nl);
  const base64 = nl === -1 ? payload : payload.slice(nl + 1);
  const bytes = base64ToBytes(base64);
  return new Blob([bytes as BufferSource], type ? { type } : undefined);
}

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
        remove: (filename) => inner.backups!.remove(filename),
      }
    : undefined;

  // Binary blob-folder ops (receipts, payslips) ride the same envelope
  // as the budget: encrypt on the way in when a password is held,
  // detect-and-decrypt on the way out. A file written while encryption
  // was off is a raw image / PDF — `download` returns it untouched so
  // the transition window stays readable, mirroring the plaintext-
  // leftover handling in `load`. `kind` only flavours the error message.
  function wrapBlobOps(
    ops: ReceiptOps | undefined,
    kind: string,
  ): ReceiptOps | undefined {
    if (!ops) return undefined;
    return {
      async upload(path, blob) {
        const password = passwordRef.current;
        if (!password) {
          await ops.upload(path, blob);
          return;
        }
        await ops.upload(path, await encryptBlob(blob, password));
      },
      async download(path) {
        const blob = await ops.download(path);
        if (!blob) return null;
        // A raw image / PDF read as text won't parse as our envelope
        // JSON, so `isEncryptedEnvelope` cleanly separates the two.
        // Blob is immutable, so re-reading it after this is safe.
        const text = await blob.text();
        if (!isEncryptedEnvelope(text)) return blob;
        const password = passwordRef.current;
        if (!password) {
          throw new Error(`${kind} is encrypted; password is required`);
        }
        return decryptBlob(blob, password);
      },
      remove: (path) => ops.remove(path),
    };
  }

  const wrappedReceipts = wrapBlobOps(inner.receipts, "Receipt");
  const wrappedPayslips = wrapBlobOps(inner.payslips, "Payslip");

  // Forward every inner capability except `loadSync` — decryption is
  // async even when the inner backend can serve bytes synchronously,
  // so this wrapper never implements the sync fast path.
  const capabilities = new Set<AdapterCapability>(inner.capabilities);
  capabilities.delete("loadSync");

  return {
    id: inner.id,
    label: `${inner.label} (encrypted)`,
    saveDebounceMs: inner.saveDebounceMs,
    capabilities,
    backups: wrappedBackups,
    receipts: wrappedReceipts,
    payslips: wrappedPayslips,

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
