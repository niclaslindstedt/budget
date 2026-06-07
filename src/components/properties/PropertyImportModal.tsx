import { useRef, useState } from "react";
import { FileDown, FileText } from "lucide-react";

import { parsePropertyManifest } from "../../data/property-transfer/import";
import type { PropertyExportManifest } from "../../data/property-transfer/manifest";
import { useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import { createLogger } from "../../utils/logger";
import { unzip } from "../../utils/unzip";
import { Button } from "../form";
import { Modal } from "../Modal";

const log = createLogger("property-import");

const textDecoder = new TextDecoder();

type Props = {
  open: boolean;
  // Whether the active backend can store the imported file / receipt bytes.
  // When false the property's details still import; its attachments don't.
  canManage: boolean;
  onImport: (
    manifest: PropertyExportManifest,
    zip: ReadonlyMap<string, Uint8Array>,
  ) => Promise<{ propertyName: string; skipped: number }>;
  onClose: () => void;
};

// A successfully-read archive awaiting confirmation.
type Loaded = {
  manifest: PropertyExportManifest;
  zip: Map<string, Uint8Array>;
};

// Import a property from a sale-handover ZIP archive. Reads + previews the
// archive, then (on confirm) hands it to the page to re-upload its bytes and
// add it as a new property. Centered — the only input is a file picker, which
// doesn't open the soft keyboard.
export function PropertyImportModal({
  open,
  canManage,
  onImport,
  onClose,
}: Props) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useResetOnOpen(open, undefined, () => {
    setLoaded(null);
    setError(null);
    setBusy(false);
  });

  if (!open) return null;

  async function handlePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setLoaded(null);
    try {
      const zip = await unzip(new Uint8Array(await file.arrayBuffer()));
      const manifestBytes = zip.get("manifest.json");
      if (!manifestBytes) {
        setError(t("properties.importInvalid"));
        return;
      }
      const parsed = parsePropertyManifest(textDecoder.decode(manifestBytes));
      if (!parsed.ok) {
        setError(
          parsed.error === "newer-version"
            ? t("properties.importNewerVersion")
            : t("properties.importInvalid"),
        );
        return;
      }
      setLoaded({ manifest: parsed.manifest, zip });
    } catch (err) {
      log.error(`property import: failed to read ${file.name}`, err);
      setError(t("properties.importReadError"));
    }
  }

  async function handleImport() {
    if (busy || !loaded) return;
    setBusy(true);
    try {
      await onImport(loaded.manifest, loaded.zip);
      onClose();
    } catch (err) {
      log.error("property import failed", err);
      setError(t("properties.importReadError"));
      setBusy(false);
    }
  }

  const manifest = loaded?.manifest;
  const repairCount = manifest?.repairs.length ?? 0;
  const fileCount = manifest?.files.length ?? 0;
  const hasFinancials = manifest?.financials !== undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="property-import-title"
      size="max-w-md"
      centered
    >
      <Modal.Header
        icon={<FileDown size={14} aria-hidden focusable={false} />}
        title={t("properties.importTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm text-muted">
            {t("properties.importIntro")}
          </p>

          <div>
            <Button
              variant="secondary"
              withIcon
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText size={16} aria-hidden focusable={false} />
              {t("properties.importChooseFile")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              onChange={handlePicked}
              className="hidden"
            />
          </div>

          {error && (
            <p className="m-0 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          {manifest && (
            <div className="flex flex-col gap-2 rounded border border-line bg-surface-2 px-3 py-2">
              <span className="text-sm font-medium text-fg-bright">
                {manifest.property.name}
              </span>
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                <span>
                  {repairCount === 1
                    ? t("properties.importSummaryRepairsOne", {
                        count: repairCount,
                      })
                    : t("properties.importSummaryRepairsOther", {
                        count: repairCount,
                      })}
                </span>
                <span>
                  {fileCount === 1
                    ? t("properties.importSummaryFilesOne", {
                        count: fileCount,
                      })
                    : t("properties.importSummaryFilesOther", {
                        count: fileCount,
                      })}
                </span>
                {hasFinancials && (
                  <span>{t("properties.importSummaryFinancials")}</span>
                )}
              </span>
              {!canManage && (fileCount > 0 || repairCount > 0) && (
                <span className="text-xs text-muted">
                  {t("properties.importUnavailableNote")}
                </span>
              )}
            </div>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={handleImport}
          disabled={busy || !loaded}
        >
          {t("properties.importAction")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
