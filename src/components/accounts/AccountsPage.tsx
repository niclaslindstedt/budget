import { Fragment, useEffect, useMemo, type CSSProperties } from "react";
import {
  AlignLeft,
  ArrowLeftRight,
  Calendar,
  DollarSign,
  Download,
  Landmark,
  Pencil,
  Plus,
  Receipt,
  Tag,
  Wallet,
  Wrench,
} from "lucide-react";

import { allCategories, allTypes } from "../../data/presets/merge";
import { computeAccountBalances } from "../../data/accounts/balance";
import { compareDateStrings } from "../../data/fiscal-month";
import type {
  Account,
  Category,
  EntryType,
  Settings,
  Sheet,
  UserData,
} from "../../data/types";
import { useLang, useT } from "../../i18n";
import { formatYearMonth } from "../../utils/format";
import { monthColorVar, monthNumberFromKey } from "../../utils/monthColor";
import { AccountRow } from "./AccountRow";
import { TransferRow } from "./TransferRow";
import { ActiveRowProvider } from "../ActiveRowProvider";
import { SheetTitleMenu, type SheetTitleMenuItem } from "../SheetTitleMenu";

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
  onEditSheet: (sheetId: string) => void;
  onDownloadSheet: (sheetId: string) => void;
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
  onEditSheet,
  onDownloadSheet,
}: Props) {
  const t = useT();
  const lang = useLang();
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
  const accountsById = useMemo(() => {
    const m = new Map<string, Account>();
    for (const a of data.accounts) m.set(a.id, a);
    return m;
  }, [data.accounts]);
  const categoriesById = useMemo(() => {
    const m = new Map<string, Category>();
    // Resolve both user-added and built-in preset categories so the
    // transfer log renders a chip even when its typeId resolves
    // to a preset category.
    for (const c of allCategories(data)) m.set(c.id, c);
    return m;
  }, [data]);
  // Types indexed by id so the transfer log can resolve a
  // `tx.typeId` to its parent category for the chip rendering. The
  // map covers presets + user-added types via `allTypes`.
  const typesById = useMemo(() => {
    const m = new Map<string, EntryType>();
    for (const t of allTypes(data)) m.set(t.id, t);
    return m;
  }, [data]);
  // Switching to the accounts overview from another sheet should land
  // the user at the top of the page — the accounts table is the
  // headline content here, not the transfer log that scrolls in below.
  // Without this, the document keeps the previous sheet's scrollY and
  // the user lands mid-transfers when arriving from a long budget
  // sheet. Keyed on `sheet.id` so it only fires on the actual switch,
  // never on a row edit that re-renders the component.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [sheet.id]);

  // Transfer log direction follows the user's `transactionSortOrder`
  // preference so it agrees with every other transaction list in the
  // app. The historical default was newest-first ("the dinner cover
  // was last week") — that's still the default, but the user can flip
  // it from Settings → General → Display.
  const sortedTransfers = useMemo(() => {
    const order = settings.transactionSortOrder;
    return [...data.transfers].sort((a, b) =>
      compareDateStrings(a.date, b.date, order),
    );
  }, [data.transfers, settings.transactionSortOrder]);

  // Walk the sorted (newest-first) transfers and emit one group per
  // `YYYY-MM` so the table can drop a colored month-marker row between
  // groups — mirrors the HistoryModal chrome so short dates (18/5) stay
  // readable when the year or month rolls over.
  const transferGroups = useMemo(() => {
    const result: {
      monthKey: string;
      transfers: typeof sortedTransfers;
    }[] = [];
    for (const tx of sortedTransfers) {
      const key = tx.date.slice(0, 7);
      const last = result[result.length - 1];
      if (last && last.monthKey === key) last.transfers.push(tx);
      else result.push({ monthKey: key, transfers: [tx] });
    }
    return result;
  }, [sortedTransfers]);

  const titleMenuItems: SheetTitleMenuItem[] = [
    {
      key: "edit",
      icon: <Pencil size={16} aria-hidden focusable={false} />,
      label: t("sheet.editSheet"),
      onClick: () => onEditSheet(sheet.id),
    },
    {
      key: "download",
      icon: <Download size={16} aria-hidden focusable={false} />,
      label: t("download.downloadAccountData"),
      onClick: () => onDownloadSheet(sheet.id),
    },
  ];

  return (
    <ActiveRowProvider>
      <section>
        <header className="mb-2 flex items-center justify-center gap-2 md:mb-6">
          <h2 className="m-0 text-base font-bold text-fg-bright">
            {sheet.name}
          </h2>
          <SheetTitleMenu sheetName={sheet.name} items={titleMenuItems} />
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

        <section>
          <h3 className="mb-2 text-xs font-bold tracking-wider uppercase text-fg-bright">
            {t("accountsSheet.transfers")}
          </h3>
          <div className="overflow-clip rounded border border-line bg-surface">
            <table className="transfers-table w-full border-collapse text-sm md:text-[13px]">
              <thead className="sticky top-[var(--app-header-h)] z-[15] bg-surface-3">
                <tr className="border-b border-line bg-surface-3 text-xs font-bold tracking-wider uppercase text-muted">
                  <th
                    scope="col"
                    className="w-14 pr-1 pl-2 py-2 text-left md:w-20 md:px-2.5"
                    aria-label={t("accountsSheet.date")}
                  >
                    <span className="inline-flex items-center gap-1.5 md:gap-2">
                      <Calendar
                        size={16}
                        className="shrink-0 text-accent"
                        aria-hidden
                        focusable={false}
                      />
                      <span className="hidden md:inline">
                        {t("accountsSheet.date")}
                      </span>
                    </span>
                  </th>
                  <th
                    scope="col"
                    className="pr-2 pl-1 py-2 text-left md:px-2.5"
                    aria-label={t("accountsSheet.description")}
                  >
                    <span className="inline-flex flex-col items-start gap-0.5 md:flex-row md:items-center md:gap-2">
                      <span className="inline-flex items-center gap-1.5 md:gap-2">
                        <AlignLeft
                          size={16}
                          className="shrink-0 text-accent"
                          aria-hidden
                          focusable={false}
                        />
                        <span className="hidden md:inline">
                          {t("accountsSheet.description")}
                        </span>
                      </span>
                      {/* The dedicated transfer column is hidden on
                          mobile and its from→to chips fold into the
                          description cell instead. Mirror that here so
                          the chips have a matching glyph + label
                          stacked under the description glyph. */}
                      <span className="inline-flex items-center gap-1.5 md:hidden">
                        <ArrowLeftRight
                          size={14}
                          className="shrink-0 text-accent"
                          aria-hidden
                          focusable={false}
                        />
                        <span>{t("accountsSheet.transfer")}</span>
                      </span>
                    </span>
                  </th>
                  <th
                    scope="col"
                    className="hidden px-2.5 py-2 text-left md:table-cell"
                    aria-label={t("accountsSheet.transfer")}
                  >
                    <span className="inline-flex items-center gap-1.5 md:gap-2">
                      <ArrowLeftRight
                        size={16}
                        className="shrink-0 text-accent"
                        aria-hidden
                        focusable={false}
                      />
                      <span className="hidden md:inline">
                        {t("accountsSheet.transfer")}
                      </span>
                    </span>
                  </th>
                  <th
                    scope="col"
                    className="px-2.5 py-2 text-right"
                    aria-label={t("accountsSheet.amount")}
                  >
                    <span className="inline-flex items-center gap-1.5 md:gap-2">
                      <DollarSign
                        size={16}
                        className="shrink-0 text-accent"
                        aria-hidden
                        focusable={false}
                      />
                      <span className="hidden md:inline">
                        {t("accountsSheet.amount")}
                      </span>
                    </span>
                  </th>
                  <th
                    scope="col"
                    className="transfer-action-cell w-16 px-2.5 py-2"
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
                {sortedTransfers.length === 0 && (
                  <tr className="transfers-fullspan">
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-xs text-muted"
                    >
                      {t("accountsSheet.noTransfers")}
                    </td>
                  </tr>
                )}
                {transferGroups.map((group) => {
                  const monthNum = monthNumberFromKey(group.monthKey);
                  const monthColor =
                    monthNum !== null ? monthColorVar(monthNum) : undefined;
                  const headerColorStyle: CSSProperties | undefined = monthColor
                    ? { color: monthColor }
                    : undefined;
                  return (
                    <Fragment key={group.monthKey}>
                      <tr className="transfers-fullspan">
                        <td
                          colSpan={5}
                          className="sticky top-[calc(var(--app-header-h)+28px)] z-[14] border-b border-line bg-surface-2 px-2 py-1 text-xs font-bold tracking-wider uppercase"
                          style={headerColorStyle}
                        >
                          {formatYearMonth(group.monthKey, lang)}
                        </td>
                      </tr>
                      {group.transfers.map((tx) => {
                        const from = accountsById.get(tx.fromAccountId) ?? null;
                        const to = accountsById.get(tx.toAccountId) ?? null;
                        const type = tx.typeId
                          ? (typesById.get(tx.typeId) ?? null)
                          : null;
                        const category = type
                          ? (categoriesById.get(type.categoryId) ?? null)
                          : null;
                        return (
                          <TransferRow
                            key={tx.id}
                            transfer={tx}
                            from={from}
                            to={to}
                            category={category}
                            settings={settings}
                            monthColor={monthColor}
                            onEditTransfer={onEditTransfer}
                          />
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="bg-surface-3 p-0">
                    <button
                      type="button"
                      onClick={onCreateTransfer}
                      disabled={data.accounts.length < 2}
                      title={
                        data.accounts.length < 2
                          ? t("accountsSheet.needTwoAccounts")
                          : undefined
                      }
                      className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-0 bg-transparent px-3 py-2 text-sm text-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ArrowLeftRight size={16} aria-hidden focusable={false} />
                      {t("accountsSheet.newTransfer")}
                    </button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </section>
    </ActiveRowProvider>
  );
}
