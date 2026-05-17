import { CloudAlert, CloudCheck, Loader, RefreshCw } from "lucide-react";

import type { SaveStatus } from "../storage/useUserDataStorage";

// Renders the active backend's sync state next to `SaveStateButton`.
// Mounted only when a cloud backend is active — local saves are
// instantaneous and a permanent "synced" indicator there would be
// chrome noise. Clicking opens the sync-details modal.

type Props = {
  status: SaveStatus;
  dirty: boolean;
  onClick: () => void;
};

type View = {
  Icon: typeof CloudCheck;
  label: string;
  tone: "ok" | "busy" | "warn" | "err";
  spin?: boolean;
};

function viewFor(status: SaveStatus, dirty: boolean): View {
  switch (status.kind) {
    case "loading":
      return { Icon: Loader, label: "Loading…", tone: "busy", spin: true };
    case "saving":
      return { Icon: Loader, label: "Syncing…", tone: "busy", spin: true };
    case "error":
      return {
        Icon: CloudAlert,
        label: `Sync failed: ${status.message}`,
        tone: "err",
      };
    case "conflict":
      return { Icon: CloudAlert, label: "Sync conflict", tone: "warn" };
    case "saved":
    case "idle":
      return dirty
        ? { Icon: RefreshCw, label: "Pending sync", tone: "busy" }
        : { Icon: CloudCheck, label: "Synced to Dropbox", tone: "ok" };
  }
}

const TONE_CLASS: Record<View["tone"], string> = {
  ok: "border-success/40 text-success hover:bg-success/10",
  busy: "border-line text-muted hover:bg-surface-2",
  warn: "border-pipe/50 text-pipe hover:bg-pipe/10",
  err: "border-danger/50 text-danger hover:bg-danger/10",
};

export function SyncStatus({ status, dirty, onClick }: Props) {
  const view = viewFor(status, dirty);
  return (
    <button
      type="button"
      onClick={onClick}
      title={view.label}
      aria-label={view.label}
      className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
        TONE_CLASS[view.tone]
      }`}
    >
      <view.Icon
        size={18}
        aria-hidden
        focusable={false}
        className={view.spin ? "animate-spin" : undefined}
      />
    </button>
  );
}
