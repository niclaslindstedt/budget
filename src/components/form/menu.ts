import type { ReactNode } from "react";

import type { FloatingPlacement } from "../../hooks";

// Shared building blocks for the "…" actions menus the per-page tables
// build on FloatingPanel (BudgetEntryActionsMenu, AccountActionsMenu,
// ItemEntryActionsMenu, SalaryEntryActionsMenu, PropertyActionsMenu,
// RepairEntryActionsMenu, LoanActionsMenu, SavingActionsMenu) plus the
// universal SheetTitleMenu. Each menu re-declared these byte-identical
// pieces; hoisting them keeps every menu's trigger, panel placement, and
// item rows looking the same from one place. Each menu still renders its
// own list — only the type and the styling constants are shared.

// One entry in a `role="menu"` list. The optional flags are honored by
// the renderer that owns the list: the table menus with gateable entries
// (budget / accounts / loans / savings) grey out `disabled` rows and
// surface `title` as the explanation; the property card menu tints
// `danger` rows. Menus without such entries simply never set them.
export type MenuItem = {
  key: string;
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
  onClick: () => void;
};

// Panel placement for a menu opened from a row's swipe strip or a card
// header: grows leftward from the right-aligned trigger so it stays
// inside the viewport, in document space so it scrolls with the table.
export const ACTIONS_MENU_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 224 },
  anchor: "right",
  coordinateSpace: "document",
};

// The "…" trigger button inside a swipe strip's action cell: fills its
// flex slot, white-on-accent in the mobile strip, muted icon-button on
// desktop hover layouts.
export const ACTIONS_MENU_TRIGGER_CLASS =
  "action-btn action-btn-more inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent";

// A plain menu-item row (no disabled state): full-width, hover tint,
// roving-focus outline.
export const MENU_ITEM_CLASS =
  "flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left font-mono text-sm text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

// The disableable variant of the menu-item row: same shell, with the
// cursor / text / hover classes switching on the entry's disabled flag.
export function menuItemClass(disabled: boolean | undefined): string {
  return `flex w-full items-center gap-2 border-0 bg-transparent px-3 py-2 text-left font-mono text-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
    disabled
      ? "cursor-not-allowed text-muted opacity-50"
      : "cursor-pointer text-fg hover:bg-surface"
  }`;
}
