import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Download,
  Landmark,
  Pencil,
  Plus,
  Receipt,
  Tag,
  Wallet,
  Wrench,
} from "lucide-react";

import { unlock } from "../../data/achievements";
import { computeAccountBalances } from "../../data/accounts/balance";
import type { Settings, Sheet, UserData } from "../../data/types";
import { useT } from "../../i18n";
import { AccountRow } from "./AccountRow";
import { AccountTransfersModal } from "./AccountTransfersModal";
import { ActiveRowProvider } from "../ActiveRowProvider";
import { useModalDispatch } from "../modal-dispatch";
import {
  SheetTitleMenu,
  favoriteMenuItem,
  type SheetTitleMenuItem,
} from "../SheetTitleMenu";

type Props = {
  sheet: Sheet;
  data: UserData;
  settings: Settings;
  onCreateAccount: () => void;
  onEditAccount: (accountId: string) => void;
  // Opens the delete-account confirmation modal directly, without
  // detouring through the edit-account modal first. The trash button
  // in the per-row swipe strip uses this.
  onDeleteAccount: (accountId: string, name: string) => void;
  onUpdateBalance: (accountId: string) => void;
  onCreateTransfer: () => void;
  onEditTransfer: (transferId: string) => void;
  // Opens the import-history modal scoped to the clicked account.
  onImportHistory: (accountId: string) => void;
  // Opens the read-only history viewer for the clicked account. The
  // viewer handles the empty state itself, so callers can fire this
  // even when the account has no imported entries — the modal shows
  // a "no history" placeholder with the import path inside.
  onViewHistory: (accountId: string) => void;
  // Opens the "cut history" modal scoped to the clicked account. Drops
  // imported entries and cross-account transfers dated before a
  // user-picked cutoff — useful when an account's purpose has changed
  // and the old history is no longer relevant.
  onCutHistory: (accountId: string) => void;
};

export function AccountsPage({
  sheet,
  data,
  settings,
  onCreateAccount,
  onEditAccount,
  onDeleteAccount,
  onUpdateBalance,
  onCreateTransfer,
  onEditTransfer,
  onImportHistory,
  onViewHistory,
  onCutHistory,
}: Props) {
  const t = useT();
  const dispatchModal = useModalDispatch();
  // Transfer log lives behind a modal opened from the title menu —
  // mirrors the budget page's "Viewing mode" modal so the accounts
  // table stays the headline content of the page.
  const [transfersOpen, setTransfersOpen] = useState(false);
  // Pre-compute every account's balance once per render. The batched
  // helper walks the sheet tree / transfer log / history once and
  // distributes amounts to each account's running total, replacing the
  // earlier per-account call that was O(accounts²) over the workspace.
  const balances = useMemo(() => computeAccountBalances(data), [data]);
  // Which accounts have at least one AccountBudget pointing at them.
  // Only those balances are clickable — the "update balance" flow needs
  // a budget to drop the correction row into. Computed alongside
  // `balances` so the row render reads it without re-walking sheets.
  const accountsWithBudget = useMemo(() => {
    const s = new Set<string>();
    for (const sheet of data.sheets) {
      for (const item of sheet.items) {
        if (item.type !== "accountBudget") continue;
        if (item.accountId) s.add(item.accountId);
      }
    }
    return s;
  }, [data.sheets]);
  // Per-account count of cross-account transfers, used by the swipe
  // strip's cut button to decide whether anything is cuttable when the
  // account has no imported history (transfers alone are enough). The
  // map is built once per render so each row read is O(1).
  const transferCountByAccount = useMemo(() => {
    const m = new Map<string, number>();
    for (const tx of data.transfers) {
      m.set(tx.fromAccountId, (m.get(tx.fromAccountId) ?? 0) + 1);
      m.set(tx.toAccountId, (m.get(tx.toAccountId) ?? 0) + 1);
    }
    return m;
  }, [data.transfers]);
  // Switching to the accounts overview from another sheet should land
  // the user at the top of the page — the accounts table is the
  // headline content here. Keyed on `sheet.id` so it only fires on the
  // actual switch, never on a row edit that re-renders the component.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    // Landing on the accounts overview is the `birdsEye` gesture.
    unlock("birdsEye");
  }, [sheet.id]);

  const titleMenuItems: SheetTitleMenuItem[] = [
    favoriteMenuItem(sheet, t, dispatchModal),
    {
      key: "edit",
      icon: <Pencil size={16} aria-hidden focusable={false} />,
      label: t("sheet.editSheet"),
      onClick: () =>
        dispatchModal({ kind: "open-edit-sheet", sheetId: sheet.id }),
    },
    {
      key: "transfers",
      icon: <ArrowLeftRight size={16} aria-hidden focusable={false} />,
      label: t("sheet.viewTransfers"),
      onClick: () => setTransfersOpen(true),
    },
    {
      key: "download",
      icon: <Download size={16} aria-hidden focusable={false} />,
      label: t("download.downloadAccountData"),
      onClick: () =>
        dispatchModal({ kind: "open-download-sheet", sheetId: sheet.id }),
    },
  ];

  return (
    <ActiveRowProvider>
      <section>
        <header className="mb-2 flex items-center justify-center md:mb-6">
          <h2 className="m-0">
            <SheetTitleMenu sheetName={sheet.name} items={titleMenuItems} />
          </h2>
        </header>

        <section className="mb-6" data-sheet-content>
          <h3 className="mb-2 text-xs font-bold tracking-wider uppercase text-fg-bright">
            {t("accountsSheet.title")}
          </h3>
          <div className="overflow-clip rounded border border-line bg-surface">
            <table className="accounts-table w-full border-collapse text-sm md:text-[13px]">
              <thead>
                <tr className="border-b border-line bg-surface-3 text-xs font-bold tracking-wider uppercase text-muted">
                  <th
                    scope="col"
                    className="w-10 px-2.5 py-2 text-center"
                    aria-label={t("accountsSheet.name")}
                  >
                    <Tag
                      size={16}
                      className="inline-block shrink-0 text-accent"
                      aria-hidden
                      focusable={false}
                    />
                  </th>
                  <th
                    scope="col"
                    className="px-2.5 py-2 text-left"
                    aria-label={t("accountsSheet.name")}
                  >
                    <span className="hidden md:inline">
                      {t("accountsSheet.name")}
                    </span>
                  </th>
                  <th
                    scope="col"
                    className="account-bank-cell hidden px-2.5 py-2 text-left md:table-cell"
                    aria-label={t("accountsSheet.bank")}
                  >
                    <span className="inline-flex items-center gap-1.5 md:gap-2">
                      <Landmark
                        size={16}
                        className="shrink-0 text-accent"
                        aria-hidden
                        focusable={false}
                      />
                      <span className="hidden md:inline">
                        {t("accountsSheet.bank")}
                      </span>
                    </span>
                  </th>
                  <th
                    scope="col"
                    className="px-2.5 py-2 text-right"
                    aria-label={t("accountsSheet.balance")}
                  >
                    <span className="inline-flex items-center justify-end gap-1.5 md:gap-2">
                      <Wallet
                        size={16}
                        className="shrink-0 text-accent"
                        aria-hidden
                        focusable={false}
                      />
                      <span className="hidden md:inline">
                        {t("accountsSheet.balance")}
                      </span>
                    </span>
                  </th>
                  <th
                    scope="col"
                    className="w-20 px-2.5 py-2 text-right"
                    aria-label={t("accountsSheet.historyCountHeader")}
                    title={t("accountsSheet.historyCountTitle")}
                  >
                    <span className="inline-flex items-center justify-end gap-1.5 md:gap-2">
                      <Receipt
                        size={16}
                        className="shrink-0 text-accent"
                        aria-hidden
                        focusable={false}
                      />
                      <span className="hidden md:inline">
                        {t("accountsSheet.historyCountHeader")}
                      </span>
                    </span>
                  </th>
                  <th
                    scope="col"
                    className="account-action-cell w-32 px-2.5 py-2"
                    aria-label={t("budget.rowActions")}
                  >
                    <span className="flex items-center justify-center gap-1.5 md:gap-2">
                      <Wrench
                        size={16}
                        className="shrink-0 text-accent"
                        aria-hidden
                        focusable={false}
                      />
                      <span className="hidden md:inline">
                        {t("budget.actions")}
                      </span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-6 text-center text-xs text-muted"
                    >
                      {t("accountsSheet.noAccounts")}
                    </td>
                  </tr>
                )}
                {data.accounts.map((account) => {
                  const balance = balances.get(account.id) ?? 0;
                  const accountSettings = account.currency
                    ? { ...settings, currency: account.currency }
                    : settings;
                  const historyCount = data.history[account.id]?.length ?? 0;
                  const transfersForAccount =
                    transferCountByAccount.get(account.id) ?? 0;
                  const canCut = historyCount > 0 || transfersForAccount > 0;
                  return (
                    <AccountRow
                      key={account.id}
                      account={account}
                      balance={balance}
                      accountSettings={accountSettings}
                      historyCount={historyCount}
                      canCut={canCut}
                      canUpdateBalance={accountsWithBudget.has(account.id)}
                      onEditAccount={onEditAccount}
                      onDeleteAccount={onDeleteAccount}
                      onUpdateBalance={onUpdateBalance}
                      onImportHistory={onImportHistory}
                      onViewHistory={onViewHistory}
                      onCutHistory={onCutHistory}
                    />
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} className="bg-surface-3 p-0">
                    <button
                      type="button"
                      onClick={onCreateAccount}
                      className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-0 bg-transparent px-3 py-2 text-sm text-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                    >
                      <Plus size={16} aria-hidden focusable={false} />
                      {t("accountsSheet.addAccount")}
                    </button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </section>

      <AccountTransfersModal
        open={transfersOpen}
        onClose={() => setTransfersOpen(false)}
        data={data}
        settings={settings}
        onCreateTransfer={onCreateTransfer}
        onEditTransfer={onEditTransfer}
      />
    </ActiveRowProvider>
  );
}
