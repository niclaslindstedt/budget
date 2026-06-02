import { useState } from "react";

// The add / edit / delete-confirm UI state every `SettingsModal` admin
// section runs: a `creating` toggle for the inline add form, an
// `editingId` marking the row in edit mode, and a `pendingDeleteId`
// driving the delete-confirmation dialog. `pendingDelete` resolves that
// id back to the live item against `items` (re-finding each render so a
// concurrent rename / removal is reflected in the open confirm dialog),
// collapsing to `null` once the row is gone. Adopt at any preset-admin
// list with the same add / edit / delete-confirm shape.
export type CrudAdminState<T> = {
  creating: boolean;
  setCreating: (value: boolean) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  pendingDeleteId: string | null;
  setPendingDeleteId: (id: string | null) => void;
  pendingDelete: T | null;
};

export function useCrudAdminState<T extends { id: string }>(
  items: readonly T[],
): CrudAdminState<T> {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDelete =
    pendingDeleteId !== null
      ? (items.find((item) => item.id === pendingDeleteId) ?? null)
      : null;
  return {
    creating,
    setCreating,
    editingId,
    setEditingId,
    pendingDeleteId,
    setPendingDeleteId,
    pendingDelete,
  };
}
