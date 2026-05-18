import {
  CloudAlert,
  CloudCheck,
  CloudUpload,
  ExternalLink,
  Loader,
  RefreshCw,
  X,
} from "lucide-react";

import type { BackendId } from "../storage/backend-preference";
import {
  DROPBOX_APP_FOLDER,
  DROPBOX_FILE_PATH,
  dropboxWebUrl,
} from "../storage/dropbox-adapter";
import { GDRIVE_FILE_NAME, gdriveWebUrl } from "../storage/gdrive-adapter";
import type { SaveStatus } from "../storage/useUserDataStorage";
import { useEscapeKey } from "../hooks";
import { useBodyScrollLock } from "../utils/scroll-lock";

type Props = {
  open: boolean;
  backend: BackendId;
  status: SaveStatus;
  dirty: boolean;
  onSaveNow: () => void;
  onClose: () => void;
};

type ProviderView = {
  name: string;
  path: string;
  url: string;
};

function providerView(backend: BackendId): ProviderView | null {
  if (backend === "dropbox") {
    return {
      name: "Dropbox",
      path: `Apps/${DROPBOX_APP_FOLDER}${DROPBOX_FILE_PATH}`,
      url: dropboxWebUrl(),
    };
  }
  if (backend === "gdrive") {
    return {
      name: "Google Drive",
      path: `My Drive/${GDRIVE_FILE_NAME}`,
      // Drive home page — we don't carry the file id through here,
      // and the user can scroll to the file from My Drive.
      url: gdriveWebUrl(null),
    };
  }
  return null;
}

type StatusView = {
  Icon: typeof CloudCheck;
  label: string;
  tone: "ok" | "busy" | "warn" | "err";
  detail?: string;
  spin?: boolean;
};

function statusView(
  status: SaveStatus,
  dirty: boolean,
  providerName: string,
): StatusView {
  switch (status.kind) {
    case "loading":
      return {
        Icon: Loader,
        label: "Loading…",
        tone: "busy",
        spin: true,
      };
    case "saving":
      return {
        Icon: CloudUpload,
        label: "Syncing now…",
        tone: "busy",
        spin: true,
      };
    case "error":
      return {
        Icon: CloudAlert,
        label: "Sync failed",
        tone: "err",
        detail: status.message,
      };
    case "conflict":
      return {
        Icon: CloudAlert,
        label: "Sync conflict",
        tone: "warn",
        detail: `${providerName} changed underneath this device. Reload to pick up the remote copy.`,
      };
    case "saved":
    case "idle":
      return dirty
        ? {
            Icon: RefreshCw,
            label: "Pending sync",
            tone: "busy",
            detail:
              "Edits aren't on the cloud yet. Tap Save now to push immediately, or wait for the next auto-save.",
          }
        : {
            Icon: CloudCheck,
            label: `Synced to ${providerName}`,
            tone: "ok",
          };
  }
}

const TONE_BORDER: Record<StatusView["tone"], string> = {
  ok: "border-success/40",
  busy: "border-line",
  warn: "border-pipe/50",
  err: "border-danger/50",
};

const TONE_TEXT: Record<StatusView["tone"], string> = {
  ok: "text-success",
  busy: "text-muted",
  warn: "text-pipe",
  err: "text-danger",
};

export function SyncDetailsModal({
  open,
  backend,
  status,
  dirty,
  onSaveNow,
  onClose,
}: Props) {
  useBodyScrollLock(open);

  useEscapeKey(open, onClose);

  if (!open) return null;
  const view = providerView(backend);
  if (!view) return null;

  const state = statusView(status, dirty, view.name);
  const busy = status.kind === "saving" || status.kind === "loading";
  const showSaveNow =
    !busy && (status.kind === "error" || (dirty && status.kind !== "conflict"));
  const saveLabel = status.kind === "error" ? "Try again" : "Save now";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-details-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-t-lg bg-surface shadow-2xl sm:rounded-lg">
        <header className="flex items-center justify-between border-b border-line bg-surface-3 px-4 py-3">
          <h2
            id="sync-details-title"
            className="text-sm font-bold tracking-wide text-fg-bright"
          >
            Cloud sync
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X size={18} aria-hidden focusable={false} />
          </button>
        </header>

        <div className="flex flex-col gap-3 px-4 py-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted">Status</span>
            <div
              className={`flex items-start gap-2 rounded border px-2 py-1.5 ${TONE_BORDER[state.tone]}`}
            >
              <state.Icon
                size={16}
                aria-hidden
                focusable={false}
                className={`mt-0.5 shrink-0 ${TONE_TEXT[state.tone]} ${
                  state.spin ? "animate-spin" : ""
                }`}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className={`text-sm font-bold ${TONE_TEXT[state.tone]}`}>
                  {state.label}
                </span>
                {state.detail && (
                  <p className="text-xs break-words whitespace-pre-wrap text-fg">
                    {state.detail}
                  </p>
                )}
              </div>
            </div>
            {showSaveNow && (
              <button
                type="button"
                onClick={onSaveNow}
                className="inline-flex cursor-pointer items-center justify-center gap-1.5 self-start rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20"
              >
                <CloudUpload size={14} aria-hidden focusable={false} />
                {saveLabel}
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">Provider</span>
            <span className="text-sm text-fg-bright">{view.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">File location</span>
            <span className="rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-xs break-all text-path">
              {view.path}
            </span>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
          >
            Close
          </button>
          <a
            href={view.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20"
          >
            <ExternalLink size={14} aria-hidden focusable={false} />
            Open in {view.name}
          </a>
        </footer>
      </div>
    </div>
  );
}
