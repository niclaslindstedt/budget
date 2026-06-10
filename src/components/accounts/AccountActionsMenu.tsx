import { useCallback, useRef, useState } from "react";
import {
  Download,
  MoreHorizontal,
  Pencil,
  Scale,
  Scissors,
  Trash2,
} from "lucide-react";

import type { FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import { useActionsCompact } from "../ActionsCompactContext";
import { FloatingPanel } from "../FloatingPanel";

type Props = {
  accountId: string;
  accountName: string;
  canCut: boolean;
  canUpdateBalance: boolean;
  onUpdateBalance: (accountId: string) => void;
  onImportHistory: (accountId: string) => void;
  onCutHistory: (accountId: string) => void;
  // Edit / Delete handlers surfaced as menu items ONLY when the action
  // column has collapsed to the compact (⋯-only) layout — in the wide
  // layout these are the inline pen / trash buttons in the swipe strip.
  onEdit: () => void;
  onDelete: () => void;
  // Fired after picking any menu item so the parent can dismiss its
  // swipe state in the same frame the dropdown closes — mirrors the
  // contract `BudgetEntryActionsMenu` exposes for the budget sheet.
  onAction: () => void;
};

const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 200 },
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

// Overflow menu for the Accounts table. Mirrors `BudgetEntryActionsMenu` from
// the budget sheet — same trigger glyph, same dropdown shell, same
// `onAction` hook so the parent can collapse the swipe in the same
// frame. Houses the import / cut actions that don't earn a dedicated
// button in the swipe strip.
export function AccountActionsMenu({
  accountId,
  accountName,
  canCut,
  canUpdateBalance,
  onUpdateBalance,
  onImportHistory,
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
      label: t("accountsSheet.updateBalanceTitle"),
      disabled: !canUpdateBalance,
      title: canUpdateBalance ? undefined : t("account.addBudgetSheetHint"),
      onClick: () => pick(() => onUpdateBalance(accountId)),
    },
    {
      key: "import",
      icon: <Download size={16} aria-hidden focusable={false} />,
      label: t("accountsSheet.importHistoryTitle"),
      onClick: () => pick(() => onImportHistory(accountId)),
    },
    {
      key: "cut",
      icon: <Scissors size={16} aria-hidden focusable={false} />,
      label: t("accountsSheet.cutHistoryTitle"),
      disabled: !canCut,
      title: canCut ? undefined : t("accountsSheet.nothingToCut"),
      onClick: () => pick(() => onCutHistory(accountId)),
    },
  ];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="action-btn action-btn-more inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
        aria-label={t("accountsSheet.moreActionsAria", { name: accountName })}
        title={t("accountsSheet.moreActions")}
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
        rowId={accountId}
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
                  // events through the component tree — without this the
                  // click bubbles up to the row's onClick and also fires
                  // its tap action (opening the history viewer behind the
                  // modal this item just opened).
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
