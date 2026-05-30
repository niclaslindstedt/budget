import type { CategoryIcon } from "../data/types";
import { useGridRovingTabindex } from "../hooks";
import { tintFill } from "../utils/tint";
import { CategoryIconGlyph } from "./icons";

type DefaultSlot = {
  // Icon shown in the "default" cell. `null` falls back to a generic
  // recurring-glyph rendered by the parent's `defaultRender` prop.
  icon: CategoryIcon | null;
  // aria-label / title text on the default cell.
  label: string;
  // Whether the default slot is the currently selected option.
  selected: boolean;
  onSelect: () => void;
  // What to render inside the default cell. Caller provides the glyph
  // because GlyphPicker may want a non-`CategoryIcon` fallback (a bare
  // Repeat icon).
  render: () => React.ReactNode;
};

type Props = {
  icons: readonly CategoryIcon[];
  value: CategoryIcon | null;
  onChange: (icon: CategoryIcon) => void;
  // 7 = h-7 w-7 (creator forms); 8 = h-8 w-8 (sheet / account modal).
  size?: 7 | 8;
  // When set, the selected cell uses `border-current` with a tinted
  // background mixed from this color (sheet / account modal flow).
  // Unset, the selected cell uses the default accent treatment used
  // by category / type creators and the glyph picker.
  tintColor?: string;
  // Optional leading cell — used by GlyphPicker to expose a "no custom
  // glyph" option that falls back to a default icon.
  defaultSlot?: DefaultSlot;
};

// 8-column grid of icon buttons. Used by every "pick a glyph" flow.
//
// Keyboard nav: roving tabindex across the whole grid (the default
// slot, when present, counts as the leading cell). Arrow keys walk
// the 2D layout — Left / Right cycle the row, Up / Down jump a row,
// Home / End jump to the corners. The painted columns are fixed to
// 8 via `grid-cols-8`, so the hook's `columns: 8` matches the
// rendered geometry.
export function GlyphGrid({
  icons,
  value,
  onChange,
  size = 7,
  tintColor,
  defaultSlot,
}: Props) {
  const dim = size === 7 ? "h-7 w-7" : "h-8 w-8";
  const iconSize = size === 7 ? 14 : 16;
  const defaultTinted = Boolean(
    defaultSlot && tintColor && defaultSlot.selected,
  );
  // The default slot, when present, is index 0; the named icons start
  // at the next index. The cursor seats on whatever is currently
  // selected.
  const offset = defaultSlot ? 1 : 0;
  const total = offset + icons.length;
  const selectedIdx = defaultSlot?.selected
    ? 0
    : offset + Math.max(0, icons.indexOf(value as CategoryIcon));
  const { isCursorAt, registerItem, onKeyDown } = useGridRovingTabindex({
    itemCount: total,
    columns: 8,
    initialIndex: selectedIdx,
    active: false,
  });
  return (
    <div role="radiogroup" className="grid grid-cols-8 gap-1">
      {defaultSlot && (
        <button
          ref={registerItem(0)}
          type="button"
          role="radio"
          aria-checked={defaultSlot.selected}
          tabIndex={isCursorAt(0) ? 0 : -1}
          onClick={defaultSlot.onSelect}
          onKeyDown={onKeyDown}
          aria-label={defaultSlot.label}
          title={defaultSlot.label}
          className={`flex ${dim} cursor-pointer items-center justify-center rounded border ${
            defaultTinted
              ? "border-current"
              : defaultSlot.selected
                ? "border-accent text-accent"
                : "border-line text-muted hover:border-fg"
          }`}
          style={
            defaultTinted && tintColor
              ? {
                  color: tintColor,
                  backgroundColor: tintFill(tintColor),
                }
              : undefined
          }
        >
          {defaultSlot.render()}
        </button>
      )}
      {icons.map((name, i) => {
        const selected = name === value;
        const tinted = tintColor && selected;
        const cellIdx = offset + i;
        return (
          <button
            key={name}
            ref={registerItem(cellIdx)}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={isCursorAt(cellIdx) ? 0 : -1}
            aria-label={`Glyph ${name}`}
            onClick={() => onChange(name)}
            onKeyDown={onKeyDown}
            className={`flex ${dim} cursor-pointer items-center justify-center rounded border ${
              tinted
                ? "border-current"
                : selected
                  ? "border-accent text-accent"
                  : "border-line text-muted hover:border-fg"
            }`}
            style={
              tinted && tintColor
                ? {
                    color: tintColor,
                    backgroundColor: tintFill(tintColor),
                  }
                : undefined
            }
          >
            <CategoryIconGlyph name={name} size={iconSize} />
          </button>
        );
      })}
    </div>
  );
}
