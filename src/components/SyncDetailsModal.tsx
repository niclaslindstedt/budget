import { useEffect } from "react";
import { ExternalLink, X } from "lucide-react";

import type { BackendId } from "../storage/backend-preference";
import {
  DROPBOX_APP_FOLDER,
  DROPBOX_FILE_PATH,
  dropboxWebUrl,
} from "../storage/dropbox-adapter";

type Props = {
  open: boolean;
  backend: BackendId;
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
  return null;
}

export function SyncDetailsModal({ open, backend, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;
  const view = providerView(backend);
  if (!view) return null;

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
