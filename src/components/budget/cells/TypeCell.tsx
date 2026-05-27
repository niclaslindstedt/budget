import type { Category, CellValue, EntryType } from "../../../data/types";
import { useT } from "../../../i18n";
import { displayTypeName } from "../../../i18n/preset-names";
import { CategoryIconGlyph } from "../../icons";
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
  const t = useT();
  return (
    <td className={`${CELL_BASE} p-0`} aria-readonly="true">
      <span className="flex h-full min-h-9 w-full items-center justify-center px-2 py-1 font-mono text-xs md:justify-start">
        {entryType ? (
          <>
            <span
              className="inline-flex items-center justify-center md:hidden"
              style={{ color: entryType.color }}
              aria-hidden
            >
              <CategoryIconGlyph name={entryType.glyph} size={18} />
            </span>
            <span
              className="hidden min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-medium md:inline-flex"
              style={{
                backgroundColor: `color-mix(in srgb, ${entryType.color} 18%, transparent)`,
                borderColor: `color-mix(in srgb, ${entryType.color} 55%, transparent)`,
                color: entryType.color,
              }}
            >
              <CategoryIconGlyph name={entryType.glyph} size={12} />
              <span className="truncate">{displayTypeName(entryType, t)}</span>
            </span>
          </>
        ) : (
          <span className="text-muted">—</span>
        )}
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
