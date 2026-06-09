import { useCallback, useRef, useState } from "react";
import { MoreHorizontal, Scale } from "lucide-react";

import type { FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import type { Saving } from "../../data/types";
import { FloatingPanel } from "../FloatingPanel";

type Props = {
  saving: Saving;
  // Open the dated-balance update modal for this savings account.
  onUpdateBalance: (savingId: string) => void;
  // Fired after picking the menu item so the parent row can dismiss its
  // swipe state in the same frame the dropdown closes.
  onAction: () => void;
};

const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 224 },
  anchor: "right",
  coordinateSpace: "document",
};

// The "…" overflow popover in a savings row's swipe strip — its single entry
// records a new dated balance. Mirrors `ItemEntryActionsMenu`.
export function SavingActionsMenu({
  saving,
  onUpdateBalance,
  onAction,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="action-btn action-btn-more inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
        aria-label={t("cell.moreActions")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal size={16} aria-hidden focusable={false} />
      </button>
      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={triggerRef}
        placement={PLACEMENT}
        rowId={saving.id}
        className="overflow-hidden"
      >
        <ul role="menu" className="py-1">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onAction();
                onUpdateBalance(saving.id);
              }}
              className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left font-mono text-sm text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <span aria-hidden className="text-accent">
                <Scale size={16} aria-hidden focusable={false} />
              </span>
              <span className="flex-1 truncate">
                {t("savingsSheet.updateBalance")}
              </span>
            </button>
          </li>
        </ul>
      </FloatingPanel>
    </>
  );
}
