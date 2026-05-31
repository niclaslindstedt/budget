import { countSheetItemRows } from "../data/sheet-types";
import type { UserData } from "../data/types";
import type { BackupMetadata } from "./adapter";

// Builds the `BackupMetadata` that gets recorded in the index when a
// backup is taken. `accountCount` is the user's known accounts;
// `entryCount` is the sum of every row-bearing sheet item's row count
// across every sheet (today only budgets, but routed through the
// sheet-type registry so a future row-bearing flavour is counted too)
// — auxiliary bank-history entries are excluded because long imported
// statements would dominate the figure and make distinct snapshots
// indistinguishable.
export function describeBackup(
  data: UserData,
  options: { filename: string; createdAt?: number; autoCreated?: boolean },
): BackupMetadata {
  const entryCount = countSheetItemRows(data);
  return {
    filename: options.filename,
    createdAt: options.createdAt ?? Date.now(),
    accountCount: data.accounts.length,
    entryCount,
    ...(options.autoCreated ? { autoCreated: true } : {}),
  };
}

// Filename helper. The timestamp piece is rendered in the user's
// local timezone with `:` swapped for `-` so the result is
// filesystem-safe (Windows can't tolerate `:` in filenames, and the
// FSA picker mirrors that restriction). The `auto-` prefix marks
// safety-net snapshots the restore flow takes implicitly before
// replacing the current file.
export function suggestBackupFilename(
  now: Date = new Date(),
  options: { autoCreated?: boolean } = {},
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const prefix = options.autoCreated ? "auto-" : "";
  return `${prefix}budget-${stamp}.json`;
}
