import type { Widen } from "./_widen";

const sync = {
  ok: "Synced",
  syncing: "Syncing…",
  syncingNow: "Syncing now…",
  loading: "Loading…",
  saving: "Saving…",
  offline: "Offline",
  failed: "Sync failed",
  failedWithMessage: "Sync failed: {message}",
  throttled: "Saving paused briefly",
  throttledDetail:
    "{name} asked us to slow down. Auto-save resumes in a few seconds — your edits will be pushed in the next save.",
  syncConflict: "Sync conflict",
  syncConflictDetail:
    "{name} changed underneath this device. Reload to pick up the remote copy.",
  syncedTo: "Synced to {name}",
  saveUnsaved: "Save unsaved changes",
  pendingSync: "Pending sync",
  pendingSyncDetail:
    "Edits aren't on the cloud yet. Tap Save now to push immediately, or wait for the next auto-save.",
  cloudSync: "Cloud sync",
  status: "Status",
  provider: "Provider",
  fileLocation: "File location",
  openIn: "Open in {name}",
  saveNow: "Save now",
  tryAgain: "Try again",
  retry: "Retry",
  reauthRequired: "Reconnect required",
  reauthRequiredDetail:
    "Your {name} session expired. Reconnect to keep syncing — no data is lost.",
  reconnect: "Reconnect {name}",
  pending: "Saving…",
  details: "Sync details",
  lastSyncedAt: "Last synced {time}",
  conflict: "Conflict",
  conflictHint:
    "This device and {name} edited the budget separately while you were offline. Pick which copy to keep — the other one is discarded.",
  conflictTitle: "Sync conflict with {name}",
  conflictLocalLabel: "This device",
  conflictRemoteLabel: "{name}",
  conflictSheetsEntries: "{sheets} sheets · {entries} entries",
  keepLocal: "Keep mine",
  keepRemote: "Keep the other",
  offlineMode: "{name} unreachable",
  offlineModeDetail:
    "Editing a local copy because {name} can't be reached. Changes push automatically when the connection is back.",
  parseError: "File unreadable",
  parseErrorDetail:
    "{name} returned data this build can't parse: {message}. Auto-save is paused so your stored data isn't overwritten. Try reloading on a newer build, or restore an earlier version from your provider's file history.",
  shrinkWarning: "Save paused — large shrink",
  shrinkWarningDetail:
    "The next save would shrink your budget from {prev} to {next} bytes ({pct}% smaller). Confirm to save anyway, or discard to revert the in-memory state to the last saved copy.",
  confirmShrink: "Save anyway",
  discardShrink: "Discard local changes",
} as const;

export type SyncCatalog = Widen<typeof sync>;

export default sync;
