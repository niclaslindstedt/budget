import { Scale } from "lucide-react";

import type { ImportedPoint } from "../../data/import/value-import";
import type { Saving, SavingBalancePoint, Settings } from "../../data/types";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatDate } from "../../utils/format";
import { ValueSnapshotModal } from "../ValueSnapshotModal";

// Record a new balance for a savings account — appends one point to its
// `balanceHistory` (the current balance is the latest point). Lists the
// recorded history so the user can see and delete past snapshots. Mirrors
// the property "Update value" modal.
//
// Savings balances can go negative (overdraft), so the amount is kept as-is
// and the importer runs with `allowNegative`. See `ValueSnapshotModal` for
// the shared shell.

type Props = {
  open: boolean;
  saving: Saving | null;
  settings: Settings;
  onClose: () => void;
  onAddBalance: (savingId: string, point: SavingBalancePoint) => void;
  onImportBalances: (savingId: string, points: ImportedPoint[]) => void;
  onDeleteBalance: (savingId: string, pointId: string) => void;
};

export function UpdateSavingBalanceModal({
  open,
  saving,
  settings,
  onClose,
  onAddBalance,
  onImportBalances,
  onDeleteBalance,
}: Props) {
  const t = useT();
  const lang = useLang();

  if (!open || !saving) return null;

  // Newest snapshot first.
  const history = saving.balanceHistory
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return (
    <ValueSnapshotModal
      open
      resetKey={saving.id}
      icon={<Scale size={14} aria-hidden focusable={false} />}
      title={t("savingsSheet.updateBalanceTitle")}
      labelledBy="update-saving-balance-title"
      subject={saving.name}
      settings={settings}
      valueLabel={t("savingsSheet.balanceLabel")}
      valuePlaceholder={t("savingsSheet.balancePlaceholder")}
      asOfLabel={t("savingsSheet.asOfLabel")}
      historyHeading={t("savingsSheet.balanceHistory")}
      emptyHistoryText={t("savingsSheet.noBalanceHistory")}
      importValueLabel={t("savingsSheet.balanceLabel")}
      allowNegativeImport
      history={history}
      onClose={onClose}
      onAdd={(point) => onAddBalance(saving.id, point)}
      onImport={(points) => onImportBalances(saving.id, points)}
      renderHistoryRow={(point) => (
        <li
          key={point.id}
          className="flex items-center justify-between gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm"
        >
          <span className="text-muted">
            {formatDate(point.date, settings.dateFormat, lang)}
          </span>
          <span className="flex items-center gap-2">
            <span className="tabular-nums text-fg-bright">
              {formatBalance(point.value, settings, {
                neverAbbreviate: true,
              })}
            </span>
            <button
              type="button"
              onClick={() => onDeleteBalance(saving.id, point.id)}
              aria-label={t("savingsSheet.deleteBalanceAria")}
              className="cursor-pointer rounded border-0 bg-transparent px-1 text-xs text-muted hover:text-danger"
            >
              ✕
            </button>
          </span>
        </li>
      )}
    />
  );
}
