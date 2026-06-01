import { createLogger } from "../utils/logger";
import { safeJsonParse } from "../utils/json";
import type { StorageAdapter } from "./adapter";

const log = createLogger("reencrypt");

// Pull every item's receipt path out of a serialized `UserData`
// snapshot. The encryption-toggle re-wrap runs inside the storage hook,
// which has no `UserData` value — only the bytes it just loaded — so the
// authoritative list of receipt files to convert comes from parsing
// those bytes. Tolerant of any shape drift: a missing / malformed
// `items` array yields an empty list rather than throwing.
export function extractReceiptPaths(snapshotText: string): string[] {
  const parsed = safeJsonParse(snapshotText);
  if (typeof parsed !== "object" || parsed === null) return [];
  const items = (parsed as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const paths: string[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const path = (item as { receiptPath?: unknown }).receiptPath;
    if (typeof path === "string" && path.length > 0) paths.push(path);
  }
  return paths;
}

// Atomically migrate the bytes already in a backend from one encryption
// mode to another when the user toggles encryption. `current` reads
// through the old wrapper (decrypting if it was on); `target` writes
// through the new one (encrypting if it is on now). Every receipt file
// is converted in place AND the budget JSON is re-saved, as a single
// all-or-nothing unit:
//
//   - Receipts convert one at a time; each converted file's decrypted
//     blob is remembered so it can be restored.
//   - If converting any receipt, or saving the budget, fails, every
//     already-converted receipt is rolled back to its original-mode
//     bytes (written back through `current`) before the error is
//     re-thrown — so a failed toggle leaves the backend exactly as it
//     was and the caller never flips the persisted preference.
//
// There is no real filesystem / cloud transaction, so "atomic" is this
// best-effort rollback: the only window where on-disk state is mixed is
// mid-run, and a thrown error unwinds it. Receipt reads self-describe
// (envelope vs raw) regardless, so even a rollback that itself failed
// degrades to a readable mixed state rather than data loss.
export async function reencryptStorage(
  current: StorageAdapter,
  target: StorageAdapter,
  snapshotText: string,
): Promise<void> {
  const converted: { path: string; blob: Blob }[] = [];

  async function rollback(): Promise<void> {
    if (!current.receipts) return;
    for (const { path, blob } of converted) {
      try {
        await current.receipts.upload(path, blob);
      } catch (err) {
        // Best-effort — a file we can't restore stays in the new mode,
        // but it still self-describes on read, so log and press on so
        // the remaining files are restored.
        log.error(`rollback: failed to restore ${path}`, err);
      }
    }
  }

  if (current.receipts && target.receipts) {
    const paths = extractReceiptPaths(snapshotText);
    log.info(`reencrypt: ${paths.length} receipt(s) to convert`);
    for (const path of paths) {
      try {
        const blob = await current.receipts.download(path);
        if (!blob) {
          log.warn(`reencrypt: ${path} missing — skipping`);
          continue;
        }
        await target.receipts.upload(path, blob);
        converted.push({ path, blob });
      } catch (err) {
        log.error(`reencrypt: failed on ${path} — rolling back`, err);
        await rollback();
        throw err;
      }
    }
  }

  try {
    await target.save(snapshotText);
  } catch (err) {
    log.error("reencrypt: budget save failed — rolling back receipts", err);
    await rollback();
    throw err;
  }
}
