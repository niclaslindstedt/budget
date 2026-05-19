import type { CategoryIcon } from "../data/types";
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
  return (
    <div className="grid grid-cols-8 gap-1">
      {defaultSlot && (
        <button
          type="button"
          onClick={defaultSlot.onSelect}
          aria-label={defaultSlot.label}
          aria-pressed={defaultSlot.selected}
          title={defaultSlot.label}
          className={`flex ${dim} cursor-pointer items-center justify-center rounded border ${
            defaultTinted
              ? "border-current"
              : defaultSlot.selected
                ? "border-accent text-accent"
                : "border-line text-muted hover:border-fg"
          }`}
          style={
            defaultTinted
              ? {
                  color: tintColor,
                  backgroundColor: `color-mix(in srgb, ${tintColor} 18%, transparent)`,
                }
              : undefined
          }
        >
          {defaultSlot.render()}
        </button>
      )}
      {icons.map((name) => {
        const selected = name === value;
        const tinted = tintColor && selected;
        return (
          <button
            key={name}
            type="button"
            aria-label={`Glyph ${name}`}
            aria-pressed={selected}
            onClick={() => onChange(name)}
            className={`flex ${dim} cursor-pointer items-center justify-center rounded border ${
              tinted
                ? "border-current"
                : selected
                  ? "border-accent text-accent"
                  : "border-line text-muted hover:border-fg"
            }`}
            style={
              tinted
                ? {
                    color: tintColor,
                    backgroundColor: `color-mix(in srgb, ${tintColor} 18%, transparent)`,
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
