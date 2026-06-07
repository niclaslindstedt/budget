import { useState } from "react";
import { Share2 } from "lucide-react";

import type { PropertyExportOptions } from "../../data/property-transfer/export";
import type { Property } from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import { createLogger } from "../../utils/logger";
import {
  slugifyFilename,
  todayStamp,
  triggerDownload,
} from "../../utils/download";
import { Button } from "../form";
import { Checkbox } from "../form/Checkbox";
import { Radio, RadioGroup } from "../form/Radio";
import { Modal } from "../Modal";

const log = createLogger("property-export");

const ZIP_MIME_TYPE = "application/zip";

type Destination = "download" | "backend";

type Props = {
  open: boolean;
  property: Property | null;
  // Whether the active backend can store / read property files. When false
  // the file / receipt bytes can't be fetched, so the export carries only
  // the property's details — surfaced as a note.
  canManage: boolean;
  // Whether the active backend can store the generated archive in its
  // `exports/` folder. When false the only destination is a direct download,
  // so the destination chooser is hidden.
  canSaveToBackend: boolean;
  // Builds the archive bytes for the chosen options. Resolved on the page
  // (it owns the company / tag / category / subtype name resolution).
  onExport: (
    options: PropertyExportOptions,
  ) => Promise<{ bytes: Uint8Array; skipped: number }>;
  // Writes the built archive to the backend's `exports/` folder under
  // `filename`. Only called when the user picks the "save to backend"
  // destination (gated on `canSaveToBackend`).
  onSaveToBackend: (filename: string, bytes: Uint8Array) => Promise<void>;
  onClose: () => void;
};

// Export a property to a sale-handover ZIP archive. Three toggles gate what
// goes in: receipts (on by default), private files (off), and the seller's
// mortgages + payments (off). When the backend can store exports, a
// destination chooser lets the archive be saved to its `exports/` folder
// instead of downloaded. Centered — no text inputs, so no soft-keyboard
// handling is needed.
export function PropertyExportModal({
  open,
  property,
  canManage,
  canSaveToBackend,
  onExport,
  onSaveToBackend,
  onClose,
}: Props) {
  const t = useT();
  const [includeReceipts, setIncludeReceipts] = useState(true);
  const [includePrivate, setIncludePrivate] = useState(false);
  const [includeFinancials, setIncludeFinancials] = useState(false);
  const [destination, setDestination] = useState<Destination>("download");
  const [busy, setBusy] = useState(false);
  const [skipped, setSkipped] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  useResetOnOpen(open, property?.id, () => {
    setIncludeReceipts(true);
    setIncludePrivate(false);
    setIncludeFinancials(false);
    setDestination("download");
    setBusy(false);
    setSkipped(null);
    setSaved(false);
  });

  if (!open || !property) return null;

  // The backend destination only makes sense when the backend can store the
  // archive AND its attachments — fall back to a download otherwise.
  const toBackend = destination === "backend" && canSaveToBackend;

  async function handleExport() {
    if (busy || !property) return;
    setBusy(true);
    setSkipped(null);
    setSaved(false);
    try {
      const { bytes, skipped: missed } = await onExport({
        includeReceipts,
        includePrivate,
        includeFinancials,
      });
      const filename = `property-${slugifyFilename(property.name)}-${todayStamp()}.zip`;
      if (toBackend) {
        await onSaveToBackend(filename, bytes);
        // No browser download to signal success, so keep the modal open and
        // surface a confirmation (plus the "some files were missing" note).
        setSaved(true);
        if (missed > 0) setSkipped(missed);
      } else {
        triggerDownload(bytes, filename, ZIP_MIME_TYPE);
        // Close straight away on a clean export; keep the modal open to show
        // the "some files were missing" note so it isn't lost.
        if (missed > 0) setSkipped(missed);
        else onClose();
      }
    } catch (err) {
      log.error(`property export failed name=${property.name}`, err);
      setSkipped(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="property-export-title"
      size="max-w-md"
      centered
    >
      <Modal.Header
        icon={<Share2 size={14} aria-hidden focusable={false} />}
        title={t("properties.exportTitle", { name: property.name })}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm text-muted">
            {t("properties.exportIntro")}
          </p>
          {!canManage && (
            <p className="m-0 rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
              {t("properties.exportUnavailable")}
            </p>
          )}
          <Checkbox
            checked={includeReceipts}
            onChange={setIncludeReceipts}
            label={t("properties.exportIncludeReceipts")}
            description={t("properties.exportIncludeReceiptsHint")}
          />
          <Checkbox
            checked={includePrivate}
            onChange={setIncludePrivate}
            label={t("properties.exportIncludePrivate")}
            description={t("properties.exportIncludePrivateHint")}
          />
          <Checkbox
            checked={includeFinancials}
            onChange={setIncludeFinancials}
            label={t("properties.exportIncludeFinancials")}
            description={t("properties.exportIncludeFinancialsHint")}
          />
          {canSaveToBackend && (
            <div className="flex flex-col gap-2">
              <p className="m-0 text-xs font-medium text-fg-bright">
                {t("properties.exportDestinationLabel")}
              </p>
              <RadioGroup
                name="property-export-destination"
                value={destination}
                onChange={(next) => {
                  setDestination(next as Destination);
                  setSaved(false);
                }}
                ariaLabel={t("properties.exportDestinationLabel")}
              >
                <Radio
                  value="download"
                  label={t("properties.exportDestinationDownload")}
                  description={t("properties.exportDestinationDownloadHint")}
                />
                <Radio
                  value="backend"
                  label={t("properties.exportDestinationBackend")}
                  description={t("properties.exportDestinationBackendHint")}
                />
              </RadioGroup>
            </div>
          )}
          {saved && (
            <p
              className="m-0 rounded border border-line bg-surface-2 px-3 py-2 text-xs text-success"
              role="status"
            >
              {t("properties.exportSaved")}
            </p>
          )}
          {skipped !== null && skipped > 0 && (
            <p className="m-0 text-xs text-muted" role="status">
              {skipped === 1
                ? t("properties.exportSkippedOne", { count: skipped })
                : t("properties.exportSkippedOther", { count: skipped })}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {saved ? t("common.done") : t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleExport} disabled={busy}>
          {toBackend
            ? t("properties.exportActionSave")
            : t("properties.exportAction")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
