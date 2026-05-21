import type { CategoryIcon } from "../data/types";
import { CategoryIconGlyph } from "./icons";

type Props = {
  name: string;
  color: string;
  icon: CategoryIcon;
  compact?: boolean;
};

// Shared pill rendering for entities that carry { name, color, icon } —
// today CategoryChip and TypeChip, both of which keep their own thin
// wrappers so the rest of the codebase can keep importing them by name.
export function EntityChip({ name, color, icon, compact = false }: Props) {
  return (
    <span
      className={
        compact
          ? "inline-flex min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-medium"
          : "inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-sm font-medium"
      }
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
        color,
      }}
    >
      <CategoryIconGlyph name={icon} size={compact ? 12 : 13} />
      <span className="truncate">{name}</span>
    </span>
  );
}
