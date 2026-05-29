import { useCallback, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Eye,
  EyeOff,
  MoreHorizontal,
  Repeat,
  RotateCcw,
  Scissors,
  Tags,
} from "lucide-react";

import type { FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import type { Row } from "../../data/types";
import { FloatingPanel } from "../FloatingPanel";
import { useModalDispatch } from "../modal-dispatch";

type Props = {
  row: Row;
  isHistory: boolean;
  isSeries: boolean;
  onToggleRowTransfer?: (row: Row) => void;
  // Manual fiscal-month override. Null clears the override; ±1 sets it.
  // Hidden on synthesized history / transfer rows — they have no
  // editable persisted form and the shift would have nothing to attach
  // to. The handler is responsible for resolving the shift through the
  // reducer.
  onSetFiscalMonthShift?: (row: Row, shift: -1 | 1 | null) => void;
  // Fired after picking any menu item so the parent can dismiss its
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

export function BudgetEntryActionsMenu({
  row,
  isHistory,
  isSeries,
  onToggleRowTransfer,
  onSetFiscalMonthShift,
  onAction,
}: Props) {
  const t = useT();
  const dispatchModal = useModalDispatch();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  function pick(handler: () => void) {
    setOpen(false);
    onAction();
    handler();
  }

  const items: MenuItem[] = [];

  items.push({
    key: "recurring",
    icon: <Repeat size={16} aria-hidden focusable={false} />,
    label: isSeries ? t("cell.editRecurring") : t("cell.makeRecurring"),
    onClick: () => pick(() => dispatchModal({ kind: "open-edit-entry", row })),
  });

  // Available on every editable row, not just history. For a history
  // entry it opens the modal seeded with the raw bank text; for a
  // user-authored budget row it opens it with a date-stripped pattern
  // derived from the row's description. Either way the saved rule
  // applies to past history entries, future imports, and any new
  // manually-typed entry the user creates from here on. Hide it on
  // synthesized transfer rows and balance-correction rows, which
  // have no editable description for the rule to key off.
  if (row.kind !== "transfer" && row.kind !== "correction") {
    items.push({
      key: "labelByPattern",
      icon: <Tags size={16} aria-hidden focusable={false} />,
      label: t("cell.labelSimilar"),
      title: t("cell.labelSimilarTitle"),
      onClick: () =>
        pick(() => dispatchModal({ kind: "open-match-rule", row })),
    });
  }

  if (onToggleRowTransfer) {
    items.push({
      key: "toggleTransfer",
      icon: row.isTransfer ? (
        <EyeOff size={16} aria-hidden focusable={false} />
      ) : (
        <Eye size={16} aria-hidden focusable={false} />
      ),
      label: row.isTransfer
        ? t("cell.unmarkAsTransfer")
        : t("cell.markAsTransfer"),
      title: row.isTransfer
        ? t("cell.unmarkAsTransfer")
        : t("cell.markAsTransferTitle"),
      onClick: () => pick(() => onToggleRowTransfer(row)),
    });
  }

  items.push({
    key: "split",
    icon: <Scissors size={16} aria-hidden focusable={false} />,
    label: t("cell.split"),
    onClick: () => pick(() => dispatchModal({ kind: "open-split-row", row })),
  });

  // Copy stamps fresh manual rows into other months. Available on
  // every row — for synthesized history / transfer rows the new rows
  // are minted from the row's currently-rendered cells, so the user
  // can lift a bank entry into a future budgeting month. Move is
  // handled by editing the date cell directly, and stays off for
  // history rows (their date is bank-driven).
  items.push({
    key: "copy",
    icon: <Copy size={16} aria-hidden focusable={false} />,
    label: t("cell.copy"),
    onClick: () => pick(() => dispatchModal({ kind: "open-copy-row", row })),
  });

  // Manual fiscal-month override. Hidden on synthesized rows (history /
  // transfer) since they have no editable persisted form; the parent
  // opts in by passing `onSetFiscalMonthShift`. The current state of
  // `row.fiscalMonthShift` decides which of the three entries appear so
  // the menu stays compact.
  if (onSetFiscalMonthShift && !isHistory && row.kind !== "transfer") {
    const shift = row.fiscalMonthShift;
    if (shift !== 1) {
      items.push({
        key: "pushNextMonth",
        icon: <ArrowUpRight size={16} aria-hidden focusable={false} />,
        label: t("cell.pushToNextMonth"),
        title: t("cell.pushToNextMonthTitle"),
        onClick: () => pick(() => onSetFiscalMonthShift(row, 1)),
      });
    }
    if (shift !== -1) {
      items.push({
        key: "pushPrevMonth",
        icon: <ArrowDownLeft size={16} aria-hidden focusable={false} />,
        label: t("cell.pushToPrevMonth"),
        title: t("cell.pushToPrevMonthTitle"),
        onClick: () => pick(() => onSetFiscalMonthShift(row, -1)),
      });
    }
    if (shift === 1 || shift === -1) {
      items.push({
        key: "resetMonthOverride",
        icon: <RotateCcw size={16} aria-hidden focusable={false} />,
        label: t("cell.resetMonthOverride"),
        onClick: () => pick(() => onSetFiscalMonthShift(row, null)),
      });
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="action-btn action-btn-more inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
        aria-label={t("cell.moreActions")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={16} aria-hidden focusable={false} />
      </button>
      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={triggerRef}
        placement={PLACEMENT}
        rowId={row.id}
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
                onClick={() => {
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
