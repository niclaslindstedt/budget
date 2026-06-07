import { useMemo, useRef, useState } from "react";
import { Layers, Pencil, Trash2 } from "lucide-react";

import { PROPERTY_REPAIR_TYPE_IDS } from "../../data/items/subtypes";
import type { EntryType, Subtype } from "../../data/types";
import { useCrudAdminState, useDesktopAutoFocus } from "../../hooks";
import { useT } from "../../i18n";
import { displayTypeName } from "../../i18n/preset-names";
import { ConfirmDialog } from "../ConfirmDialog";
import { Button, ClearableInput } from "../form";
import { TypeChip } from "../TypePicker";

// Read-only-by-creation list of every `Subtype`, grouped under its parent
// type and split into two buckets: item subtypes (the Items sheet) and the
// Repairs / Renovations subtypes (a property's repairs). New subtypes are
// minted from the item editor / repairs editor, so this section only edits
// (rename) and deletes — there is no add affordance. Only types that
// actually own a subtype appear, so the section stays empty until the user
// has created some.

type Props = {
  subtypes: readonly Subtype[];
  // Every type, preset + user, so a subtype's parent resolves to a chip.
  types: readonly EntryType[];
  onUpdateSubtype: (
    subtypeId: string,
    patch: Partial<Omit<Subtype, "id">>,
  ) => void;
  onDeleteSubtype: (subtypeId: string) => void;
};

type TypeGroup = {
  type: EntryType;
  subtypes: Subtype[];
};

export function SubtypesAdmin({
  subtypes,
  types,
  onUpdateSubtype,
  onDeleteSubtype,
}: Props) {
  const t = useT();

  const typesById = useMemo(() => {
    const m = new Map<string, EntryType>();
    for (const ty of types) m.set(ty.id, ty);
    return m;
  }, [types]);

  // Group subtypes under their parent type, dropping any orphan whose type
  // has gone missing, then split into item vs repairs/renovations buckets.
  // Each bucket is sorted by the (localised) type name, and the subtypes
  // within a group by their own name.
  const { itemGroups, repairGroups } = useMemo(() => {
    const byType = new Map<string, Subtype[]>();
    for (const s of subtypes) {
      if (!typesById.has(s.typeId)) continue;
      const list = byType.get(s.typeId) ?? [];
      list.push(s);
      byType.set(s.typeId, list);
    }
    const item: TypeGroup[] = [];
    const repair: TypeGroup[] = [];
    for (const [typeId, list] of byType) {
      const type = typesById.get(typeId);
      if (!type) continue;
      const group: TypeGroup = {
        type,
        subtypes: [...list].sort((a, b) => a.name.localeCompare(b.name)),
      };
      if (PROPERTY_REPAIR_TYPE_IDS.has(typeId)) repair.push(group);
      else item.push(group);
    }
    const byTypeName = (a: TypeGroup, b: TypeGroup) =>
      displayTypeName(a.type, t).localeCompare(displayTypeName(b.type, t));
    item.sort(byTypeName);
    repair.sort(byTypeName);
    return { itemGroups: item, repairGroups: repair };
  }, [subtypes, typesById, t]);

  const { editingId, setEditingId, pendingDeleteId, setPendingDeleteId } =
    useCrudAdminState(subtypes);
  const pendingDelete =
    pendingDeleteId !== null
      ? (subtypes.find((s) => s.id === pendingDeleteId) ?? null)
      : null;

  const isEmpty = itemGroups.length === 0 && repairGroups.length === 0;

  function renderGroup(group: TypeGroup) {
    return (
      <li
        key={group.type.id}
        className="overflow-hidden rounded border border-line bg-surface-2"
      >
        <div className="flex items-center gap-2 border-b border-line px-2 py-1.5 text-sm">
          <TypeChip type={group.type} compact />
        </div>
        <ul className="flex flex-col divide-y divide-line">
          {group.subtypes.map((s) => {
            if (editingId === s.id) {
              return (
                <li key={s.id} className="px-2 py-2">
                  <SubtypeEditor
                    initial={s}
                    existing={subtypes}
                    onCancel={() => setEditingId(null)}
                    onSubmit={(name) => {
                      onUpdateSubtype(s.id, { name });
                      setEditingId(null);
                    }}
                  />
                </li>
              );
            }
            return (
              <li
                key={s.id}
                className="flex items-center gap-2 px-2 py-1.5 text-sm"
              >
                <Layers
                  size={14}
                  className="shrink-0 text-muted"
                  aria-hidden
                  focusable={false}
                />
                <span className="min-w-0 flex-1 truncate text-fg">
                  {s.name}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingId(s.id)}
                  aria-label={t("settings.categoriesTab.editSubtype")}
                  title={t("common.edit")}
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
                >
                  <Pencil size={13} aria-hidden focusable={false} />
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(s.id)}
                  aria-label={t("settings.categoriesTab.deleteSubtype")}
                  title={t("common.delete")}
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-danger hover:text-danger"
                >
                  <Trash2 size={13} aria-hidden focusable={false} />
                </button>
              </li>
            );
          })}
        </ul>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        {t("settings.categoriesTab.subtypesIntro")}
      </p>
      {isEmpty ? (
        <p className="rounded border border-line bg-surface-2 px-3 py-3 text-center text-xs text-muted">
          {t("settings.categoriesTab.subtypesEmpty")}
        </p>
      ) : (
        <>
          {itemGroups.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-bold tracking-wide text-muted uppercase">
                {t("settings.categoriesTab.subtypesItems")}
              </h4>
              <ul className="flex flex-col gap-2">
                {itemGroups.map(renderGroup)}
              </ul>
            </div>
          )}
          {repairGroups.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-bold tracking-wide text-muted uppercase">
                {t("settings.categoriesTab.subtypesRepairs")}
              </h4>
              <ul className="flex flex-col gap-2">
                {repairGroups.map(renderGroup)}
              </ul>
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("settings.categoriesTab.deleteSubtypeTitle")}
        description={t("settings.categoriesTab.deleteSubtypeHint", {
          name: pendingDelete?.name ?? "",
        })}
        actions={[
          {
            label: t("common.delete"),
            tone: "danger",
            onSelect: () => {
              if (pendingDelete) onDeleteSubtype(pendingDelete.id);
              setPendingDeleteId(null);
            },
          },
        ]}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

// Inline rename editor — subtypes are name-only, so this is a single
// field. Uniqueness is scoped to the parent type (mirroring the subtype
// creator), so the same name can live under two different types.
function SubtypeEditor({
  initial,
  existing,
  onCancel,
  onSubmit,
}: {
  initial: Subtype;
  existing: readonly Subtype[];
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState(initial.name);
  const inputRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(inputRef, true);
  const trimmed = name.trim();
  const duplicate = existing.some(
    (s) =>
      s.id !== initial.id &&
      s.typeId === initial.typeId &&
      s.name.trim().toLowerCase() === trimmed.toLowerCase(),
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
          {t("settings.categoriesTab.name")}
        </span>
        <ClearableInput
          ref={inputRef}
          value={name}
          onValueChange={setName}
          placeholder={t("items.subtypeNamePlaceholder")}
          className="field-input w-full min-w-0 rounded border border-line bg-surface px-2 py-1.5 text-sm text-fg"
        />
        {duplicate && (
          <span className="text-xs text-danger">
            {t("items.subtypeDuplicateName")}
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
