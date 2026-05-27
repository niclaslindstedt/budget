import { Check } from "lucide-react";

import { CELL_BASE } from "./constants";

// Readonly variant of the `completed` cell — used by synthesized
// transfer and history rows. The editable variant in BudgetCell.tsx
// renders a `<button>` instead; this one is just a static glyph so the
// row reads identically without becoming clickable.
export function ReadonlyCompletedCell({ checked }: { checked: boolean }) {
  return (
    <td
      className={`${CELL_BASE} p-0 text-center text-muted`}
      aria-readonly="true"
    >
      <span className="flex h-full min-h-9 w-full items-center justify-center p-1.5">
        {checked && <Check size={18} aria-hidden focusable={false} />}
      </span>
    </td>
  );
}
