import {
  useCallback,
  useId,
  useMemo,
  useState,
  type DragEvent,
  type DragEventHandler,
} from "react";

// Reusable HTML5 drag-to-reorder primitive. Any list whose items have a
// stable string id can become draggable by spreading `getItemProps(id)`
// onto each item's element and applying outline feedback from the
// returned `draggingId` / `overId`. The reorder contract is id-based —
// `onReorder(fromId, toId)` drops the dragged item in front of the drop
// target — so it pairs directly with `reorderById` from
// `src/utils/reorder.ts`.
//
// Each hook instance owns a private drag MIME type (derived from a
// React `useId`, overridable via `mime`) so two reorder lists on the
// same screen can't accept each other's drops. Models the proven
// inline pattern in `BudgetColumnHeader` (accent outline on drag-over,
// grab cursors) without baking in any one component's markup.

export type DragItemProps = {
  draggable: true;
  onDragStart: DragEventHandler;
  onDragOver: DragEventHandler;
  onDragLeave: DragEventHandler;
  onDrop: DragEventHandler;
  onDragEnd: DragEventHandler;
};

export type UseDragReorder = {
  // Spread onto each draggable item element. `id` is the item's stable id.
  getItemProps: (id: string) => DragItemProps;
  // The id currently being dragged, or null. Use to dim the source.
  draggingId: string | null;
  // The id currently hovered as a drop target, or null. Use to outline it.
  overId: string | null;
};

export function useDragReorder({
  onReorder,
  mime,
}: {
  onReorder: (fromId: string, toId: string) => void;
  // Optional explicit MIME type. Defaults to a per-instance unique
  // value so sibling lists don't accept each other's drops.
  mime?: string;
}): UseDragReorder {
  const autoId = useId();
  const dragMime = (mime ?? `application/x-reorder-${autoId}`).toLowerCase();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const getItemProps = useCallback(
    (id: string): DragItemProps => ({
      draggable: true,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.setData(dragMime, id);
        e.dataTransfer.effectAllowed = "move";
        setDraggingId(id);
      },
      onDragOver: (e: DragEvent) => {
        // `types` is always lower-cased by the browser; our mime is too.
        if (!e.dataTransfer.types.includes(dragMime)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (overId !== id) setOverId(id);
      },
      onDragLeave: () => {
        setOverId((cur) => (cur === id ? null : cur));
      },
      onDrop: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(dragMime)) return;
        e.preventDefault();
        const fromId = e.dataTransfer.getData(dragMime);
        setOverId(null);
        setDraggingId(null);
        if (fromId && fromId !== id) onReorder(fromId, id);
      },
      onDragEnd: () => {
        setOverId(null);
        setDraggingId(null);
      },
    }),
    [dragMime, onReorder, overId],
  );

  return useMemo(
    () => ({ getItemProps, draggingId, overId }),
    [getItemProps, draggingId, overId],
  );
}
