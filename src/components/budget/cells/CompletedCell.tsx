import { Check } from "lucide-react";

import { CELL_BASE } from "./constants";

// Readonly variant of the `completed` cell — used by synthesized
// transfer and history rows. The editable variant in BudgetCell.tsx
// renders a `<button>` instead; this one is just a static glyph so the
// row reads identically without becoming clickable.
//
// `tone` colours the glyph: "muted" (default) for a transfer's plain
// completed mark, "success" for a "finished" history row's green Done
// check (`isRowFinished`).
export function ReadonlyCompletedCell({
  checked,
  tone = "muted",
}: {
  checked: boolean;
  tone?: "muted" | "success";
}) {
  return (
    <td
      className={`${CELL_BASE} p-0 text-center ${
        tone === "success" ? "text-success" : "text-muted"
      }`}
      aria-readonly="true"
    >
      <span className="flex h-full min-h-9 w-full items-center justify-center p-1.5">
        {checked && <Check size={18} aria-hidden focusable={false} />}
      </span>
    </td>
  );
}
