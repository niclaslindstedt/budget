import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Boxes,
  Copy,
  Eye,
  EyeOff,
  HandCoins,
  Info,
  Pencil,
  Repeat,
  RotateCcw,
  Scissors,
  Tags,
  Trash2,
} from "lucide-react";

import { useT } from "../../i18n";
import type { Row } from "../../data/types";
import { useActionsCompact } from "../ActionsCompactContext";
import { ActionsMenu } from "../form/ActionsMenu";
import { type MenuItem } from "../form/menu";
import { useModalDispatch } from "../modal-dispatch";

type Props = {
  row: Row;
  isHistory: boolean;
  isSeries: boolean;
  onToggleRowTransfer?: (row: Row) => void;
  // Flip the `ignored` flag (exclude / include the entry in the
  // spending dashboard). Wired for both user-authored and history rows;
  // omitted on synthesized transfer / correction rows that don't carry
  // spending facts.
  onToggleRowIgnored?: (row: Row) => void;
  // `AccountBudget.ignoredForStats` — flips the ignore action's polarity:
  // on a normal budget `ignored` opts a row OUT, on an ignored budget it
  // opts a row back IN. Drives the label so it always reads truthfully.
  budgetIgnoredForStats?: boolean;
  // Manual fiscal-month override. Null clears the override; ±1 sets it.
  // Hidden on synthesized history / transfer rows — they have no
  // editable persisted form and the shift would have nothing to attach
  // to. The handler is responsible for resolving the shift through the
  // reducer.
  onSetFiscalMonthShift?: (row: Row, shift: -1 | 1 | null) => void;
  // Edit / Delete handlers surfaced as menu items ONLY when the action
  // column has collapsed to the compact (⋯-only) layout — in the wide
  // layout these are the inline pen / trash buttons in the swipe strip,
  // so the menu omits them. `deleteDisabled` greys the Delete entry for
  // history rows (which can't be deleted), with `deleteDisabledTitle` as
  // the explanation.
  onEdit: () => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
  deleteDisabledTitle?: string;
  // Fired after picking any menu item so the parent can dismiss its
  // swipe state in the same frame the dropdown closes.
  onAction: () => void;
};

export function BudgetEntryActionsMenu({
  row,
  isHistory,
  isSeries,
  onToggleRowTransfer,
  onToggleRowIgnored,
  budgetIgnoredForStats = false,
  onSetFiscalMonthShift,
  onEdit,
  onDelete,
  deleteDisabled,
  deleteDisabledTitle,
  onAction,
}: Props) {
  const t = useT();
  const dispatchModal = useModalDispatch();
  const compact = useActionsCompact();

  const items: MenuItem[] = [];

  // In the compact layout the inline info / pen / trash are hidden, so
  // the menu leads with Info / Edit / Delete to keep them reachable.
  if (compact) {
    items.push({
      key: "info",
      icon: <Info size={16} aria-hidden focusable={false} />,
      label: t("cell.infoTitle"),
      onClick: () => dispatchModal({ kind: "open-entry-info", row }),
    });
    items.push({
      key: "edit",
      icon: <Pencil size={16} aria-hidden focusable={false} />,
      label: t("common.edit"),
      onClick: onEdit,
    });
    items.push({
      key: "delete",
      icon: <Trash2 size={16} aria-hidden focusable={false} />,
      label: t("common.delete"),
      disabled: deleteDisabled,
      title: deleteDisabledTitle,
      onClick: onDelete,
    });
  }

  items.push({
    key: "recurring",
    icon: <Repeat size={16} aria-hidden focusable={false} />,
    label: isSeries ? t("cell.editRecurring") : t("cell.makeRecurring"),
    onClick: () => dispatchModal({ kind: "open-edit-entry", row }),
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
      onClick: () => dispatchModal({ kind: "open-match-rule", row }),
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
      onClick: () => onToggleRowTransfer(row),
    });
  }

  if (onToggleRowIgnored) {
    // A row currently counts in statistics iff its `ignored` flag matches
    // the budget's default (see `isActualSpendingRow`). Offer the inverse
    // action: "ignore" when it counts, "count" when it doesn't — so the
    // label reads truthfully whichever polarity the budget is in.
    const countsInStats = !!row.ignored === budgetIgnoredForStats;
    items.push({
      key: "toggleIgnored",
      icon: <Ban size={16} aria-hidden focusable={false} />,
      label: countsInStats
        ? t("cell.ignoreForStats")
        : t("cell.unignoreForStats"),
      title: countsInStats
        ? t("cell.ignoreForStatsTitle")
        : t("cell.unignoreForStats"),
      onClick: () => onToggleRowIgnored(row),
    });
  }

  items.push({
    key: "split",
    icon: <Scissors size={16} aria-hidden focusable={false} />,
    label: t("cell.split"),
    onClick: () => dispatchModal({ kind: "open-split-row", row }),
  });

  // Tie part of this entry's amount to owned items (see `LineItemLink`).
  // Distinct from Split: a split re-slices the entry into separate rows,
  // while line items annotate the existing row with what it bought. Off
  // for synthesized transfer rows and balance corrections, which aren't
  // purchases.
  if (row.kind !== "transfer" && row.kind !== "correction") {
    items.push({
      key: "lineItems",
      icon: <Boxes size={16} aria-hidden focusable={false} />,
      label: t("cell.lineItems"),
      onClick: () => dispatchModal({ kind: "open-line-items", row }),
    });
  }

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
    onClick: () => dispatchModal({ kind: "open-copy-row", row }),
  });

  // Cover this imported transaction with a transfer from another account —
  // reimburses an expense charged to the wrong account. Only imported
  // transactions that aren't already part of a cover transfer are coverable.
  if (row.kind === "historic" && !row.coverRole) {
    const entryId = row.historyEntryId;
    items.push({
      key: "cover",
      icon: <HandCoins size={16} aria-hidden focusable={false} />,
      label: t("coverTransfer.menuCover"),
      onClick: () =>
        dispatchModal({ kind: "open-cover-transfer", entryIds: [entryId] }),
    });
  }

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
        onClick: () => onSetFiscalMonthShift(row, 1),
      });
    }
    if (shift !== -1) {
      items.push({
        key: "pushPrevMonth",
        icon: <ArrowDownLeft size={16} aria-hidden focusable={false} />,
        label: t("cell.pushToPrevMonth"),
        title: t("cell.pushToPrevMonthTitle"),
        onClick: () => onSetFiscalMonthShift(row, -1),
      });
    }
    if (shift === 1 || shift === -1) {
      items.push({
        key: "resetMonthOverride",
        icon: <RotateCcw size={16} aria-hidden focusable={false} />,
        label: t("cell.resetMonthOverride"),
        onClick: () => onSetFiscalMonthShift(row, null),
      });
    }
  }

  return (
    <ActionsMenu
      items={items}
      ariaLabel={t("cell.moreActions")}
      rowId={row.id}
      onPick={onAction}
    />
  );
}
