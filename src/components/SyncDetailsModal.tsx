import {
  CloudAlert,
  CloudCheck,
  CloudUpload,
  ExternalLink,
  Loader,
  LogIn,
  RefreshCw,
} from "lucide-react";

import type { BackendId } from "../storage/backend-preference";
import {
  DROPBOX_APP_FOLDER,
  DROPBOX_FILE_PATH,
  dropboxWebUrl,
} from "../storage/dropbox-adapter";
import {
  GDRIVE_APP_FOLDER_NAME,
  GDRIVE_FILE_NAME,
  gdriveWebUrl,
} from "../storage/gdrive-adapter";
import type { SaveStatus } from "../storage/useUserDataStorage";
import { type TFunction, useT } from "../i18n";
import { Modal } from "./Modal";

type Props = {
  open: boolean;
  backend: BackendId;
  status: SaveStatus;
  dirty: boolean;
  onSaveNow: () => void;
  // Re-issue OAuth for the active cloud backend. Null when the
  // current backend has no concept of reconnection (local / folder).
  onReconnect: (() => void) | null;
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
      path: `My Drive/${GDRIVE_APP_FOLDER_NAME}/${GDRIVE_FILE_NAME}`,
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
  t: TFunction,
): StatusView {
  switch (status.kind) {
    case "loading":
      return {
        Icon: Loader,
        label: t("sync.loading"),
        tone: "busy",
        spin: true,
      };
    case "saving":
      return {
        Icon: Loader,
        label: t("sync.syncingNow"),
        tone: "busy",
        spin: true,
      };
    case "error":
      return {
        Icon: CloudAlert,
        label: t("sync.failed"),
        tone: "err",
        detail: status.message,
      };
    case "auth-error":
      return {
        Icon: CloudAlert,
        label: t("sync.reauthRequired"),
        tone: "warn",
        detail: t("sync.reauthRequiredDetail", { name: providerName }),
      };
    case "conflict":
      return {
        Icon: CloudAlert,
        label: t("sync.syncConflict"),
        tone: "warn",
        detail: t("sync.syncConflictDetail", { name: providerName }),
      };
    case "saved":
    case "idle":
      return dirty
        ? {
            Icon: RefreshCw,
            label: t("sync.pendingSync"),
            tone: "busy",
            detail: t("sync.pendingSyncDetail"),
          }
        : {
            Icon: CloudCheck,
            label: t("sync.syncedTo", { name: providerName }),
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
  onReconnect,
  onClose,
}: Props) {
  const t = useT();
  const view = providerView(backend);
  if (!view) return null;

  const state = statusView(status, dirty, view.name, t);
  const busy = status.kind === "saving" || status.kind === "loading";
  const showReconnect = status.kind === "auth-error" && onReconnect !== null;
  const showSaveNow =
    !busy &&
    !showReconnect &&
    (status.kind === "error" || (dirty && status.kind !== "conflict"));
  const saveLabel =
    status.kind === "error" ? t("sync.tryAgain") : t("sync.saveNow");

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="sync-details-title"
      size="max-w-md"
      scrollableBody={false}
      centered
    >
      <Modal.Header title={t("sync.cloudSync")} onClose={onClose} />
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted">{t("sync.status")}</span>
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
          {showReconnect && onReconnect && (
            <button
              type="button"
              onClick={onReconnect}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 self-start rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20"
            >
              <LogIn size={14} aria-hidden focusable={false} />
              {t("sync.reconnect", { name: view.name })}
            </button>
          )}
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
          <span className="text-xs text-muted">{t("sync.provider")}</span>
          <span className="text-sm text-fg-bright">{view.name}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">{t("sync.fileLocation")}</span>
          <span className="rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-xs break-all text-path">
            {view.path}
          </span>
        </div>
      </div>
      <Modal.Footer>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
        >
          {t("common.close")}
        </button>
        <a
          href={view.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20"
        >
          <ExternalLink size={14} aria-hidden focusable={false} />
          {t("sync.openIn", { name: view.name })}
        </a>
      </Modal.Footer>
    </Modal>
  );
}
