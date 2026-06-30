import { Check } from "lucide-react";

import { useT } from "../../../i18n";
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

// Done cell for an untagged history row that has an induced company /
// type suggestion (see `computeDescriptionMetadataInductions`). Replaces
// the static check with a clickable button whose check sits in a filled
// accent disc that gently pulses — it "pops" more than the plain green
// finished-check so the row reads as "one tap fills this in". Clicking
// persists the induction onto the underlying `HistoryEntry`. The pulse
// rides `[data-suggestion-pop]`, gated by the reduce-motion guard in
// `theme.css` (which zeroes the duration + iteration count).
export function AcceptSuggestionCompletedCell({
  onAccept,
}: {
  onAccept: () => void;
}) {
  const t = useT();
  return (
    <td className={`${CELL_BASE} p-0 text-center`}>
      <button
        type="button"
        onClick={onAccept}
        aria-label={t("budget.acceptSuggestion")}
        title={t("budget.acceptSuggestion")}
        className="flex h-full min-h-9 w-full cursor-pointer items-center justify-center border-0 bg-transparent p-1.5 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <span
          data-suggestion-pop
          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-page-bg shadow-sm"
        >
          <Check size={16} strokeWidth={3} aria-hidden focusable={false} />
        </span>
      </button>
    </td>
  );
}
