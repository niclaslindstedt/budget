import { useEffect, useState } from "react";
import { CloudAlert, Loader, LogIn } from "lucide-react";

import { useT } from "../i18n";
import type { BackendId } from "../storage/backend-preference";
import { preloadGdriveAuth } from "../storage/gdrive-adapter";
import { Modal } from "./Modal";

type Props = {
  open: boolean;
  // Only "dropbox" and "gdrive" are reconnectable through this modal —
  // local backends have no OAuth session to refresh, and the folder
  // backend has its own permission-regrant path. Null when the active
  // backend isn't one of those (modal renders nothing).
  backend: BackendId;
  // Run the actual OAuth re-issue. Resolves on success and throws on
  // failure so the modal can surface the message inline. For Dropbox
  // this resolves to a navigation away from the page (full-page
  // redirect) — the spinner will sit until the browser unloads.
  onConfirm: () => Promise<void>;
  onClose: () => void;
};

type ProviderName = { name: string };

function providerName(backend: BackendId): ProviderName | null {
  if (backend === "dropbox") return { name: "Dropbox" };
  if (backend === "gdrive") return { name: "Google Drive" };
  return null;
}

// Dedicated dialog for re-authorising the active cloud backend after
// the token can't be refreshed silently. Auto-opens when
// `useUserDataStorage` transitions into `auth-error`, gated by the
// `cloudReauthAutoOpen` device preference. The reconnect button shows
// a spinner while the OAuth flow runs — the Google popup goes through
// a script load + consent round trip that can take several seconds,
// and the previous inline button gave no feedback (and silently
// swallowed popup-blocker errors).
export function ReconnectCloudModal({
  open,
  backend,
  onConfirm,
  onClose,
}: Props) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPending(false);
      setError(null);
      return;
    }
    // Warm the GIS script so `requestAccessToken` runs synchronously
    // inside the upcoming click handler. Without this the await in
    // `startGdriveAuth` loses the user gesture and Safari blocks the
    // popup silently.
    if (backend === "gdrive") preloadGdriveAuth();
  }, [open, backend]);

  const view = providerName(backend);
  if (!view) return null;

  const handleClose = () => {
    if (pending) return;
    onClose();
  };

  const handleReconnect = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      labelledBy="reconnect-cloud-title"
      size="max-w-md"
      scrollableBody={false}
      centered
    >
      <Modal.Header
        title={t("sync.reconnect", { name: view.name })}
        onClose={handleClose}
      />
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="flex items-start gap-2 rounded border border-pipe/50 px-2 py-1.5">
          <CloudAlert
            size={16}
            aria-hidden
            focusable={false}
            className="mt-0.5 shrink-0 text-pipe"
          />
          <p className="text-sm text-fg">
            {t("sync.reauthRequiredDetail", { name: view.name })}
          </p>
        </div>
        {error && (
          <div className="rounded border border-danger/50 px-2 py-1.5 text-xs break-words text-danger">
            {error}
          </div>
        )}
      </div>
      <Modal.Footer>
        <button
          type="button"
          onClick={handleClose}
          disabled={pending}
          className={`rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 ${
            pending ? "" : "cursor-pointer"
          }`}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={handleReconnect}
          disabled={pending}
          aria-busy={pending || undefined}
          className={`inline-flex items-center gap-1.5 rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-70 ${
            pending ? "" : "cursor-pointer"
          }`}
        >
          {pending ? (
            <Loader
              size={14}
              aria-hidden
              focusable={false}
              className="animate-spin"
            />
          ) : (
            <LogIn size={14} aria-hidden focusable={false} />
          )}
          {t("sync.reconnect", { name: view.name })}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
