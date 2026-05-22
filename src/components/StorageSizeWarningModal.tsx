import { useT } from "../i18n";
import { Modal } from "./Modal";

type Props = {
  open: boolean;
  sizeBytes: number;
  thresholdBytes: number;
  onClose: () => void;
  onGoToSettings: () => void;
};

function formatMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

export function StorageSizeWarningModal({
  open,
  sizeBytes,
  thresholdBytes,
  onClose,
  onGoToSettings,
}: Props) {
  const t = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="storage-warning-title"
      role="alertdialog"
      centered
    >
      <Modal.Header
        title={t("settings.storage.warning.title")}
        onClose={onClose}
      />
      <Modal.Body className="flex flex-col gap-3 text-sm">
        <p>
          {t("settings.storage.warning.body", {
            size: formatMb(sizeBytes),
            threshold: formatMb(thresholdBytes),
          })}
        </p>
        <p className="text-muted">{t("settings.storage.warning.hint")}</p>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded border border-line bg-surface-2 px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-3"
        >
          {t("settings.storage.warning.dismiss")}
        </button>
        <button
          type="button"
          onClick={onGoToSettings}
          className="cursor-pointer rounded bg-accent px-3 py-1.5 text-sm font-medium text-page-bg hover:opacity-90"
        >
          {t("settings.storage.warning.goToSettings")}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
