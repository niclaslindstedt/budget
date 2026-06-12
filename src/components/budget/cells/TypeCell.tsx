import type { Category, CellValue, EntryType } from "../../../data/types";
import { TypeBadge } from "../../Pills";
import { TypePicker } from "../../TypePicker";
import { CELL_BASE } from "./constants";

// Readonly variant of the type cell — used for synthesized transfer
// and history rows where the row is sourced from outside the budget's
// `rows[]` and inline editing is suppressed.
export function ReadonlyTypeCell({
  entryType,
}: {
  entryType: EntryType | null;
}) {
  return (
    <td className={`${CELL_BASE} p-0`} aria-readonly="true">
      <span className="flex h-full min-h-9 w-full items-center justify-center px-2 py-1 font-mono text-xs md:justify-start">
        <TypeBadge entryType={entryType} />
      </span>
    </td>
  );
}

// Shared `type` cell wrapper. The `<td>` chrome, `onSelect` /
// `onCreate` plumbing, and `variant="chip"` are identical between the
// history and normal-mode call sites; the only difference is whether
// `amountSign` is forwarded (history mode omits it so the dropdown
// doesn't filter income / expense types out, since history rows aren't
// sign-restricted the way a sheet entry is).
export function TypePickerCell({
  rowId,
  types,
  categories,
  entryType,
  amountSign,
  hintTypeIds,
  rowDate,
  rowDateColor,
  rowDescription,
  onChange,
  onCommit,
  onCreateType,
  onCreateCategory,
}: {
  rowId: string;
  types: readonly EntryType[];
  categories: readonly Category[];
  entryType: EntryType | null;
  amountSign?: "positive" | "negative" | "any";
  hintTypeIds?: readonly string[];
  rowDate?: string;
  rowDateColor?: string;
  rowDescription?: string;
  onChange: (value: CellValue) => void;
  onCommit?: (value: CellValue) => void;
  onCreateType?: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory?: (draft: Omit<Category, "id">) => Category;
}) {
  return (
    <td className={`${CELL_BASE} p-0`}>
      <TypePicker
        rowId={rowId}
        types={types}
        categories={categories}
        selectedId={entryType?.id ?? null}
        amountSign={amountSign}
        hintTypeIds={hintTypeIds}
        rowDate={rowDate}
        rowDateColor={rowDateColor}
        rowDescription={rowDescription}
        onSelect={(id) => {
          onChange(id);
          onCommit?.(id);
        }}
        onCreate={
          onCreateType ??
          ((draft) => ({
            id: `tmp-${Math.random().toString(36).slice(2)}`,
            ...draft,
          }))
        }
        onCreateCategory={onCreateCategory}
        variant="chip"
      />
    </td>
  );
}
