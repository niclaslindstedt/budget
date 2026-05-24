import { useCallback, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

import type { FloatingPlacement } from "../hooks";
import { useT } from "../i18n";
import { FloatingPanel } from "./FloatingPanel";

// Each sheet view owns its own action set, so the menu is dumb chrome:
// it renders whatever items the caller pushes in. Keeps the surface
// flexible as new sheet types (loan, savings, …) land with their own
// sheet-specific actions instead of forcing the menu to grow optional
// props for every variant.
export type SheetTitleMenuItem = {
  key: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
};

type Props = {
  sheetName: string;
  items: SheetTitleMenuItem[];
};

const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 180 },
  anchor: "left",
  coordinateSpace: "document",
};

// Overflow menu beside each sheet's title. Just the trigger + dropdown
// shell — the items live with their owning sheet view so each sheet
// type can decide what belongs in the menu. Reuses the FloatingPanel
// shell so dismissal / portal / focus-restore match the other
// dropdowns in the app.
export function SheetTitleMenu({ sheetName, items }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("sheet.moreActionsAria", { name: sheetName })}
        title={t("sheet.moreActions")}
        className="inline-flex cursor-pointer items-center justify-center rounded p-1 text-muted opacity-70 hover:bg-surface-2 hover:text-fg-bright hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
      >
        <MoreHorizontal size={14} aria-hidden focusable={false} />
      </button>
      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={triggerRef}
        placement={PLACEMENT}
        className="overflow-hidden"
      >
        <ul role="menu" className="py-1">
          {items.map((it) => (
            <li key={it.key} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
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
