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
};

// Flex-wrap row of circular color swatches. The selected swatch gets a
// `border-fg-bright` halo; unselected swatches show no border so the
// circle reads as a single coloured dot. Used by every "pick a color"
// flow — sheet/account/type/category creators.
export function ColorPalette({
  colors,
  value,
  onChange,
  size = 6,
  ariaLabelPrefix = "Color",
}: Props) {
  const dim = size === 5 ? "h-5 w-5" : "h-6 w-6";
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`${ariaLabelPrefix} ${c}`}
          aria-pressed={c === value}
          onClick={() => onChange(c)}
          className={`${dim} hit-24 cursor-pointer rounded-full border-2 ${
            c === value ? "border-fg-bright" : "border-transparent"
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}
