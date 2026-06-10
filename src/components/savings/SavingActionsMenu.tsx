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

import type { FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import type { Saving } from "../../data/types";
import { useActionsCompact } from "../ActionsCompactContext";
import { FloatingPanel } from "../FloatingPanel";

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

const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 224 },
  anchor: "right",
  coordinateSpace: "document",
};

type MenuItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
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
                className={`flex w-full items-center gap-2 border-0 bg-transparent px-3 py-2 text-left font-mono text-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                  it.disabled
                    ? "cursor-not-allowed text-muted opacity-50"
                    : "cursor-pointer text-fg hover:bg-surface"
                }`}
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
