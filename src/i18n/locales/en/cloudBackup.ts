import type { Widen } from "./_widen";

const cloudBackup = {
  title: "Backups",
  none: 'No backups yet. Press "Back up now" to create one.',
  introHint:
    "Timestamped snapshots written into the {name} backups folder. Restoring a backup saves your current file as a safety net first.",
  backUpNow: "Back up now",
  loadingBackups: "Loading backups…",
  restore: "Restore",
  restoreTitle: "Restore from backup?",
  restoreHint:
    "The current budget will be replaced with this snapshot. Your current file will be saved as an auto-backup first.",
  deleteAria: "Delete {filename}",
  deleteTitle: "Delete this backup?",
  deleteHint:
    "This snapshot will be removed from the backups folder. This cannot be undone.",
  deleting: "Deleting backup…",
  deleted: "Deleted {filename}.",
  deleteFailed: "Delete failed: {error}",
  listing: "Listing backups…",
  failed: "Could not list backups.",
  download: "Download",
  downloadAria: "Download {filename}",
  autoCreated: "Created automatically before a restore",
  autoBadge: "auto",
  encryptedBadge: "encrypted",
  couldNotParse: "Could not parse backup: {error}",
  restored: "Restored {filename}. Previous file saved as {auto}.",
  restoredMigrated:
    "Restored {filename} (migrated to current version). Previous file saved as {auto}.",
  restoreFailed: "Restore failed: {error}",
  accountOne: "{n} account",
  accountOther: "{n} accounts",
  entryOne: "{n} entry",
  entryOther: "{n} entries",
  providerFolder: "folder",
  creatingBackup: "Creating backup…",
  backupSavedAs: "Backup saved as {filename}.",
  backupFailed: "Backup failed: {error}",
  backingUpCurrent: "Backing up current file…",
  restoring: "Restoring…",
  couldNotLoad: "Could not load backups: {error}",
} as const;

export type CloudBackupCatalog = Widen<typeof cloudBackup>;

export default cloudBackup;
