import { createLogger } from "../utils/logger";
import { safeJsonParse } from "../utils/json";
import type { ReceiptOps, StorageAdapter } from "./adapter";

const log = createLogger("reencrypt");

// Pull every transaction's receipt path out of a serialized `UserData`
// snapshot. Receipts hang off the purchase, so they live on bank-history
// entries (`history[account][].receiptPath`) and on budget rows
// (`sheets[].items[].rows[].receiptPath`). The encryption-toggle re-wrap
// runs inside the storage hook, which has no `UserData` value — only the
// bytes it just loaded — so the authoritative list of receipt files to
// convert comes from parsing those bytes. Tolerant of any shape drift: a
// missing / malformed branch contributes nothing rather than throwing.
export function extractReceiptPaths(snapshotText: string): string[] {
  const parsed = safeJsonParse(snapshotText);
  if (typeof parsed !== "object" || parsed === null) return [];
  // De-dupe: a synthesized historic row and its backing entry could
  // otherwise both surface the same path.
  const paths = new Set<string>();

  const addPath = (holder: unknown): void => {
    if (typeof holder !== "object" || holder === null) return;
    const path = (holder as { receiptPath?: unknown }).receiptPath;
    if (typeof path === "string" && path.length > 0) paths.add(path);
  };

  const history = (parsed as { history?: unknown }).history;
  if (typeof history === "object" && history !== null) {
    for (const entries of Object.values(history as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) addPath(entry);
    }
  }

  const sheets = (parsed as { sheets?: unknown }).sheets;
  if (Array.isArray(sheets)) {
    for (const sheet of sheets) {
      if (typeof sheet !== "object" || sheet === null) continue;
      const items = (sheet as { items?: unknown }).items;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (typeof item !== "object" || item === null) continue;
        const rows = (item as { rows?: unknown }).rows;
        if (!Array.isArray(rows)) continue;
        for (const row of rows) addPath(row);
      }
    }
  }

  return [...paths];
}

// Pull every salary's payslip path out of a serialized `UserData`
// snapshot. Payslips hang off the salary (`salaries[].payslipPath`).
// Same rationale and tolerance as `extractReceiptPaths` — the re-wrap
// runs on bytes, not a `UserData` value, so the authoritative list
// comes from parsing those bytes.
export function extractPayslipPaths(snapshotText: string): string[] {
  const parsed = safeJsonParse(snapshotText);
  if (typeof parsed !== "object" || parsed === null) return [];
  const paths = new Set<string>();
  const salaries = (parsed as { salaries?: unknown }).salaries;
  if (Array.isArray(salaries)) {
    for (const salary of salaries) {
      if (typeof salary !== "object" || salary === null) continue;
      const path = (salary as { payslipPath?: unknown }).payslipPath;
      if (typeof path === "string" && path.length > 0) paths.add(path);
    }
  }
  return [...paths];
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
  // Each converted file remembers the `current`-side ops it came from so
  // rollback restores it through the exact same backend folder.
  const converted: { ops: ReceiptOps; path: string; blob: Blob }[] = [];

  async function rollback(): Promise<void> {
    for (const { ops, path, blob } of converted) {
      try {
        await ops.upload(path, blob);
      } catch (err) {
        // Best-effort — a file we can't restore stays in the new mode,
        // but it still self-describes on read, so log and press on so
        // the remaining files are restored.
        log.error(`rollback: failed to restore ${path}`, err);
      }
    }
  }

  // One conversion pass over a blob-folder ops pair (receipts or
  // payslips): download each file through `current`, re-upload through
  // `target`, remembering the original bytes so a later failure can roll
  // the whole batch back to its source mode.
  async function convertPass(
    currentOps: ReceiptOps | undefined,
    targetOps: ReceiptOps | undefined,
    paths: string[],
    label: string,
  ): Promise<void> {
    if (!currentOps || !targetOps) return;
    log.info(`reencrypt: ${paths.length} ${label}(s) to convert`);
    for (const path of paths) {
      try {
        const blob = await currentOps.download(path);
        if (!blob) {
          log.warn(`reencrypt: ${path} missing — skipping`);
          continue;
        }
        await targetOps.upload(path, blob);
        converted.push({ ops: currentOps, path, blob });
      } catch (err) {
        log.error(`reencrypt: failed on ${path} — rolling back`, err);
        await rollback();
        throw err;
      }
    }
  }

  await convertPass(
    current.receipts,
    target.receipts,
    extractReceiptPaths(snapshotText),
    "receipt",
  );
  await convertPass(
    current.payslips,
    target.payslips,
    extractPayslipPaths(snapshotText),
    "payslip",
  );

  try {
    await target.save(snapshotText);
  } catch (err) {
    log.error("reencrypt: budget save failed — rolling back files", err);
    await rollback();
    throw err;
  }
}
