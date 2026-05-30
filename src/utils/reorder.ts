// Generic array-reorder helpers shared by every drag-to-reorder list
// (sheet columns, a company's manual type priorities, …). Both return a
// new array and never mutate the input; they return the same reference
// when the move is a no-op so React callers can skip a re-render.

// Move the element at `from` to `to`, shifting the rest. Out-of-range
// indices or a no-op move return the original array unchanged.
export function arrayMove<T>(
  items: readonly T[],
  from: number,
  to: number,
): readonly T[] {
  if (from === to) return items;
  if (from < 0 || from >= items.length) return items;
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// Reorder by item id: drop the `fromId` element in front of the `toId`
// element. Mirrors the drag-and-drop contract where both the dragged
// item and the drop target are known by id, not index (see
// `useDragReorder`). A missing id or `fromId === toId` is a no-op.
export function reorderById<T extends { id: string }>(
  items: readonly T[],
  fromId: string,
  toId: string,
): readonly T[] {
  if (fromId === toId) return items;
  const fromIdx = items.findIndex((it) => it.id === fromId);
  const toIdx = items.findIndex((it) => it.id === toId);
  if (fromIdx < 0 || toIdx < 0) return items;
  return arrayMove(items, fromIdx, toIdx);
}
