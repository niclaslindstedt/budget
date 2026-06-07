import { memo, useState } from "react";
import {
  Building2,
  Drill,
  Layers,
  PaintRoller,
  Plus,
  AlertTriangle,
  Pencil,
  Trash2,
  Wrench,
} from "lucide-react";

import { PRESET_TYPE_RENOVATIONS_ID } from "../../data/presets/types";
import { repairSourceCount } from "../../data/property-repairs/sources";
import type {
  ReceiptNaming,
  TxnReceiptTarget,
} from "../../data/receipts/target";
import type {
  Company,
  Property,
  PropertyRepair,
  Settings,
  Tag,
} from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useRowSwipe } from "../../hooks/useRowSwipe";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatDate } from "../../utils/format";
import { AttachmentUploadModal } from "../AttachmentUploadModal";
import { ConfirmDialog } from "../ConfirmDialog";
import { Button } from "../form";
import { Modal } from "../Modal";
import { useClaimActiveRow } from "../useClaimActiveRow";
import { RepairEntryActionsMenu } from "./RepairEntryActionsMenu";

// Per-property repairs / renovations view, opened by the wrench button on a
// property card. Lists the property's repairs newest-first — each a bank
// charge the user tagged Repairs / Renovations and bound here, with an
// optional user description + subtype. A repair with no receipt of its own
// is flagged "missing receipt" (the receipt is what makes the cost
// tax-deductible). Each row swipes left to reveal edit / delete /
// receipt actions, mirroring the items and mortgage-payment lists. The
// footer offers a full single-add form and a bulk quick-add picker, both
// owned by the page.

// The repair's company / tags, resolved live from the source transaction
// (override → rule → hint) rather than stored on the repair. Keyed by
// `${accountId}:${entryId}` in the parent's `repairMetadata` map.
export type RepairMetadata = {
  company: Company | null;
  tags: readonly Tag[];
};

type Props = {
  open: boolean;
  property: Property | null;
  settings: Settings;
  // The company / tags behind each repair, resolved from its source
  // transaction and keyed by `${accountId}:${entryId}` — surfaced as
  // read-only metadata on the row (edited through the repair editor).
  repairMetadata: ReadonlyMap<string, RepairMetadata>;
  // Whether the active backend can store receipts. When false the manage
  // affordance is hidden, but the "missing receipt" flag still shows — it
  // keeps the tax-deduction urgency visible regardless of backend.
  canManageReceipt: boolean;
  onUploadReceipt: (
    target: TxnReceiptTarget,
    file: File,
    naming: ReceiptNaming,
  ) => Promise<string>;
  onDownloadReceipt: (path: string) => Promise<Blob>;
  onRemoveReceipt: (target: TxnReceiptTarget, path: string) => Promise<void>;
  onEditRepair: (repair: PropertyRepair) => void;
  onDeleteRepair: (repairId: string) => void;
  // The full single-add form (pick a source charge → description → subtype).
  onAddSingle: () => void;
  // The bulk multi-select candidate picker (skips description / subtype).
  onQuickAdd: () => void;
  onClose: () => void;
};

// The `${accountId}:${entryId}` key of a repair's primary source, under which
// its resolved company / tags live in the `repairMetadata` map.
function sourceKey(repair: PropertyRepair): string {
  return `${repair.accountId}:${repair.sourceHistoryId}`;
}

export function RepairsModal({
  open,
  property,
  settings,
  repairMetadata,
  canManageReceipt,
  onUploadReceipt,
  onDownloadReceipt,
  onRemoveReceipt,
  onEditRepair,
  onDeleteRepair,
  onAddSingle,
  onQuickAdd,
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
    kind: "repair",
    propertyId: property.id,
    repairId: repair.id,
  });
  const namingFor = (repair: PropertyRepair): ReceiptNaming => ({
    companyName: repair.description,
    entryId: repair.id,
    entryDate: repair.date,
    typeLabel:
      repair.typeId === PRESET_TYPE_RENOVATIONS_ID
        ? t("properties.repairTypeRenovations")
        : t("properties.repairTypeRepairs"),
  });
  const receiptPathFor = (repair: PropertyRepair): string | undefined =>
    repair.receiptPath;

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
          <table className="repairs-table w-full border-collapse">
            <tbody>
              {repairs.map((repair) => (
                <RepairRow
                  key={repair.id}
                  repair={repair}
                  settings={settings}
                  metadata={repairMetadata.get(sourceKey(repair)) ?? null}
                  hasReceipt={receiptPathFor(repair) !== undefined}
                  canManageReceipt={canManageReceipt}
                  onManageReceipt={() => setManagingReceipt(repair)}
                  onEdit={() => onEditRepair(repair)}
                  onDelete={() => setPendingDelete(repair)}
                />
              ))}
            </tbody>
          </table>
        )}
      </Modal.Body>

      <Modal.Footer className="justify-start">
        <Button variant="primary" withIcon onClick={onAddSingle}>
          <Plus size={16} aria-hidden focusable={false} />
          {t("properties.repairsAdd")}
        </Button>
        <Button variant="secondary" onClick={onQuickAdd}>
          {t("properties.repairsQuickAdd")}
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
  metadata: RepairMetadata | null;
  hasReceipt: boolean;
  canManageReceipt: boolean;
  onManageReceipt: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

// One repair row. Desktop keeps the edit / delete / more icons inline in the
// trailing cell; on mobile the row swipes left to reveal them from behind,
// mirroring the items / mortgage-payment lists (see the `.repairs-table`
// rules in styles/components.css). The "missing receipt" flag stays inline so
// the deductibility cue reads on every viewport.
function RepairRowImpl({
  repair,
  settings,
  metadata,
  hasReceipt,
  canManageReceipt,
  onManageReceipt,
  onEdit,
  onDelete,
}: RowProps) {
  const t = useT();
  const lang = useLang();
  const { swiped, setSwiped, touchHandlers } = useRowSwipe();

  // A swiped row exposes edit / delete; claim the active-row slot so a tap
  // elsewhere only retracts the swipe instead of also firing the control
  // underneath.
  useClaimActiveRow(repair.id, swiped, () => setSwiped(false));

  const isRenovation = repair.typeId === PRESET_TYPE_RENOVATIONS_ID;
  const Glyph = isRenovation ? PaintRoller : Drill;
  const typeLabel = isRenovation
    ? t("properties.repairTypeRenovations")
    : t("properties.repairTypeRepairs");
  const label = repair.description || typeLabel;
  const company = metadata?.company ?? null;
  const tags = metadata?.tags ?? [];
  const sourceCount = repairSourceCount(repair);

  return (
    <tr
      className={`border-b border-line last:border-b-0${swiped ? " is-swiped" : ""}`}
      data-row-id={repair.id}
      data-swipe-handled
      onClick={() => {
        if (swiped) setSwiped(false);
      }}
      {...touchHandlers}
    >
      <td className="px-1 py-3 align-top">
        <Glyph
          size={16}
          className="mt-0.5 shrink-0 text-accent"
          aria-label={typeLabel}
          focusable={false}
        />
      </td>
      <td className="min-w-0 px-1.5 py-3 align-top">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="block truncate text-sm text-fg-bright">{label}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className="tabular-nums">
              {formatDate(repair.date, settings.dateFormat, lang)}
            </span>
            {sourceCount > 1 && (
              <span className="inline-flex items-center gap-1">
                <Layers size={12} aria-hidden focusable={false} />
                {t("properties.repairSourcesCountOther", {
                  count: sourceCount,
                })}
              </span>
            )}
            {company && (
              <span className="inline-flex items-center gap-1">
                <Building2 size={12} aria-hidden focusable={false} />
                <span className="min-w-0 truncate text-fg">{company.name}</span>
              </span>
            )}
            {!hasReceipt && (
              <span className="inline-flex items-center gap-1 text-negative">
                <AlertTriangle size={12} aria-hidden focusable={false} />
                {t("properties.missingReceipt")}
              </span>
            )}
          </span>
          {tags.length > 0 && (
            <span className="flex flex-wrap items-center gap-1">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-fg"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">{tag.name}</span>
                </span>
              ))}
            </span>
          )}
        </span>
      </td>
      <td className="px-1.5 py-3 text-right align-top text-sm whitespace-nowrap tabular-nums text-fg-bright">
        <span className="justify-end">
          {formatBalance(repair.amount, settings, { neverAbbreviate: true })}
        </span>
      </td>
      <td className="repairs-action-cell w-32 p-0 align-middle">
        <div className="flex h-full w-full items-stretch justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSwiped(false);
              onEdit();
            }}
            aria-label={t("properties.editRepairAria", { description: label })}
            title={t("properties.editRepair")}
            className="action-btn action-btn-pen inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
          >
            <Pencil size={16} aria-hidden focusable={false} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSwiped(false);
              onDelete();
            }}
            aria-label={t("properties.deleteRepairAria", {
              description: label,
            })}
            title={t("properties.deleteRepair")}
            className="action-btn action-btn-delete inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-danger"
          >
            <Trash2 size={16} aria-hidden focusable={false} />
          </button>
          <RepairEntryActionsMenu
            repair={repair}
            canManageReceipt={canManageReceipt}
            hasReceipt={hasReceipt}
            onManageReceipt={onManageReceipt}
            onAction={() => setSwiped(false)}
          />
        </div>
      </td>
    </tr>
  );
}

const RepairRow = memo(RepairRowImpl);
