import { useMemo, useRef, useState } from "react";
import { FolderClosed, Pencil, Plus, Trash2 } from "lucide-react";

import type { FileCategory } from "../../data/types";
import { useCrudAdminState } from "../../hooks";
import { useT } from "../../i18n";
import { ConfirmDialog } from "../ConfirmDialog";
import { Button, ClearableInput } from "../form";

// CRUD list for `FileCategory` — the subfolders a property's uploaded files
// are filed under. Unlike `SubtypesAdmin`, categories are created here (not
// minted from another flow), so this carries a create row at the top plus
// per-row rename / delete. Deleting a category clears `categoryId` on every
// file that referenced it (the file falls back to the `files/` root); the
// reducer handles that cascade.

type Props = {
  categories: readonly FileCategory[];
  onCreate: (name: string) => FileCategory;
  onUpdate: (
    categoryId: string,
    patch: Partial<Omit<FileCategory, "id">>,
  ) => void;
  onDelete: (categoryId: string) => void;
};

export function FileCategoriesAdmin({
  categories,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const t = useT();
  const [draft, setDraft] = useState("");

  const sorted = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const { editingId, setEditingId, pendingDeleteId, setPendingDeleteId } =
    useCrudAdminState(categories);
  const pendingDelete =
    pendingDeleteId !== null
      ? (categories.find((c) => c.id === pendingDeleteId) ?? null)
      : null;

  const trimmedDraft = draft.trim();
  const draftDuplicate = categories.some(
    (c) => c.name.trim().toLowerCase() === trimmedDraft.toLowerCase(),
  );
  const canAdd = trimmedDraft.length > 0 && !draftDuplicate;

  function handleAdd() {
    if (!canAdd) return;
    onCreate(trimmedDraft);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        {t("settings.properties.fileCategoriesIntro")}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAdd();
        }}
        className="flex items-start gap-2"
      >
        <div className="flex flex-1 flex-col gap-1">
          <ClearableInput
            value={draft}
            onValueChange={setDraft}
            placeholder={t("settings.properties.fileCategoryNamePlaceholder")}
            aria-label={t("settings.properties.fileCategoryNameLabel")}
            className="field-input w-full min-w-0 rounded border border-line bg-surface px-2 py-1.5 text-sm text-fg"
          />
          {draftDuplicate && (
            <span className="text-xs text-danger">
              {t("settings.properties.fileCategoryDuplicate")}
            </span>
          )}
        </div>
        <Button variant="primary" type="submit" withIcon disabled={!canAdd}>
          <Plus size={16} aria-hidden focusable={false} />
          {t("settings.properties.addFileCategory")}
        </Button>
      </form>

      {sorted.length === 0 ? (
        <p className="rounded border border-line bg-surface-2 px-3 py-3 text-center text-xs text-muted">
          {t("settings.properties.fileCategoriesEmpty")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded border border-line bg-surface-2">
          {sorted.map((c) =>
            editingId === c.id ? (
              <li key={c.id} className="px-2 py-2">
                <FileCategoryEditor
                  initial={c}
                  existing={categories}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(name) => {
                    onUpdate(c.id, { name });
                    setEditingId(null);
                  }}
                />
              </li>
            ) : (
              <li
                key={c.id}
                className="flex items-center gap-2 px-2 py-1.5 text-sm"
              >
                <FolderClosed
                  size={14}
                  className="shrink-0 text-muted"
                  aria-hidden
                  focusable={false}
                />
                <span className="min-w-0 flex-1 truncate text-fg">
                  {c.name}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingId(c.id)}
                  aria-label={t("settings.properties.editFileCategory")}
                  title={t("common.edit")}
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
                >
                  <Pencil size={13} aria-hidden focusable={false} />
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(c.id)}
                  aria-label={t("settings.properties.deleteFileCategory")}
                  title={t("common.delete")}
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-danger hover:text-danger"
                >
                  <Trash2 size={13} aria-hidden focusable={false} />
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("settings.properties.deleteFileCategoryTitle")}
        description={t("settings.properties.deleteFileCategoryHint", {
          name: pendingDelete?.name ?? "",
        })}
        actions={[
          {
            label: t("common.delete"),
            tone: "danger",
            onSelect: () => {
              if (pendingDelete) onDelete(pendingDelete.id);
              setPendingDeleteId(null);
            },
          },
        ]}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

// Inline rename editor — categories are name-only, with case-insensitive
// uniqueness across the whole set.
function FileCategoryEditor({
  initial,
  existing,
  onCancel,
  onSubmit,
}: {
  initial: FileCategory;
  existing: readonly FileCategory[];
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState(initial.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = name.trim();
  const duplicate = existing.some(
    (c) =>
      c.id !== initial.id &&
      c.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const canSubmit = trimmed.length > 0 && !duplicate;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit(trimmed);
      }}
      className="flex flex-col gap-2"
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">
          {t("settings.properties.fileCategoryNameLabel")}
        </span>
        <ClearableInput
          ref={inputRef}
          value={name}
          onValueChange={setName}
          placeholder={t("settings.properties.fileCategoryNamePlaceholder")}
          className="field-input w-full min-w-0 rounded border border-line bg-surface px-2 py-1.5 text-sm text-fg"
        />
        {duplicate && (
          <span className="text-xs text-danger">
            {t("settings.properties.fileCategoryDuplicate")}
          </span>
        )}
      </label>
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" type="submit" disabled={!canSubmit}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
