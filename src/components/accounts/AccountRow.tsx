import { memo } from "react";
import { Pencil, Trash2, Wallet } from "lucide-react";

import { useAmountColumns } from "../../hooks";
import { useLang, useT } from "../../i18n";
import type { Account, Settings } from "../../data/types";
import {
  formatBalance,
  formatCount,
  formatMonthRange,
} from "../../utils/format";
import { tintBorder, tintFill } from "../../utils/tint";
import { useRowSwipeAndClaim } from "../useRowSwipeAndClaim";
import { CategoryIconGlyph } from "../icons";
import { AccountActionsMenu } from "./AccountActionsMenu";

type Props = {
  account: Account;
  balance: number;
  accountSettings: Settings;
  historyCount: number;
  // Earliest → latest date across this account's imported transactions, or
  // null when none have been imported. Rendered as a compact month-year
  // span in the "Period" column.
  historyRange: { start: string; end: string } | null;
  canCut: boolean;
  canUpdateBalance: boolean;
  onEditAccount: (accountId: string) => void;
  onDeleteAccount: (accountId: string, name: string) => void;
  onUpdateBalance: (accountId: string) => void;
  onImportHistory: (accountId: string) => void;
  onViewHistory: (accountId: string) => void;
  onCutHistory: (accountId: string) => void;
};

function AccountRowImpl({
  account,
  balance,
  accountSettings,
  historyCount,
  historyRange,
  canCut,
  canUpdateBalance,
  onEditAccount,
  onDeleteAccount,
  onUpdateBalance,
  onImportHistory,
  onViewHistory,
  onCutHistory,
}: Props) {
  const t = useT();
  const lang = useLang();
  const { cellClass } = useAmountColumns();
  // Hook the row into the ActiveRowProvider (folded into the hook) so a
  // tap elsewhere in the accounts table only dismisses the swipe — the
  // underlying control still gets a follow-up tap to fire properly.
  const { swiped, setSwiped, touchHandlers } = useRowSwipeAndClaim(account.id);

  const rowClass = [
    swiped ? "is-swiped" : "",
    "cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2",
  ]
    .filter(Boolean)
    .join(" ");

  // A tap on the row body opens the read-only history viewer; a tap on
  // the revealed action strip is intercepted by each button's own
  // handler (which stops propagation), so only "empty" row taps make
  // it here. When the row is swiped, the same tap retracts the swipe
  // instead — matches the mobile expectation that tapping the row
  // body dismisses the revealed actions before doing anything else.
  const onRowClick = () => {
    if (swiped) {
      setSwiped(false);
      return;
    }
    onViewHistory(account.id);
  };

  return (
    <tr
      className={rowClass}
      data-row-id={account.id}
      // Without this marker, the document-level `useSheetSwipe` hook
      // treats a left-swipe on the row as a sheet-switch gesture and
      // navigates away before `setSwiped(true)` ever paints — see the
      // opt-out selector in `src/hooks/useSheetSwipe.ts`. Mirrors the
      // equivalent attribute on `BudgetRow`.
      data-swipe-handled
      onClick={onRowClick}
      aria-label={t("accountsSheet.viewHistoryAria", { name: account.name })}
      {...touchHandlers}
    >
      <td className="w-10 px-2.5 py-2 align-middle">
        <span
          aria-hidden
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
          style={{
            color: account.color,
            backgroundColor: account.color
              ? tintFill(account.color)
              : undefined,
            borderColor: account.color ? tintBorder(account.color) : undefined,
          }}
        >
          {account.glyph ? (
            <CategoryIconGlyph name={account.glyph} size={14} />
          ) : (
            <Wallet size={14} aria-hidden focusable={false} />
          )}
        </span>
      </td>
      <td className="px-2.5 py-2 align-middle">
        <span className="block font-mono font-bold text-fg-bright">
          {account.name}
        </span>
        {account.description && (
          <span className="block font-mono text-xs text-muted">
            {account.description}
          </span>
        )}
      </td>
      <td className="account-bank-cell hidden px-2.5 py-2 align-middle font-mono text-xs text-muted md:table-cell">
        {account.bank ? <span className="block">{account.bank}</span> : null}
        {account.clearing || account.accountNumber ? (
          <span className="block text-flag">
            {[account.clearing, account.accountNumber]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : null}
        {account.iban && <span className="block">{account.iban}</span>}
      </td>
      <td
        className={`px-2.5 py-2 align-middle tabular-nums whitespace-nowrap ${cellClass} ${
          balance < 0 ? "text-negative" : "text-positive"
        }`}
      >
        <span
          className="font-mono"
          title={canUpdateBalance ? undefined : t("account.addBudgetSheetHint")}
        >
          {formatBalance(balance, accountSettings)}
        </span>
      </td>
      <td className="w-20 px-2.5 py-2 text-right align-middle">
        <span
          title={
            historyCount === 0
              ? t("accountsSheet.noHistoryImported")
              : t("accountsSheet.viewHistoryEntries", { n: historyCount })
          }
          className={`block text-right font-mono text-xs tabular-nums ${
            historyCount === 0 ? "text-muted" : "text-fg"
          }`}
        >
          {formatCount(historyCount, accountSettings)}
        </span>
      </td>
      <td className="account-period-cell hidden px-2.5 py-2 text-left align-middle font-mono text-xs whitespace-nowrap md:table-cell">
        <span
          title={
            historyRange === null
              ? t("accountsSheet.noHistoryImported")
              : t("accountsSheet.historyRangeTitle")
          }
          className={`block ${historyRange === null ? "text-muted" : "text-fg"}`}
        >
          {historyRange === null
            ? "—"
            : formatMonthRange(historyRange.start, historyRange.end, lang)}
        </span>
      </td>
      <td className="swipe-action-cell account-action-cell w-32 p-0 align-middle">
        <div className="flex h-full w-full items-stretch justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSwiped(false);
              onEditAccount(account.id);
            }}
            aria-label={t("accountsSheet.editAccountAria", {
              name: account.name,
            })}
            title={t("accountsSheet.editAccountTitle")}
            className="action-btn action-btn-pen inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
          >
            <Pencil size={16} aria-hidden focusable={false} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSwiped(false);
              onDeleteAccount(account.id, account.name);
            }}
            aria-label={t("accountsSheet.deleteAccountAria", {
              name: account.name,
            })}
            title={t("accountsSheet.deleteAccountTitle")}
            className="action-btn action-btn-delete inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-danger"
          >
            <Trash2 size={16} aria-hidden focusable={false} />
          </button>
          <AccountActionsMenu
            accountId={account.id}
            accountName={account.name}
            canCut={canCut}
            canUpdateBalance={canUpdateBalance}
            onUpdateBalance={onUpdateBalance}
            onImportHistory={onImportHistory}
            onCutHistory={onCutHistory}
            onEdit={() => onEditAccount(account.id)}
            onDelete={() => onDeleteAccount(account.id, account.name)}
            onAction={() => setSwiped(false)}
          />
        </div>
      </td>
    </tr>
  );
}

// Memoised so a swipe / dropdown on one row doesn't re-render every
// sibling — the parent recomputes balances/maps on each `data` change
// anyway, so per-row stability is what we'd lose without it.
export const AccountRow = memo(AccountRowImpl);
