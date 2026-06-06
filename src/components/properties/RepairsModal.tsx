import { memo, useState } from "react";
import {
  Drill,
  PaintRoller,
  Plus,
  ReceiptText,
  AlertTriangle,
  Trash2,
  Wrench,
} from "lucide-react";

import { PRESET_TYPE_RENOVATIONS_ID } from "../../data/presets/types";
import type {
  ReceiptNaming,
  TxnReceiptTarget,
} from "../../data/receipts/target";
import type {
  HistoryEntry,
  Property,
  PropertyRepair,
  Settings,
} from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatShortDate } from "../../utils/format";
import { AttachmentUploadModal } from "../AttachmentUploadModal";
import { ConfirmDialog } from "../ConfirmDialog";
import { Button } from "../form";
import { Modal } from "../Modal";

// Per-property repairs / renovations view, opened by the wrench button on a
// property card. Lists the property's repairs newest-first — each a bank
// charge the user tagged Repairs / Renovations and bound here. A repair with
// no receipt on its source transaction is flagged "missing receipt" (the
// receipt is what makes the cost tax-deductible), and each row can attach /
// view / replace / remove that receipt and be deleted. The "Add" button
// hands back to the page, which opens the candidate picker.

type Props = {
  open: boolean;
  property: Property | null;
  settings: Settings;
  // Live source bank entries keyed by `${accountId}:${entryId}`, so each
  // repair reads its current receipt status (attaching one elsewhere clears
  // the "missing" flag here without mutating the repair).
  sourceEntries: ReadonlyMap<string, HistoryEntry>;
  // Whether the active backend can store receipts. When false the upload /
  // manage affordance is hidden, but the "missing receipt" flag still shows
  // — it keeps the tax-deduction urgency visible regardless of backend.
  canManageReceipt: boolean;
  onUploadReceipt: (
    target: TxnReceiptTarget,
    file: File,
    naming: ReceiptNaming,
  ) => Promise<string>;
  onDownloadReceipt: (path: string) => Promise<Blob>;
  onRemoveReceipt: (target: TxnReceiptTarget, path: string) => Promise<void>;
  onDeleteRepair: (repairId: string) => void;
  onAdd: () => void;
  onClose: () => void;
};

// The receipt path on a repair's source entry, or undefined when the entry
// is gone (a re-import) or carries no receipt.
function sourceKey(repair: PropertyRepair): string {
  return `${repair.accountId}:${repair.sourceHistoryId}`;
}

export function RepairsModal({
  open,
  property,
  settings,
  sourceEntries,
  canManageReceipt,
  onUploadReceipt,
  onDownloadReceipt,
  onRemoveReceipt,
  onDeleteRepair,
  onAdd,
  onClose,
}: Props) {
  const t = useT();

  const [managingReceipt, setManagingReceipt] = useState<PropertyRepair | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<PropertyRepair | null>(
    null,
  );

  useResetOnOpen(open, property?.id, () => {
    setManagingReceipt(null);
    setPendingDelete(null);
  });

  if (!open || !property) return null;

  const repairs = [...property.repairs].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );

  const receiptTargetFor = (repair: PropertyRepair): TxnReceiptTarget => ({
    kind: "history",
    accountId: repair.accountId,
    entryId: repair.sourceHistoryId,
  });
  const namingFor = (repair: PropertyRepair): ReceiptNaming => ({
    companyName: repair.description,
    entryId: repair.sourceHistoryId,
    entryDate: repair.date,
    typeLabel:
      repair.typeId === PRESET_TYPE_RENOVATIONS_ID
        ? t("properties.repairTypeRenovations")
        : t("properties.repairTypeRepairs"),
  });
  const receiptPathFor = (repair: PropertyRepair): string | undefined =>
    sourceEntries.get(sourceKey(repair))?.receiptPath;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="repairs-title"
      size="max-w-2xl"
      fixedHeight
    >
      <Modal.Header
        icon={<Wrench size={14} aria-hidden focusable={false} />}
        title={t("properties.repairsTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        {repairs.length === 0 ? (
          <p className="m-0 py-6 text-center text-sm text-muted">
            {t("properties.repairsEmpty")}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {repairs.map((repair) => (
              <RepairRow
                key={repair.id}
                repair={repair}
                settings={settings}
                hasReceipt={receiptPathFor(repair) !== undefined}
                canManageReceipt={canManageReceipt}
                onManageReceipt={() => setManagingReceipt(repair)}
                onDelete={() => setPendingDelete(repair)}
              />
            ))}
          </ul>
        )}
      </Modal.Body>

      <Modal.Footer className="justify-start">
        <Button variant="primary" withIcon onClick={onAdd}>
          <Plus size={16} aria-hidden focusable={false} />
          {t("properties.repairsAdd")}
        </Button>
      </Modal.Footer>

      {canManageReceipt && (
        <AttachmentUploadModal
          open={managingReceipt !== null}
          onClose={() => setManagingReceipt(null)}
          title={t("properties.repairReceipt")}
          currentPath={
            managingReceipt ? receiptPathFor(managingReceipt) : undefined
          }
          onUpload={(file) =>
            onUploadReceipt(
              receiptTargetFor(managingReceipt!),
              file,
              namingFor(managingReceipt!),
            )
          }
          onDownload={onDownloadReceipt}
          onRemove={(path) =>
            onRemoveReceipt(receiptTargetFor(managingReceipt!), path)
          }
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("properties.deleteRepairTitle")}
        description={
          pendingDelete
            ? t("properties.deleteRepairConfirm", {
                description:
                  pendingDelete.description ||
                  (pendingDelete.typeId === PRESET_TYPE_RENOVATIONS_ID
                    ? t("properties.repairTypeRenovations")
                    : t("properties.repairTypeRepairs")),
                amount: formatBalance(pendingDelete.amount, settings, {
                  neverAbbreviate: true,
                }),
              })
            : null
        }
        actions={[
          {
            label: t("properties.deleteRepair"),
            tone: "danger",
            onSelect: () => {
              if (pendingDelete) onDeleteRepair(pendingDelete.id);
              setPendingDelete(null);
            },
          },
        ]}
        onCancel={() => setPendingDelete(null)}
      />
    </Modal>
  );
}

type RowProps = {
  repair: PropertyRepair;
  settings: Settings;
  hasReceipt: boolean;
  canManageReceipt: boolean;
  onManageReceipt: () => void;
  onDelete: () => void;
};

// One repair row. The receipt / delete controls sit inline in the trailing
// cell, always visible (no swipe) so the row reads the same on every
// viewport — a short modal list, not a dense table.
function RepairRowImpl({
  repair,
  settings,
  hasReceipt,
  canManageReceipt,
  onManageReceipt,
  onDelete,
}: RowProps) {
  const t = useT();
  const lang = useLang();

  const isRenovation = repair.typeId === PRESET_TYPE_RENOVATIONS_ID;
  const Glyph = isRenovation ? PaintRoller : Drill;
  const typeLabel = isRenovation
    ? t("properties.repairTypeRenovations")
    : t("properties.repairTypeRepairs");

  return (
    <li className="flex items-center gap-2.5 rounded border border-line bg-surface-2 px-3 py-2 text-sm">
      <Glyph
        size={16}
        className="shrink-0 text-accent"
        aria-label={typeLabel}
        focusable={false}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-fg-bright">
          {repair.description || typeLabel}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="tabular-nums">
            {formatShortDate(repair.date, settings.shortDateFormat, lang)}
          </span>
          {!hasReceipt && (
            <span className="inline-flex items-center gap-1 text-negative">
              <AlertTriangle size={12} aria-hidden focusable={false} />
              {t("properties.missingReceipt")}
            </span>
          )}
        </span>
      </span>
      <span className="shrink-0 tabular-nums text-fg-bright">
        {formatBalance(repair.amount, settings, { neverAbbreviate: true })}
      </span>
      {canManageReceipt && (
        <button
          type="button"
          onClick={onManageReceipt}
          aria-label={t("properties.manageReceipt")}
          className={`shrink-0 cursor-pointer rounded border-0 bg-transparent p-1 hover:text-accent ${
            hasReceipt ? "text-success" : "text-muted"
          }`}
        >
          <ReceiptText size={16} aria-hidden focusable={false} />
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        aria-label={t("properties.deleteRepair")}
        className="shrink-0 cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-danger"
      >
        <Trash2 size={16} aria-hidden focusable={false} />
      </button>
    </li>
  );
}

const RepairRow = memo(RepairRowImpl);
