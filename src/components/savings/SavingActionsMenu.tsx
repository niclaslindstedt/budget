import { useCallback, useRef, useState } from "react";
import {
  Download,
  Eye,
  MoreHorizontal,
  Pencil,
  Scale,
  Scissors,
  Trash2,
} from "lucide-react";

import { useT } from "../../i18n";
import type { Saving } from "../../data/types";
import { useActionsCompact } from "../ActionsCompactContext";
import { FloatingPanel } from "../FloatingPanel";
import {
  ACTIONS_MENU_PLACEMENT,
  ACTIONS_MENU_TRIGGER_CLASS,
  menuItemClass,
  type MenuItem,
} from "../form/menu";

type Props = {
  saving: Saving;
  // True when the savings account has imported transactions — gates the
  // View / Cut entries (which have nothing to act on otherwise).
  hasHistory: boolean;
  // True when there are transactions or transfers in range to cut.
  canCut: boolean;
  // Open the dated-balance update modal for this savings account.
  onUpdateBalance: (savingId: string) => void;
  // Import a bank statement into this savings account. The transactions are
  // stored for transfer detection, not surfaced on the Savings page.
  onImportHistory: (savingId: string) => void;
  // Open the read-only history viewer for the imported transactions.
  onViewHistory: (savingId: string) => void;
  // Cut imported transactions / transfers before a chosen cutoff date.
  onCutHistory: (savingId: string) => void;
  // Edit / Delete handlers surfaced as menu items ONLY when the action
  // column has collapsed to the compact (⋯-only) layout — in the wide
  // layout these are the inline pen / trash buttons in the swipe strip.
  onEdit: () => void;
  onDelete: () => void;
  // Fired after picking the menu item so the parent row can dismiss its
  // swipe state in the same frame the dropdown closes.
  onAction: () => void;
};

// The "…" overflow popover in a savings row's swipe strip. Records a new dated
// balance, and — since a savings account stores transactions for transfer
// detection — imports / views / cuts that bank history. Mirrors
// `AccountActionsMenu`.
export function SavingActionsMenu({
  saving,
  hasHistory,
  canCut,
  onUpdateBalance,
  onImportHistory,
  onViewHistory,
  onCutHistory,
  onEdit,
  onDelete,
  onAction,
}: Props) {
  const t = useT();
  const compact = useActionsCompact();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  function pick(handler: () => void) {
    setOpen(false);
    onAction();
    handler();
  }

  const items: MenuItem[] = [
    // In the compact layout the inline pen / trash are hidden, so the menu
    // leads with Edit / Delete to keep both reachable.
    ...(compact
      ? [
          {
            key: "edit",
            icon: <Pencil size={16} aria-hidden focusable={false} />,
            label: t("common.edit"),
            onClick: () => pick(onEdit),
          },
          {
            key: "delete",
            icon: <Trash2 size={16} aria-hidden focusable={false} />,
            label: t("common.delete"),
            onClick: () => pick(onDelete),
          },
        ]
      : []),
    {
      key: "balance",
      icon: <Scale size={16} aria-hidden focusable={false} />,
      label: t("savingsSheet.updateBalance"),
      onClick: () => pick(() => onUpdateBalance(saving.id)),
    },
    {
      key: "import",
      icon: <Download size={16} aria-hidden focusable={false} />,
      label: t("savingsSheet.importHistory"),
      onClick: () => pick(() => onImportHistory(saving.id)),
    },
    {
      key: "view",
      icon: <Eye size={16} aria-hidden focusable={false} />,
      label: t("savingsSheet.viewHistory"),
      disabled: !hasHistory,
      title: hasHistory ? undefined : t("savingsSheet.noHistory"),
      onClick: () => pick(() => onViewHistory(saving.id)),
    },
    {
      key: "cut",
      icon: <Scissors size={16} aria-hidden focusable={false} />,
      label: t("savingsSheet.cutHistory"),
      disabled: !canCut,
      title: canCut ? undefined : t("savingsSheet.nothingToCut"),
      onClick: () => pick(() => onCutHistory(saving.id)),
    },
  ];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={ACTIONS_MENU_TRIGGER_CLASS}
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
        placement={ACTIONS_MENU_PLACEMENT}
        rowId={saving.id}
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
                  // The panel is portalled, but React routes synthetic
                  // events through the component tree — stop the click here
                  // so it can't bubble up to the row's onClick (the row tap
                  // handler the other *Row siblings wire to a view modal).
                  e.stopPropagation();
                  if (it.disabled) return;
                  it.onClick();
                }}
                className={menuItemClass(it.disabled)}
              >
                <span
                  aria-hidden
                  className={it.disabled ? "text-muted" : "text-accent"}
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
