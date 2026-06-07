import { useRef, useState, type ChangeEvent } from "react";
import { FileText, Plus, Trash2, Upload } from "lucide-react";

import { repairReceipts } from "../../data/property-repairs/receipts";
import type {
  Property,
  PropertyRepair,
  RepairReceipt,
  Settings,
} from "../../data/types";
import { useT } from "../../i18n";
import { AttachmentUploadModal } from "../AttachmentUploadModal";
import { Button } from "../form";
import { Modal } from "../Modal";

// The repair-receipts manager — a repair owns a list of dated receipt
// documents (a job often arrives as several invoices over time). Lists the
// repair's receipts, each with its own editable date (defaulting to the
// repair's date at upload) and a tap-to-open preview, plus an "Add receipt"
// affordance. The preview / replace / download / remove of a single receipt
// reuses the universal `AttachmentUploadModal`, scoped to that one path.
//
// Centered: the only inputs are native date pickers and a file picker, neither
// of which opens the soft keyboard, so the dead-space-below problem a
// fullscreen modal would have doesn't apply.

const DATE_CLASS =
  "field-input rounded border border-line bg-surface-2 px-2 py-1 text-xs text-fg";

type Props = {
  open: boolean;
  property: Property;
  // The repair whose receipts are being managed, re-resolved live by the host
  // so the list reflects each add / remove / re-file without a stale snapshot.
  repair: PropertyRepair | null;
  settings: Settings;
  // The merchant the row resolves (off the source transaction), used only to
  // name the receipt files.
  companyName: string;
  onClose: () => void;
  onUpload: (
    property: Property,
    repair: PropertyRepair,
    companyName: string,
    file: File,
    date?: string,
  ) => Promise<RepairReceipt>;
  onReplace: (
    property: Property,
    repair: PropertyRepair,
    receipt: RepairReceipt,
    companyName: string,
    file: File,
  ) => Promise<string>;
  onRemove: (
    property: Property,
    repair: PropertyRepair,
    receiptId: string,
    path: string,
  ) => Promise<void>;
  onSetDate: (
    property: Property,
    repair: PropertyRepair,
    receipt: RepairReceipt,
    companyName: string,
    date: string,
  ) => Promise<void>;
  onDownload: (path: string) => Promise<Blob>;
};

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

export function RepairReceiptsModal({
  open,
  property,
  repair,
  companyName,
  onClose,
  onUpload,
  onReplace,
  onRemove,
  onSetDate,
  onDownload,
}: Props) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The receipt currently open in the preview modal, tracked by id so it
  // re-resolves against the live repair after a replace re-files it.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open || !repair) return null;

  const receipts = [...repairReceipts(repair)].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const viewing = viewingId
    ? (repair.receipts?.find((r) => r.id === viewingId) ?? null)
    : null;

  async function handlePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !repair) return;
    setBusy(true);
    try {
      await onUpload(property, repair, companyName, file);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="repair-receipts-title"
      size="max-w-md"
      centered
    >
      <Modal.Header
        icon={<FileText size={14} aria-hidden focusable={false} />}
        title={t("properties.repairReceiptsTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        {receipts.length === 0 ? (
          <p className="m-0 py-6 text-center text-sm text-muted">
            {t("properties.repairReceiptsEmpty")}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {receipts.map((receipt) => (
              <li
                key={receipt.id}
                className="flex items-center gap-2 rounded border border-line bg-surface-2 px-2 py-2"
              >
                <input
                  type="date"
                  value={receipt.date.slice(0, 10)}
                  aria-label={t("properties.repairReceiptDateAria")}
                  className={DATE_CLASS}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    void onSetDate(
                      property,
                      repair,
                      receipt,
                      companyName,
                      e.target.value,
                    );
                  }}
                />
                <button
                  type="button"
                  onClick={() => setViewingId(receipt.id)}
                  title={t("properties.repairReceiptOpenAria")}
                  aria-label={t("properties.repairReceiptOpenAria")}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left text-fg hover:text-accent"
                >
                  <FileText
                    size={14}
                    aria-hidden
                    focusable={false}
                    className="shrink-0 text-muted"
                  />
                  <span className="min-w-0 truncate font-mono text-xs">
                    {basename(receipt.path)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void onRemove(property, repair, receipt.id, receipt.path);
                  }}
                  title={t("properties.repairReceiptRemoveAria")}
                  aria-label={t("properties.repairReceiptRemoveAria")}
                  className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-3 hover:text-danger"
                >
                  <Trash2 size={16} aria-hidden focusable={false} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handlePicked}
          className="hidden"
        />
      </Modal.Body>
      <Modal.Footer className="justify-start">
        <Button
          variant="primary"
          withIcon
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {busy ? (
            <Upload size={16} aria-hidden focusable={false} />
          ) : (
            <Plus size={16} aria-hidden focusable={false} />
          )}
          {t("properties.repairReceiptAdd")}
        </Button>
      </Modal.Footer>

      <AttachmentUploadModal
        open={viewing !== null}
        onClose={() => setViewingId(null)}
        title={t("properties.repairReceipt")}
        currentPath={viewing?.path}
        onUpload={(file) =>
          onReplace(property, repair, viewing!, companyName, file)
        }
        onDownload={onDownload}
        onRemove={async () => {
          await onRemove(property, repair, viewing!.id, viewing!.path);
          setViewingId(null);
        }}
      />
    </Modal>
  );
}
