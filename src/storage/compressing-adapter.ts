import { createLogger } from "../utils/logger";
import type { AdapterCapability, Snapshot, StorageAdapter } from "./adapter";
import { compressText, decompressText, isCompressed } from "./compression";

const log = createLogger("compress");

// Higher-order adapter that gzip-wraps the budget bytes at the byte
// boundary. Mirrors `withEncryption` exactly — same set of transformed
// methods (`load` / `save` / `markSynced` / `watch`), same pass-through
// for sibling-file ops (backups, receipts, …) — so the two byte-layer
// wrappers compose predictably.
//
// Composition order is **compression outside encryption**:
//
//   withCompression(withEncryption(inner))
//
// so the bytes flow plaintext → gzip → encrypt → store on the way down,
// and store → decrypt → gunzip → plaintext on the way up. Compressing
// before encrypting matters: ciphertext is high-entropy and does not
// compress, so the order must never be flipped. Each wrapper only ever
// sees its inner's *decoded* output (this wrapper decompresses bytes
// that `withEncryption` already decrypted), so the prefix-based
// `isCompressed` check is unambiguous.
//
// Backups, receipts, payslips, property files, and exports pass straight
// through uncompressed — backups stay self-contained full-blob recovery
// artifacts, and the binary files are already compressed formats
// (JPEG / PDF / ZIP) that gzip can't shrink.
export function withCompression(inner: StorageAdapter): StorageAdapter {
  // Forward every inner capability except `loadSync` — decompression is
  // async even when the inner backend can serve bytes synchronously, so
  // this wrapper never implements the sync fast path. (No production
  // backend implements `loadSync` today, mirroring `withEncryption`.)
  const capabilities = new Set<AdapterCapability>(inner.capabilities);
  capabilities.delete("loadSync");

  return {
    id: inner.id,
    label: inner.label,
    saveDebounceMs: inner.saveDebounceMs,
    capabilities,
    backups: inner.backups,
    receipts: inner.receipts,
    payslips: inner.payslips,
    propertyFiles: inner.propertyFiles,
    exports: inner.exports,
    getRevision: inner.getRevision ? () => inner.getRevision!() : undefined,

    // Adopt an externally-supplied plaintext snapshot: compress before
    // forwarding so the inner cache (`withCloudMirror`, via
    // `withEncryption`) holds bytes in the same shape a `save` writes.
    markSynced: inner.markSynced
      ? (snapshot) => {
          void compressText(snapshot.text).then((payload) => {
            inner.markSynced!({ ...snapshot, text: payload });
          });
        }
      : undefined,

    async load(): Promise<Snapshot | null> {
      const snap = await inner.load();
      if (!snap) return null;
      if (!isCompressed(snap.text)) {
        // Legacy plaintext (written before compression landed, or an
        // encryption wrapper handed back a pre-compression blob) — pass
        // it through so the budget survives the transition. The first
        // save re-writes it compressed.
        log.info(`load: inner bytes uncompressed (${snap.text.length} B)`);
        return snap;
      }
      const text = await decompressText(snap.text);
      log.info(`load: gunzip ${snap.text.length} B → ${text.length} B`);
      return { ...snap, text };
    },

    async save(text: string, baseRevision?: string): Promise<Snapshot> {
      const payload = await compressText(text);
      log.info(`save: gzip ${text.length} B → ${payload.length} B`);
      const written = await inner.save(payload, baseRevision);
      // The hook compares revisions, not bytes, so it's safe to hand
      // back the plaintext alongside the revision the inner adapter
      // produced for the compressed payload.
      return { ...written, text };
    },

    watch: inner.watch
      ? (onRemoteChange) =>
          inner.watch!((snap) => {
            if (!isCompressed(snap.text)) {
              onRemoteChange(snap);
              return;
            }
            decompressText(snap.text)
              .then((text) => onRemoteChange({ ...snap, text }))
              .catch((err) => {
                log.error("watch: gunzip failed — dropping update", err);
              });
          })
      : undefined,
  };
}
