import { Plus, Sparkles } from "lucide-react";

import { useLongPress } from "../../hooks";
import { useT } from "../../i18n";
import { useActiveRowHasActive } from "../useActiveRow";

type Props = {
  onAdd: () => void;
  onComplex: () => void;
};

// Plus button with a long-press / right-click escape hatch that opens
// the complex-entry modal. Tap = add a blank row (the existing path);
// hold (or right-click on desktop) = open the modal for a recurring
// or categorised entry.
export function BudgetAddEntryButton({ onAdd, onComplex }: Props) {
  const t = useT();
  const longPress = useLongPress({ onLongPress: onComplex });
  // Disabled while any row in the same sheet is swiped or otherwise
  // active. The first tap outside that row dismisses it via the
  // ActiveRowProvider — we don't want the same tap to also add a new
  // blank row when it landed on this button by mistake.
  const disabled = useActiveRowHasActive();

  function handleClick() {
    // Pointerup fires before click — if the long-press already triggered,
    // swallow the click so we don't also add a blank row.
    if (longPress.consumeTriggered()) return;
    onAdd();
  }

  return (
    <button
      type="button"
      disabled={disabled}
      className="add-row-button group relative flex w-full cursor-pointer items-center justify-center py-3 text-accent select-none hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      onClick={handleClick}
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerUp}
      onPointerLeave={longPress.onPointerUp}
      onContextMenu={longPress.onContextMenu}
      aria-label={t("addRow.ariaLabel")}
    >
      <Plus size={22} aria-hidden focusable={false} />
      <Sparkles
        size={10}
        aria-hidden
        focusable={false}
        className="absolute right-2 bottom-1.5 text-muted opacity-60 group-hover:text-meta"
      />
    </button>
  );
}
