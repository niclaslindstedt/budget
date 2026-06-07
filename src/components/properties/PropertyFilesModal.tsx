import { useMemo, useRef, useState } from "react";
import { FileText, FolderClosed, Pencil, Plus, Trash2 } from "lucide-react";

import type { PropertyFileMeta } from "../AppShell/hooks/usePropertyAttachments";
import type {
  FileCategory,
  Property,
  PropertyFile,
  Tag,
} from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import { createLogger } from "../../utils/logger";
import { AttachmentUploadModal } from "../AttachmentUploadModal";
import { ConfirmDialog } from "../ConfirmDialog";
import { Button, ClearableInput } from "../form";
import { Checkbox } from "../form/Checkbox";
import { Modal } from "../Modal";
import { TagsPicker } from "../TagsPicker";
import { FileCategoryPicker } from "./FileCategoryPicker";

const log = createLogger("property-files");

// Per-property files manager, opened by "Upload file" on a property card.
// Lists the arbitrary documents / photos uploaded against the property — each
// with its description, tags, and category — and offers an upload affordance.
// A file is viewable like a receipt (the universal `AttachmentUploadModal`),
// its metadata editable, and it can be deleted. The bytes live in the
// backend's `properties/<name>/files/[<category>/]` store.

type Props = {
  open: boolean;
  property: Property | null;
  fileCategories: readonly FileCategory[];
  tags: readonly Tag[];
  // Whether the active backend can store files. When false the upload
  // affordance is hidden (plain localStorage has no sibling-file notion).
  canManage: boolean;
  onUploadFile: (file: File, meta: PropertyFileMeta) => Promise<PropertyFile>;
  onReplaceFile: (record: PropertyFile, file: File) => Promise<string>;
  onDownloadFile: (path: string) => Promise<Blob>;
  onRemoveFile: (fileId: string, path: string) => Promise<void>;
  onUpdateFileMeta: (
    fileId: string,
    patch: Partial<Omit<PropertyFile, "id">>,
  ) => void;
  onCreateFileCategory: (name: string) => FileCategory;
  onCreateTag: (draft: Omit<Tag, "id">) => Tag;
  onClose: () => void;
};

// The filename derived from a stored path, used as the fallback label when a
// file carries no description.
function filenameOf(path: string): string {
  return path.split("/").pop() ?? path;
}

export function PropertyFilesModal({
  open,
  property,
  fileCategories,
  tags,
  canManage,
  onUploadFile,
  onReplaceFile,
  onDownloadFile,
  onRemoveFile,
  onUpdateFileMeta,
  onCreateFileCategory,
  onCreateTag,
  onClose,
}: Props) {
  const t = useT();

  // The file currently open in the viewer, by id (resolved live so a replace
  // that moves the path is reflected without a stale capture).
  const [viewingId, setViewingId] = useState<string | null>(null);
  // The metadata form: `{ file }` for an upload, `{ record }` for an edit.
  const [form, setForm] = useState<
    { file: File } | { record: PropertyFile } | null
  >(null);
  const [pendingDelete, setPendingDelete] = useState<PropertyFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useResetOnOpen(open, property?.id, () => {
    setViewingId(null);
    setForm(null);
    setPendingDelete(null);
  });

  const categoryById = useMemo(() => {
    const m = new Map<string, FileCategory>();
    for (const c of fileCategories) m.set(c.id, c);
    return m;
  }, [fileCategories]);

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const tag of tags) m.set(tag.id, tag);
    return m;
  }, [tags]);

  if (!open || !property) return null;

  const files = [...property.files].sort((a, b) =>
    filenameOf(a.path).localeCompare(filenameOf(b.path)),
  );
  const viewing = viewingId
    ? (property.files.find((f) => f.id === viewingId) ?? null)
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
      labelledBy="property-files-title"
      size="max-w-2xl"
      fixedHeight
    >
      <Modal.Header
        icon={<FileText size={14} aria-hidden focusable={false} />}
        title={t("properties.filesTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        {files.length === 0 ? (
          <p className="m-0 py-6 text-center text-sm text-muted">
            {canManage
              ? t("properties.filesEmpty")
              : t("properties.filesUnavailable")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {files.map((file) => {
              const category = file.categoryId
                ? categoryById.get(file.categoryId)
                : undefined;
              const fileTags = (file.tagIds ?? [])
                .map((id) => tagsById.get(id))
                .filter((tag): tag is Tag => tag !== undefined);
              const label = file.description || filenameOf(file.path);
              return (
                <li
                  key={file.id}
                  className="flex items-start gap-2 py-3"
                  data-file-id={file.id}
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
                      onClick={() => setViewingId(file.id)}
                      className="cursor-pointer truncate border-0 bg-transparent p-0 text-left text-sm text-fg-bright hover:text-accent"
                    >
                      {label}
                    </button>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      {category && (
                        <span className="inline-flex items-center gap-1">
                          <FolderClosed
                            size={12}
                            aria-hidden
                            focusable={false}
                          />
                          <span className="min-w-0 truncate text-fg">
                            {category.name}
                          </span>
                        </span>
                      )}
                      <span className="min-w-0 truncate">
                        {filenameOf(file.path)}
                      </span>
                      {file.private && (
                        <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-fg">
                          {t("properties.filePrivateBadge")}
                        </span>
                      )}
                    </span>
                    {fileTags.length > 0 && (
                      <span className="flex flex-wrap items-center gap-1">
                        {fileTags.map((tag) => (
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
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setForm({ record: file })}
                      aria-label={t("properties.editFile")}
                      title={t("properties.editFile")}
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
                    >
                      <Pencil size={13} aria-hidden focusable={false} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(file)}
                      aria-label={t("properties.deleteFile")}
                      title={t("properties.deleteFile")}
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
            {t("properties.uploadFile")}
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
        <PropertyFileForm
          mode={form}
          fileCategories={fileCategories}
          tags={tags}
          onCreateFileCategory={onCreateFileCategory}
          onCreateTag={onCreateTag}
          onCancel={() => setForm(null)}
          onUpload={async (file, meta) => {
            await onUploadFile(file, meta);
            setForm(null);
          }}
          onSaveMeta={(record, meta) => {
            onUpdateFileMeta(record.id, {
              description: meta.description?.trim() || undefined,
              tagIds:
                meta.tagIds && meta.tagIds.length > 0 ? meta.tagIds : undefined,
              categoryId: meta.categoryId ?? undefined,
              // `undefined` clears the key so a non-private file stays
              // byte-identical to a reloaded one.
              private: meta.private ? true : undefined,
            });
            setForm(null);
          }}
        />
      )}

      {viewing && (
        <AttachmentUploadModal
          open={viewing !== null}
          onClose={() => setViewingId(null)}
          title={t("properties.fileAttachment")}
          currentPath={viewing.path}
          onUpload={(file) => onReplaceFile(viewing, file)}
          onDownload={onDownloadFile}
          onRemove={async (path) => {
            await onRemoveFile(viewing.id, path);
            setViewingId(null);
          }}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("properties.deleteFileTitle")}
        description={
          pendingDelete
            ? t("properties.deleteFileConfirm", {
                name:
                  pendingDelete.description || filenameOf(pendingDelete.path),
              })
            : null
        }
        actions={[
          {
            label: t("properties.deleteFile"),
            tone: "danger",
            onSelect: () => {
              if (pendingDelete)
                void onRemoveFile(pendingDelete.id, pendingDelete.path);
              setPendingDelete(null);
            },
          },
        ]}
        onCancel={() => setPendingDelete(null)}
      />
    </Modal>
  );
}

// Metadata form for uploading a new file or editing an existing one's
// description / tags / category. Carries a text input (description) so it
// stays fullscreen on mobile (the keyboard guard) rather than centered.
function PropertyFileForm({
  mode,
  fileCategories,
  tags,
  onCreateFileCategory,
  onCreateTag,
  onCancel,
  onUpload,
  onSaveMeta,
}: {
  mode: { file: File } | { record: PropertyFile };
  fileCategories: readonly FileCategory[];
  tags: readonly Tag[];
  onCreateFileCategory: (name: string) => FileCategory;
  onCreateTag: (draft: Omit<Tag, "id">) => Tag;
  onCancel: () => void;
  onUpload: (file: File, meta: PropertyFileMeta) => Promise<void>;
  onSaveMeta: (record: PropertyFile, meta: PropertyFileMeta) => void;
}) {
  const t = useT();
  const isUpload = "file" in mode;
  const record = isUpload ? null : mode.record;
  const [description, setDescription] = useState(record?.description ?? "");
  const [tagIds, setTagIds] = useState<string[]>(record?.tagIds ?? []);
  const [categoryId, setCategoryId] = useState<string | null>(
    record?.categoryId ?? null,
  );
  const [isPrivate, setIsPrivate] = useState(record?.private ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta: PropertyFileMeta = {
    description,
    tagIds,
    categoryId: categoryId ?? undefined,
    private: isPrivate,
  };

  async function handleSubmit() {
    if (busy) return;
    if (isUpload) {
      setBusy(true);
      setError(null);
      try {
        await onUpload(mode.file, meta);
      } catch (err) {
        // Surface the failure instead of leaving the form sitting open with
        // no feedback — the upload commits the bytes + the record together,
        // so a thrown error means nothing was saved. Log the cause so it
        // reaches the in-app Logs tab.
        log.error(`property file upload failed name=${mode.file.name}`, err);
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
      labelledBy="property-file-form-title"
      size="max-w-md"
    >
      <Modal.Header
        icon={<FileText size={14} aria-hidden focusable={false} />}
        title={isUpload ? t("properties.uploadFile") : t("properties.editFile")}
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
              {t("properties.fileDescription")}
            </span>
            <ClearableInput
              value={description}
              onValueChange={setDescription}
              placeholder={t("properties.fileDescriptionPlaceholder")}
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.fileCategory")}
            </span>
            <FileCategoryPicker
              categories={fileCategories}
              selectedId={categoryId}
              onSelect={setCategoryId}
              onCreate={onCreateFileCategory}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.fileTags")}
            </span>
            <TagsPicker
              tags={tags}
              selectedIds={tagIds}
              onChange={setTagIds}
              onCreate={onCreateTag}
            />
          </label>
          <Checkbox
            checked={isPrivate}
            onChange={setIsPrivate}
            label={t("properties.filePrivate")}
            description={t("properties.filePrivateHint")}
          />
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
          {isUpload ? t("properties.uploadFileAction") : t("common.save")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
