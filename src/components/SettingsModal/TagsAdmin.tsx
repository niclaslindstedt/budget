import { useMemo, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { CATEGORY_COLORS } from "../../data/constants/taxonomy";
import type { Tag } from "../../data/types";
import { useCrudAdminState, useDesktopAutoFocus } from "../../hooks";
import { useT } from "../../i18n";
import { ColorPalette } from "../ColorPalette";
import { ConfirmDialog } from "../ConfirmDialog";
import { Button, ClearableInput } from "../form";

// Rename-and-recolour list for `UserData.tags`. Add / edit / delete are
// all the affordances the Tags tab needs — no presets to hide. Mirrors
// `CompaniesAdmin` plus a colour swatch per row and a `ColorPalette` in
// the editor.

type Props = {
  tags: readonly Tag[];
  onCreateTag: (draft: Omit<Tag, "id">) => Tag;
  onUpdateTag: (tagId: string, patch: Partial<Omit<Tag, "id">>) => void;
  onDeleteTag: (tagId: string) => void;
};

export function TagsAdmin({
  tags,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
}: Props) {
  const t = useT();
  const sorted = useMemo(
    () => [...tags].sort((a, b) => a.name.localeCompare(b.name)),
    [tags],
  );

  const {
    creating,
    setCreating,
    editingId,
    setEditingId,
    setPendingDeleteId,
    pendingDelete,
  } = useCrudAdminState(tags);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">{t("settings.tagsTab.intro")}</p>
      {sorted.length === 0 && !creating && (
        <p className="rounded border border-line bg-surface-2 px-3 py-3 text-center text-xs text-muted">
          {t("settings.tagsTab.empty")}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {sorted.map((tag) => {
          if (editingId === tag.id) {
            return (
              <li
                key={tag.id}
                className="rounded border border-line bg-surface-2 p-2"
              >
                <TagEditor
                  initial={tag}
                  existing={tags}
                  submitLabel={t("common.save")}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(draft) => {
                    onUpdateTag(tag.id, draft);
                    setEditingId(null);
                  }}
                />
              </li>
            );
          }
          return (
            <li
              key={tag.id}
              className="flex items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm"
            >
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-fg">
                {tag.name}
              </span>
              <button
                type="button"
                onClick={() => setEditingId(tag.id)}
                aria-label={t("settings.tagsTab.editTag")}
                title={t("common.edit")}
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
              >
                <Pencil size={13} aria-hidden focusable={false} />
              </button>
              <button
                type="button"
                onClick={() => setPendingDeleteId(tag.id)}
                aria-label={t("settings.tagsTab.deleteTag")}
                title={t("common.delete")}
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-danger hover:text-danger"
              >
                <Trash2 size={13} aria-hidden focusable={false} />
              </button>
            </li>
          );
        })}
        {creating && (
          <li className="rounded border border-line bg-surface-2 p-2">
            <TagEditor
              initial={null}
              existing={tags}
              submitLabel={t("common.add")}
              onCancel={() => setCreating(false)}
              onSubmit={(draft) => {
                onCreateTag(draft);
                setCreating(false);
              }}
            />
          </li>
        )}
      </ul>
      {!creating && (
        <Button
          variant="secondary"
          withIcon
          onClick={() => setCreating(true)}
          className="self-start"
        >
          <Plus size={14} aria-hidden focusable={false} />
          {t("settings.tagsTab.addTag")}
        </Button>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("settings.tagsTab.deleteTagTitle")}
        description={t("settings.tagsTab.deleteTagHint", {
          name: pendingDelete?.name ?? "",
        })}
        actions={[
          {
            label: t("common.delete"),
            tone: "danger",
            onSelect: () => {
              if (pendingDelete) onDeleteTag(pendingDelete.id);
              setPendingDeleteId(null);
            },
          },
        ]}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

function TagEditor({
  initial,
  existing,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: Tag | null;
  existing: readonly Tag[];
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (draft: Omit<Tag, "id">) => void;
}) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState<string>(
    initial?.color ?? CATEGORY_COLORS[0],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(inputRef, true);
  const trimmed = name.trim();
  const duplicate = existing.some(
    (tag) =>
      tag.id !== initial?.id &&
      tag.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const canSubmit = trimmed.length > 0 && !duplicate;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit({ name: trimmed, color });
      }}
      className="flex flex-col gap-2"
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">{t("settings.tagsTab.name")}</span>
        <ClearableInput
          ref={inputRef}
          value={name}
          onValueChange={setName}
          placeholder={t("settings.tagsTab.namePlaceholder")}
          className="field-input w-full min-w-0 rounded border border-line bg-surface px-2 py-1.5 text-sm text-fg"
        />
        {duplicate && (
          <span className="text-xs text-danger">
            {t("settings.tagsTab.duplicateName")}
          </span>
        )}
      </label>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">
          {t("settings.tagsTab.color")}
        </span>
        <ColorPalette
          colors={CATEGORY_COLORS}
          value={color}
          onChange={setColor}
          size={5}
          ariaLabelPrefix={t("settings.tagsTab.color")}
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" type="submit" disabled={!canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
