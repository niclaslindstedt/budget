import {
  CloudAlert,
  CloudCheck,
  CloudUpload,
  Loader,
  RefreshCw,
} from "lucide-react";

import type { SaveStatus } from "../storage/useUserDataStorage";

// Renders the active backend's sync state next to `SaveStateButton`.
// Mounted only when a cloud backend is active — local saves are
// instantaneous and a permanent "synced" indicator there would be
// chrome noise.

type Props = {
  status: SaveStatus;
  dirty: boolean;
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
      return { Icon: CloudUpload, label: "Syncing…", tone: "busy", spin: true };
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
  ok: "border-success/40 text-success",
  busy: "border-line text-muted",
  warn: "border-pipe/50 text-pipe",
  err: "border-danger/50 text-danger",
};

export function SyncStatus({ status, dirty }: Props) {
  const view = viewFor(status, dirty);
  return (
    <span
      title={view.label}
      aria-label={view.label}
      role="status"
      className={`inline-flex h-9 w-9 items-center justify-center rounded border bg-transparent ${
        TONE_CLASS[view.tone]
      }`}
    >
      <view.Icon
        size={18}
        aria-hidden
        focusable={false}
        className={view.spin ? "animate-spin" : undefined}
      />
    </span>
  );
}
