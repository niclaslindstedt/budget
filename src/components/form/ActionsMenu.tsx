import { useCallback, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

import type { FloatingPlacement } from "../../hooks";
import { FloatingPanel } from "../FloatingPanel";
import {
  ACTIONS_MENU_PLACEMENT,
  ACTIONS_MENU_TRIGGER_CLASS,
  MENU_ITEM_DANGER_CLASS,
  menuItemClass,
  type MenuItem,
} from "./menu";

type Props = {
  // The entries to render. An empty array renders nothing at all — no
  // trigger — so a swipe strip whose menu has no applicable entries
  // stays at its inline buttons (items / salary / repairs hide the "…"
  // when the backend can't hold attachments).
  items: MenuItem[];
  // Accessible name for the "…" trigger button.
  ariaLabel: string;
  // Hover tooltip on the trigger (the accounts table sets one).
  triggerTitle?: string;
  // Defaults to the swipe-strip "…" class; menus that live outside a
  // swipe strip (the property card header) pass their own.
  triggerClassName?: string;
  // Defaults to the shared 224px right/document placement.
  placement?: FloatingPlacement;
  // Forwarded to FloatingPanel's active-row claim so a click elsewhere
  // in the same row dismisses the panel without firing the underlying
  // control. Menus outside a claimable row leave it undefined.
  rowId?: string;
  // Stop trigger / item clicks from bubbling to the host row's own tap
  // handler. The panel is portalled, but React routes synthetic events
  // through the component tree — without this a click inside the menu
  // also fires the row's tap action (opening a viewer behind the modal
  // the item just opened, or fighting the swipe state).
  stopPropagation?: boolean;
  // Fired when any item is picked, after the panel closes and before the
  // item's own handler, so the parent can dismiss its swipe state in the
  // same frame the dropdown closes.
  onPick?: () => void;
};

// The "…" actions-menu shell every per-page kebab menu composes: the
// trigger button, the open/close state, the FloatingPanel, and the
// `role="menu"` list rendered from a `MenuItem[]`. Each menu owns only
// its item array — which entries appear, their disabled predicates, and
// their compact-layout participation stay local to the page.
export function ActionsMenu({
  items,
  ariaLabel,
  triggerTitle,
  triggerClassName = ACTIONS_MENU_TRIGGER_CLASS,
  placement = ACTIONS_MENU_PLACEMENT,
  rowId,
  stopPropagation = false,
  onPick,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={ariaLabel}
        title={triggerTitle}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal size={16} aria-hidden focusable={false} />
      </button>
      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={triggerRef}
        placement={placement}
        rowId={rowId}
        className="overflow-hidden"
      >
        <ul role="menu" className="py-1">
          {items.map((it) => (
            <li key={it.key} role="none">
              <button
                type="button"
                role="menuitem"
                aria-disabled={it.disabled || undefined}
                title={it.title}
                onClick={(e) => {
                  if (stopPropagation) e.stopPropagation();
                  if (it.disabled) return;
                  setOpen(false);
                  onPick?.();
                  it.onClick();
                }}
                className={
                  it.danger
                    ? MENU_ITEM_DANGER_CLASS
                    : menuItemClass(it.disabled)
                }
              >
                <span
                  aria-hidden
                  className={
                    it.danger
                      ? "text-danger"
                      : it.disabled
                        ? "text-muted"
                        : "text-accent"
                  }
                >
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
