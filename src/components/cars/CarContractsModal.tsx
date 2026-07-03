import { useRef, useState } from "react";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";

import type { CarContractMeta } from "./useCarContracts";
import type { Car, CarContract, CarContractKind } from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useT, type TFunction } from "../../i18n";
import { createLogger } from "../../utils/logger";
import { AttachmentUploadModal } from "../AttachmentUploadModal";
import { ConfirmDialog } from "../ConfirmDialog";
import { Button, ClearableInput } from "../form";
import { Modal } from "../Modal";

const log = createLogger("car-contracts");

// The contract kinds, in the order the segmented picker shows them.
const CONTRACT_KINDS: readonly CarContractKind[] = [
  "purchase",
  "lease",
  "sale",
];

// Translated label for a contract kind — shared by the list badge and the
// upload / edit form's picker.
export function contractKindLabel(t: TFunction, kind: CarContractKind): string {
  switch (kind) {
    case "purchase":
      return t("carsSheet.contractKindPurchase");
    case "lease":
      return t("carsSheet.contractKindLease");
    case "sale":
      return t("carsSheet.contractKindSale");
  }
}

// Per-car contracts manager, opened by "Contracts" on a car card's "…" menu.
// Lists the uploaded purchase / leasing / sale documents — each with its kind
// and description — and offers an upload affordance. A contract is viewable
// like a receipt (the universal `AttachmentUploadModal`), its metadata
// editable, and it can be deleted. The bytes live in the backend's
// `cars/<name>/contracts/` store.

type Props = {
  open: boolean;
  car: Car | null;
  // Whether the active backend can store files. When false the upload
  // affordance is hidden (plain localStorage has no sibling-file notion).
  canManage: boolean;
  onUploadContract: (file: File, meta: CarContractMeta) => Promise<CarContract>;
  onReplaceContract: (record: CarContract, file: File) => Promise<string>;
  onDownloadContract: (path: string) => Promise<Blob>;
  onRemoveContract: (contractId: string, path: string) => Promise<void>;
  onUpdateContractMeta: (
    contractId: string,
    patch: Partial<Omit<CarContract, "id">>,
  ) => void;
  onClose: () => void;
};

// The filename derived from a stored path, used as the fallback label when a
// contract carries no description.
function filenameOf(path: string): string {
  return path.split("/").pop() ?? path;
}

export function CarContractsModal({
  open,
  car,
  canManage,
  onUploadContract,
  onReplaceContract,
  onDownloadContract,
  onRemoveContract,
  onUpdateContractMeta,
  onClose,
}: Props) {
  const t = useT();

  // The contract currently open in the viewer, by id (resolved live so a
  // replace that moves the path is reflected without a stale capture).
  const [viewingId, setViewingId] = useState<string | null>(null);
  // The metadata form: `{ file }` for an upload, `{ record }` for an edit.
  const [form, setForm] = useState<
    { file: File } | { record: CarContract } | null
  >(null);
  const [pendingDelete, setPendingDelete] = useState<CarContract | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useResetOnOpen(open, car?.id, () => {
    setViewingId(null);
    setForm(null);
    setPendingDelete(null);
  });

  if (!open || !car) return null;

  const contracts = [...car.contracts].sort((a, b) =>
    filenameOf(a.path).localeCompare(filenameOf(b.path)),
  );
  const viewing = viewingId
    ? (car.contracts.find((c) => c.id === viewingId) ?? null)
    : null;

  function handlePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setForm({ file });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="car-contracts-title"
      size="max-w-2xl"
      fixedHeight
    >
      <Modal.Header
        icon={<FileText size={14} aria-hidden focusable={false} />}
        title={t("carsSheet.contractsTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        {contracts.length === 0 ? (
          <p className="m-0 py-6 text-center text-sm text-muted">
            {canManage
              ? t("carsSheet.contractsEmpty")
              : t("carsSheet.contractsUnavailable")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {contracts.map((contract) => {
              const label = contract.description || filenameOf(contract.path);
              return (
                <li
                  key={contract.id}
                  className="flex items-start gap-2 py-3"
                  data-contract-id={contract.id}
                >
                  <FileText
                    size={16}
                    className="mt-0.5 shrink-0 text-accent"
                    aria-hidden
                    focusable={false}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => setViewingId(contract.id)}
                      className="cursor-pointer truncate border-0 bg-transparent p-0 text-left text-sm text-fg-bright hover:text-accent"
                    >
                      {label}
                    </button>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-fg">
                        {contractKindLabel(t, contract.kind)}
                      </span>
                      <span className="min-w-0 truncate">
                        {filenameOf(contract.path)}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setForm({ record: contract })}
                      aria-label={t("carsSheet.editContract")}
                      title={t("carsSheet.editContract")}
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
                    >
                      <Pencil size={13} aria-hidden focusable={false} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(contract)}
                      aria-label={t("carsSheet.deleteContract")}
                      title={t("carsSheet.deleteContract")}
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-danger hover:text-danger"
                    >
                      <Trash2 size={13} aria-hidden focusable={false} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Modal.Body>

      {canManage && (
        <Modal.Footer className="justify-start">
          <Button
            variant="primary"
            withIcon
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus size={16} aria-hidden focusable={false} />
            {t("carsSheet.uploadContract")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handlePicked}
            className="hidden"
          />
        </Modal.Footer>
      )}

      {form && (
        <CarContractForm
          mode={form}
          onCancel={() => setForm(null)}
          onUpload={async (file, meta) => {
            await onUploadContract(file, meta);
            setForm(null);
          }}
          onSaveMeta={(record, meta) => {
            onUpdateContractMeta(record.id, {
              kind: meta.kind,
              description: meta.description?.trim() || undefined,
            });
            setForm(null);
          }}
        />
      )}

      {viewing && (
        <AttachmentUploadModal
          open={viewing !== null}
          onClose={() => setViewingId(null)}
          title={t("carsSheet.contractAttachment")}
          currentPath={viewing.path}
          onUpload={(file) => onReplaceContract(viewing, file)}
          onDownload={onDownloadContract}
          onRemove={async (path) => {
            await onRemoveContract(viewing.id, path);
            setViewingId(null);
          }}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("carsSheet.deleteContractTitle")}
        description={
          pendingDelete
            ? t("carsSheet.deleteContractConfirm", {
                name:
                  pendingDelete.description || filenameOf(pendingDelete.path),
              })
            : null
        }
        actions={[
          {
            label: t("carsSheet.deleteContract"),
            tone: "danger",
            onSelect: () => {
              if (pendingDelete)
                void onRemoveContract(pendingDelete.id, pendingDelete.path);
              setPendingDelete(null);
            },
          },
        ]}
        onCancel={() => setPendingDelete(null)}
      />
    </Modal>
  );
}

// Metadata form for uploading a new contract or editing an existing one's
// kind / description. Carries a text input (description) so it stays
// fullscreen on mobile (the keyboard guard) rather than centered.
function CarContractForm({
  mode,
  onCancel,
  onUpload,
  onSaveMeta,
}: {
  mode: { file: File } | { record: CarContract };
  onCancel: () => void;
  onUpload: (file: File, meta: CarContractMeta) => Promise<void>;
  onSaveMeta: (record: CarContract, meta: CarContractMeta) => void;
}) {
  const t = useT();
  const isUpload = "file" in mode;
  const record = isUpload ? null : mode.record;
  const [kind, setKind] = useState<CarContractKind>(record?.kind ?? "purchase");
  const [description, setDescription] = useState(record?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta: CarContractMeta = { kind, description };

  async function handleSubmit() {
    if (busy) return;
    if (isUpload) {
      setBusy(true);
      setError(null);
      try {
        await onUpload(mode.file, meta);
      } catch (err) {
        // Surface the failure instead of leaving the form open with no
        // feedback — the upload commits the bytes + record together, so a
        // thrown error means nothing was saved. Log the cause for the Logs tab.
        log.error(`car contract upload failed name=${mode.file.name}`, err);
        setError(t("attachment.uploadError"));
      } finally {
        setBusy(false);
      }
      return;
    }
    onSaveMeta(record!, meta);
  }

  return (
    <Modal
      open
      onClose={onCancel}
      labelledBy="car-contract-form-title"
      size="max-w-md"
    >
      <Modal.Header
        icon={<FileText size={14} aria-hidden focusable={false} />}
        title={
          isUpload ? t("carsSheet.uploadContract") : t("carsSheet.editContract")
        }
        onClose={onCancel}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          {isUpload && (
            <p className="truncate rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-xs text-muted">
              {mode.file.name}
            </p>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("carsSheet.contractKindLabel")}
            </span>
            {/* Three-segment sliding-pill toggle — same pattern the car
                editor's ownership picker uses. The global reduce-motion rule
                zeroes the transition. */}
            <div
              role="group"
              aria-label={t("carsSheet.contractKindLabel")}
              className="relative flex rounded border border-line bg-surface-2"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-1/3 rounded bg-surface transition-transform"
                style={{
                  transform: `translateX(${CONTRACT_KINDS.indexOf(kind) * 100}%)`,
                }}
              />
              {CONTRACT_KINDS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKind(option)}
                  aria-pressed={kind === option}
                  className={`relative z-10 flex-1 cursor-pointer border-0 bg-transparent px-1 py-1.5 text-xs transition-colors ${
                    kind === option ? "text-accent" : "text-muted hover:text-fg"
                  }`}
                >
                  {contractKindLabel(t, option)}
                </button>
              ))}
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("carsSheet.contractDescriptionLabel")}
            </span>
            <ClearableInput
              value={description}
              onValueChange={setDescription}
              placeholder={t("carsSheet.contractDescriptionPlaceholder")}
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </label>
        </div>
        {error && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={busy}>
          {isUpload ? t("carsSheet.uploadContractAction") : t("common.save")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
