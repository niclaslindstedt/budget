import { useCallback, useRef, useState } from "react";
import { FileText, MoreHorizontal, Upload } from "lucide-react";

import type { PropertyRepair } from "../../data/types";
import type { FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import { FloatingPanel } from "../FloatingPanel";

type Props = {
  repair: PropertyRepair;
  // Whether the active backend can hold receipt files (the localStorage
  // backend can't). When false the menu has no entries and renders nothing,
  // so the swipe strip stays at edit + delete.
  canManageReceipt: boolean;
  // Whether the repair already carries at least one receipt — toggles the
  // entry's glyph between "has files" and "upload".
  hasReceipt: boolean;
  // Open the receipts manager for this repair.
  onManageReceipt: (repair: PropertyRepair) => void;
  // Fired after picking any menu item so the parent can dismiss its swipe
  // state in the same frame the dropdown closes.
  onAction: () => void;
};

const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 224 },
  anchor: "right",
  coordinateSpace: "document",
};

type MenuItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
};

// The "…" overflow popover in a repair row's swipe strip — the repairs-view
// analogue of `ItemEntryActionsMenu`. Its single entry manages the repair's
// receipts. Renders nothing when the backend can't hold receipts, so the strip
// stays at edit + delete.
export function RepairEntryActionsMenu({
  repair,
  canManageReceipt,
  hasReceipt,
  onManageReceipt,
  onAction,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  function pick(handler: () => void) {
    setOpen(false);
    onAction();
    handler();
  }

  const items: MenuItem[] = [];

  if (canManageReceipt) {
    items.push({
      key: "receipt",
      icon: hasReceipt ? (
        <FileText size={16} aria-hidden focusable={false} />
      ) : (
        <Upload size={16} aria-hidden focusable={false} />
      ),
      label: t("properties.manageReceipts"),
      onClick: () => pick(() => onManageReceipt(repair)),
    });
  }

  if (items.length === 0) return null;

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
        rowId={repair.id}
        className="overflow-hidden"
      >
        <ul role="menu" className="py-1">
          {items.map((it) => (
            <li key={it.key} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={it.onClick}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left font-mono text-sm text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <span aria-hidden className="text-accent">
                  {it.icon}
                </span>
                <span className="flex-1 truncate">{it.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </FloatingPanel>
    </>
  );
}
