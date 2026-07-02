import { useRovingTabindex } from "../hooks";

type Props = {
  colors: readonly string[];
  value: string;
  onChange: (color: string) => void;
  // Diameter of each swatch. 5 (h-5 w-5) is the creator-form size;
  // 6 (h-6 w-6) is the sheet / account modal size.
  size?: 5 | 6;
  // Prefix for the per-swatch aria-label, e.g. "Sheet color" → "Sheet
  // color #fa7c33". Default "Color".
  ariaLabelPrefix?: string;
  // Draw a faint `--line` border on unselected swatches instead of a
  // transparent one. Needed for palettes that include near-white or
  // near-black colours (the car-paint palette), which would otherwise
  // vanish against the surface. Default false — every hue-only palette
  // keeps the borderless "single coloured dot" look.
  bordered?: boolean;
};

// Flex-wrap row of circular color swatches. The selected swatch gets a
// `border-fg-bright` halo; unselected swatches show no border so the
// circle reads as a single coloured dot. Used by every "pick a color"
// flow — sheet/account/type/category creators.
//
// Keyboard nav: roving tabindex (the selected swatch is the single
// Tab entry point) plus the standard listbox key set — ArrowLeft /
// ArrowRight cycle the row, ArrowUp / ArrowDown skip ahead by one
// (rows here are flex-wrap so a true row jump isn't reliable without
// querying the rendered geometry; the 1D fallback is good enough for
// a palette of 8–16 colours), Home / End jump to first / last. Enter
// or Space invokes the click handler via the native button.
export function ColorPalette({
  colors,
  value,
  onChange,
  size = 6,
  ariaLabelPrefix = "Color",
  bordered = false,
}: Props) {
  const dim = size === 5 ? "h-5 w-5" : "h-6 w-6";
  const initialIdx = Math.max(0, colors.indexOf(value));
  const { isCursorAt, registerItem, onKeyDown } = useRovingTabindex({
    itemCount: colors.length,
    initialIndex: initialIdx,
    active: false,
    orientation: "horizontal",
    focusOnMove: true,
  });
  return (
    <div role="radiogroup" className="flex flex-wrap gap-1.5">
      {colors.map((c, idx) => (
        <button
          key={c}
          ref={registerItem(idx)}
          type="button"
          role="radio"
          aria-checked={c === value}
          aria-label={`${ariaLabelPrefix} ${c}`}
          tabIndex={isCursorAt(idx) ? 0 : -1}
          onClick={() => onChange(c)}
          onKeyDown={onKeyDown}
          className={`${dim} hit-24 cursor-pointer rounded-full border-2 ${
            c === value
              ? "border-fg-bright"
              : bordered
                ? "border-line"
                : "border-transparent"
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}
