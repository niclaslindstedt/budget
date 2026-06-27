import type { CategoryIcon } from "../data/types";
import { tintBorder, tintFill } from "../utils/tint";
import { HighlightedLabel } from "./HighlightedLabel";
import { CategoryIconGlyph } from "./icons";

type Props = {
  name: string;
  color: string;
  icon: CategoryIcon;
  compact?: boolean;
  // Active type-ahead buffer when this chip is the picker's cursored
  // option — its matched prefix is highlighted. Absent / "" elsewhere.
  query?: string;
};

// Shared pill rendering for entities that carry { name, color, icon } —
// today CategoryChip and TypeChip, both of which keep their own thin
// wrappers so the rest of the codebase can keep importing them by name.
export function EntityChip({
  name,
  color,
  icon,
  compact = false,
  query,
}: Props) {
  return (
    <span
      className={
        compact
          ? "inline-flex min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-medium"
          : "inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-sm font-medium"
      }
      style={{
        backgroundColor: tintFill(color),
        borderColor: tintBorder(color),
        color,
      }}
    >
      <CategoryIconGlyph name={icon} size={compact ? 12 : 13} />
      <span className="truncate">
        <HighlightedLabel text={name} query={query ?? ""} />
      </span>
    </span>
  );
}
