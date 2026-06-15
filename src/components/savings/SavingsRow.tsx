import { memo } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { currentSavingBalance } from "../../data/savings/value";
import type { Saving, Settings } from "../../data/types";
import { useAmountColumns } from "../../hooks";
import { useT } from "../../i18n";
import { formatBalance } from "../../utils/format";
import { tintBorder, tintFill } from "../../utils/tint";
import { CategoryIconGlyph } from "../icons";
import { useRowSwipeAndClaim } from "../useRowSwipeAndClaim";
import { SavingActionsMenu } from "./SavingActionsMenu";

type Props = {
  saving: Saving;
  settings: Settings;
  // Whether this savings account has anything to cut — gates the Cut history
  // entry in the "…" menu.
  canCut: boolean;
  onEditSaving: (savingId: string) => void;
  onDeleteSaving: (savingId: string, name: string) => void;
  onUpdateBalance: (savingId: string) => void;
  onImportHistory: (savingId: string) => void;
  onViewHistory: (savingId: string) => void;
  onCutHistory: (savingId: string) => void;
};

function SavingsRowImpl({
  saving,
  settings,
  canCut,
  onEditSaving,
  onDeleteSaving,
  onUpdateBalance,
  onImportHistory,
  onViewHistory,
  onCutHistory,
}: Props) {
  const t = useT();
  const { cellClass } = useAmountColumns();
  // A swiped row claims the active-row slot (folded into the hook) so a tap
  // elsewhere dismisses it before firing the underlying control.
  const { swiped, setSwiped, touchHandlers } = useRowSwipeAndClaim(saving.id);

  const balance = currentSavingBalance(saving);
  const color = saving.color;

  const rowClass = [
    swiped ? "is-swiped" : "",
    "cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2",
  ]
    .filter(Boolean)
    .join(" ");

  // A tap on the row body opens the read-only history viewer (the same
  // `HistoryModal` the accounts page uses); a tap on the revealed action
  // strip is intercepted by each button's own handler (which stops
  // propagation). When the row is swiped, the same tap retracts the swipe
  // first instead. Mirrors `AccountRow`.
  const onRowClick = () => {
    if (swiped) {
      setSwiped(false);
      return;
    }
    onViewHistory(saving.id);
  };

  return (
    <tr
      className={rowClass}
      data-row-id={saving.id}
      data-swipe-handled
      onClick={onRowClick}
      aria-label={t("savingsSheet.viewHistoryAria", { name: saving.name })}
      {...touchHandlers}
    >
      <td className="w-10 px-2.5 py-2 align-middle">
        <span
          aria-hidden
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-muted"
          style={
            color
              ? {
                  color,
                  backgroundColor: tintFill(color),
                  borderColor: tintBorder(color),
                }
              : undefined
          }
        >
          <CategoryIconGlyph name={saving.glyph ?? "coins"} size={14} />
        </span>
      </td>
      <td className="px-2.5 py-2 align-middle">
        <span className="block font-mono font-bold text-fg-bright">
          {saving.name}
        </span>
        {saving.description !== undefined && saving.description !== "" && (
          <span className="block text-xs text-muted">{saving.description}</span>
        )}
      </td>
      <td className="savings-bank-cell hidden px-2.5 py-2 text-left align-middle font-mono text-xs whitespace-nowrap text-muted md:table-cell">
        {saving.bank ?? ""}
      </td>
      <td
        className={`px-2.5 py-2 align-middle font-mono whitespace-nowrap text-fg tabular-nums ${cellClass}`}
      >
        <span>
          {balance !== undefined ? formatBalance(balance, settings) : "—"}
        </span>
      </td>
      <td className="swipe-action-cell savings-action-cell w-32 p-0 align-middle">
        <div className="flex h-full w-full items-stretch justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSwiped(false);
              onEditSaving(saving.id);
            }}
            aria-label={t("savingsSheet.editAria", { name: saving.name })}
            title={t("savingsSheet.editTitle")}
            className="action-btn action-btn-pen inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
          >
            <Pencil size={16} aria-hidden focusable={false} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSwiped(false);
              onDeleteSaving(saving.id, saving.name);
            }}
            aria-label={t("savingsSheet.deleteAria", { name: saving.name })}
            title={t("savingsSheet.deleteTitle")}
            className="action-btn action-btn-delete inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-danger"
          >
            <Trash2 size={16} aria-hidden focusable={false} />
          </button>
          <SavingActionsMenu
            saving={saving}
            canCut={canCut}
            onUpdateBalance={onUpdateBalance}
            onImportHistory={onImportHistory}
            onCutHistory={onCutHistory}
            onEdit={() => onEditSaving(saving.id)}
            onDelete={() => onDeleteSaving(saving.id, saving.name)}
            onAction={() => setSwiped(false)}
          />
        </div>
      </td>
    </tr>
  );
}

// Memoised so a swipe on one row doesn't re-render every sibling — matches
// AccountRow / ItemRow.
export const SavingsRow = memo(SavingsRowImpl);
