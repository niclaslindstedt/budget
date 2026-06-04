import { useCallback, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal, Star } from "lucide-react";

import type { Sheet } from "../data/types";
import type { FloatingPlacement } from "../hooks";
import { useT } from "../i18n";
import { FloatingPanel } from "./FloatingPanel";
import type { ModalDispatch } from "./modal-dispatch";

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

// Build the universal "Favorite / Unfavorite sheet" menu item. Every
// sheet type's title menu prepends this so the toggle is always there
// regardless of page. A plain factory (not a hook) so pages can call it
// inline in their `titleMenuItems` array with the `t` + `dispatchModal`
// they already hold, free of rules-of-hooks placement constraints. The
// 3-favorite cap and the "favorites full" toast live in the central
// `toggle-sheet-favorite` handler (AppShell), so this only reflects the
// current sheet's flag — no favorite-count needed here.
export function favoriteMenuItem(
  sheet: Sheet,
  t: ReturnType<typeof useT>,
  dispatchModal: ModalDispatch,
): SheetTitleMenuItem {
  const favorited = sheet.favorite === true;
  return {
    key: "favorite",
    icon: (
      <Star
        size={16}
        aria-hidden
        focusable={false}
        fill={favorited ? "currentColor" : "none"}
      />
    ),
    label: favorited ? t("sheet.unfavorite") : t("sheet.favorite"),
    onClick: () =>
      dispatchModal({ kind: "toggle-sheet-favorite", sheetId: sheet.id }),
  };
}

// Right-anchored: the title menu trigger sits centered under the sheet
// name, so growing the panel leftward keeps it inside the viewport on
// narrow screens instead of spilling off the right edge.
const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 180 },
  anchor: "right",
  coordinateSpace: "document",
};

// Overflow menu that wraps each sheet's title. The whole title — the
// sheet name plus the trailing "…" glyph — is one trigger button, so
// the tap target spans the full heading instead of just the tiny icon
// (the icon alone is hard to hit on mobile). The items live with their
// owning sheet view so each sheet type can decide what belongs in the
// menu. Reuses the FloatingPanel shell so dismissal / portal /
// focus-restore match the other dropdowns in the app.
export function SheetTitleMenu({ sheetName, items }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  // No actions to offer: still render the name so the title never
  // vanishes, just without the menu affordance.
  if (items.length === 0) {
    return (
      <span className="px-2 py-1 text-base font-bold text-fg-bright">
        {sheetName}
      </span>
    );
  }

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
        className="inline-flex max-w-full cursor-pointer items-center justify-center gap-2 rounded px-2 py-1 text-base font-bold text-fg-bright hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
      >
        <span className="min-w-0 truncate">{sheetName}</span>
        <MoreHorizontal
          size={14}
          aria-hidden
          focusable={false}
          className="shrink-0 text-muted opacity-70"
        />
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
