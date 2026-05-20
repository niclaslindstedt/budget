import { CloudAlert, CloudCheck, Loader, Save } from "lucide-react";

import { type TFunction, useT } from "../i18n";
import type { SaveStatus } from "../storage/useUserDataStorage";

// Single header affordance for cloud-backed sessions: collapses the
// separate "save now" disk and "sync status" cloud into one glyph
// that morphs with state. Disk when there are unsaved edits (tap to
// save), spinner while a save is in flight, green cloud-check when
// the remote is in sync, red cloud-alert when something has gone
// wrong. Errors take precedence over the dirty disk because if the
// cloud round-trip is failing, "save now" can't make progress until
// the user sees the modal and acts on it. Tapping the disk saves;
// every other state opens the sync-details modal.

type Props = {
  providerName: string;
  status: SaveStatus;
  dirty: boolean;
  onSave: () => void;
  onOpenDetails: () => void;
};

type View = {
  Icon: typeof CloudCheck;
  label: string;
  tone: "ok" | "busy" | "warn" | "err" | "accent";
  spin?: boolean;
  action: "save" | "open";
};

function viewFor(
  status: SaveStatus,
  dirty: boolean,
  providerName: string,
  t: TFunction,
): View {
  switch (status.kind) {
    case "loading":
      return {
        Icon: Loader,
        label: t("sync.loading"),
        tone: "busy",
        spin: true,
        action: "open",
      };
    case "saving":
      return {
        Icon: Loader,
        label: t("sync.saving"),
        tone: "busy",
        spin: true,
        action: "open",
      };
    case "error":
      return {
        Icon: CloudAlert,
        label: t("sync.failedWithMessage", { message: status.message }),
        tone: "err",
        action: "open",
      };
    case "auth-error":
      return {
        Icon: CloudAlert,
        label: t("sync.reauthRequired"),
        tone: "warn",
        action: "open",
      };
    case "conflict":
      return {
        Icon: CloudAlert,
        label: t("sync.syncConflict"),
        tone: "warn",
        action: "open",
      };
    case "saved":
    case "idle":
      return dirty
        ? {
            Icon: Save,
            label: t("sync.saveUnsaved"),
            tone: "accent",
            action: "save",
          }
        : {
            Icon: CloudCheck,
            label: t("sync.syncedTo", { name: providerName }),
            tone: "ok",
            action: "open",
          };
  }
}

const TONE_CLASS: Record<View["tone"], string> = {
  ok: "border-success/40 text-success hover:bg-success/10",
  busy: "border-line text-muted",
  warn: "border-pipe/50 text-pipe hover:bg-pipe/10",
  err: "border-danger/50 text-danger hover:bg-danger/10",
  accent: "border-accent bg-accent/15 text-accent hover:bg-accent/25",
};

export function SyncStatus({
  providerName,
  status,
  dirty,
  onSave,
  onOpenDetails,
}: Props) {
  const t = useT();
  const view = viewFor(status, dirty, providerName, t);
  const busy = status.kind === "saving" || status.kind === "loading";
  const onClick = view.action === "save" ? onSave : onOpenDetails;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={view.label}
      aria-label={view.label}
      aria-busy={busy || undefined}
      className={`inline-flex h-9 w-9 items-center justify-center rounded border bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
        busy ? "cursor-not-allowed" : "cursor-pointer"
      } ${TONE_CLASS[view.tone]}`}
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
