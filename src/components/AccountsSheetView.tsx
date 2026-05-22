import { useMemo } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Download,
  History,
  Pencil,
  Plus,
  Repeat,
  Scissors,
  Wallet,
} from "lucide-react";

import { allCategories, allTypes } from "../data/presets";
import { accountBalance } from "../data/sheet";
import { detectTransferCandidates } from "../data/transfer-collapse";
import type {
  Account,
  Category,
  EntryType,
  Settings,
  Sheet,
  UserData,
} from "../data/types";
import { useLang, useT } from "../i18n";
import { displayCategoryName } from "../i18n/preset-names";
import { formatBalance, formatShortDate } from "../utils/format";
import { CategoryIconGlyph } from "./icons";

type Props = {
  sheet: Sheet;
  data: UserData;
  settings: Settings;
  onCreateAccount: () => void;
  onEditAccount: (accountId: string) => void;
  onUpdateBalance: (accountId: string) => void;
  onCreateTransaction: () => void;
  onEditTransaction: (transactionId: string) => void;
  // Opens the import-history modal scoped to the clicked account.
  onImportHistory: (accountId: string) => void;
  // Opens the read-only history viewer for the clicked account.
  // Only enabled when the account already has imported entries.
  onViewHistory: (accountId: string) => void;
  // Opens the "cut history" modal scoped to the clicked account. Drops
  // imported entries and cross-account transactions dated before a
  // user-picked cutoff — useful when an account's purpose has changed
  // and the old history is no longer relevant.
  onCutHistory: (accountId: string) => void;
  // Opens the cross-account transfer-collapse modal. The link is
  // disabled when the detector finds nothing — no point sending the
  // user to an empty modal.
  onFindTransfers: () => void;
  onEditSheet: (sheetId: string) => void;
  onDownloadSheet: (sheetId: string) => void;
};

export function AccountsSheetView({
  sheet,
  data,
  settings,
  onCreateAccount,
  onEditAccount,
  onUpdateBalance,
  onCreateTransaction,
  onEditTransaction,
  onImportHistory,
  onViewHistory,
  onCutHistory,
  onFindTransfers,
  onEditSheet,
  onDownloadSheet,
}: Props) {
  const t = useT();
  const lang = useLang();
  // Pre-compute every account's balance once per render. The helper
  // walks every budget item in the workspace plus every transaction,
  // so doing it inside a map() would be O(accounts²) on every keystroke
  // — pulling it out keeps balances cheap as the dataset grows.
  const balances = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of data.accounts) m.set(a.id, accountBalance(data, a.id));
    return m;
  }, [data]);
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
  const accountsById = useMemo(() => {
    const m = new Map<string, Account>();
    for (const a of data.accounts) m.set(a.id, a);
    return m;
  }, [data.accounts]);
  const categoriesById = useMemo(() => {
    const m = new Map<string, Category>();
    // Resolve both user-added and built-in preset categories so the
    // transaction log renders a chip even when its typeId resolves
    // to a preset category.
    for (const c of allCategories(data)) m.set(c.id, c);
    return m;
  }, [data]);
  // Types indexed by id so the transaction log can resolve a
  // `tx.typeId` to its parent category for the chip rendering. The
  // map covers presets + user-added types via `allTypes`.
  const typesById = useMemo(() => {
    const m = new Map<string, EntryType>();
    for (const t of allTypes(data)) m.set(t.id, t);
    return m;
  }, [data]);
  // Transactions sorted with the newest first so the log reads as a
  // recency-first ledger, mirroring how the user thinks about
  // transfers ("the dinner cover was last week").
  const sortedTransactions = useMemo(() => {
    return [...data.transactions].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
    );
  }, [data.transactions]);

  // How many transfer pairs the detector currently sees. Drives the
  // badge on the "Find transfers" link and whether the link is
  // enabled at all — clicking through to an empty modal would be a
  // dead end.
  const transferCandidateCount = useMemo(() => {
    return detectTransferCandidates({
      history: data.history,
      dismissedPairKeys: new Set(data.transferCollapseDismissals),
    }).length;
  }, [data.history, data.transferCollapseDismissals]);

  return (
    <section>
      <header className="mb-4 flex items-center justify-center gap-2">
        <h2 className="m-0 text-base font-bold text-fg-bright">{sheet.name}</h2>
        <button
          type="button"
          onClick={() => onEditSheet(sheet.id)}
          aria-label={t("accountsSheet.edit", { name: sheet.name })}
          title={t("accountsSheet.editSheet")}
          className="inline-flex cursor-pointer items-center justify-center rounded p-1 text-muted opacity-70 hover:bg-surface-2 hover:text-fg-bright hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
        >
          <Pencil size={14} aria-hidden focusable={false} />
        </button>
        <button
          type="button"
          onClick={() => onDownloadSheet(sheet.id)}
          aria-label={t("download.downloadSheet")}
          title={t("download.downloadSheetTitle")}
          className="inline-flex cursor-pointer items-center justify-center rounded p-1 text-muted opacity-70 hover:bg-surface-2 hover:text-fg-bright hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
        >
          <Download size={14} aria-hidden focusable={false} />
        </button>
      </header>

      <section className="mb-6">
        <h3 className="mb-2 text-xs font-bold tracking-wider uppercase text-fg-bright">
          {t("accountsSheet.title")}
        </h3>
        <div className="overflow-clip rounded border border-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-3 text-xs tracking-wider uppercase text-muted">
                <th className="w-10 px-2 py-1.5"></th>
                <th className="px-2 py-1.5 text-left">
                  {t("accountsSheet.name")}
                </th>
                <th className="hidden px-2 py-1.5 text-left md:table-cell">
                  {t("accountsSheet.bank")}
                </th>
                <th className="px-2 py-1.5 text-right">
                  {t("accountsSheet.balance")}
                </th>
                <th className="w-32 px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
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
                const transactionsForAccount = data.transactions.filter(
                  (tx) =>
                    tx.fromAccountId === account.id ||
                    tx.toAccountId === account.id,
                ).length;
                const canCut = historyCount > 0 || transactionsForAccount > 0;
                return (
                  <tr
                    key={account.id}
                    className="border-b border-line last:border-b-0 hover:bg-surface-2"
                  >
                    <td className="w-10 px-2 py-2 align-middle">
                      <span
                        aria-hidden
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
                        style={{
                          color: account.color,
                          backgroundColor: account.color
                            ? `color-mix(in srgb, ${account.color} 18%, transparent)`
                            : undefined,
                          borderColor: account.color
                            ? `color-mix(in srgb, ${account.color} 55%, transparent)`
                            : undefined,
                        }}
                      >
                        {account.glyph ? (
                          <CategoryIconGlyph name={account.glyph} size={14} />
                        ) : (
                          <Wallet size={14} aria-hidden focusable={false} />
                        )}
                      </span>
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <button
                        type="button"
                        onClick={() => onEditAccount(account.id)}
                        className="cursor-pointer border-0 bg-transparent p-0 text-left text-fg-bright hover:text-accent"
                      >
                        <span className="block font-bold">{account.name}</span>
                        {account.description && (
                          <span className="block text-xs text-muted">
                            {account.description}
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="hidden px-2 py-2 align-middle text-xs text-muted md:table-cell">
                      {account.bank ? (
                        <span className="block">{account.bank}</span>
                      ) : null}
                      {account.clearing || account.accountNumber ? (
                        <span className="block font-mono text-flag">
                          {[account.clearing, account.accountNumber]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      ) : null}
                      {account.iban && (
                        <span className="block font-mono">{account.iban}</span>
                      )}
                    </td>
                    <td
                      className={`px-2 py-2 text-right align-middle tabular-nums whitespace-nowrap ${
                        balance < 0 ? "text-negative" : "text-positive"
                      }`}
                    >
                      {accountsWithBudget.has(account.id) ? (
                        <button
                          type="button"
                          onClick={() => onUpdateBalance(account.id)}
                          aria-label={t("accountsSheet.updateBalanceAria", {
                            name: account.name,
                          })}
                          title={t("accountsSheet.updateBalanceTitle")}
                          className="cursor-pointer border-0 bg-transparent p-0 font-mono tabular-nums text-inherit hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                        >
                          {formatBalance(balance, accountSettings)}
                        </button>
                      ) : (
                        <span
                          className="font-mono"
                          title={t("account.addBudgetSheetHint")}
                        >
                          {formatBalance(balance, accountSettings)}
                        </span>
                      )}
                    </td>
                    <td className="w-32 px-2 py-2 text-right align-middle">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => onImportHistory(account.id)}
                          aria-label={t("accountsSheet.importHistoryAria", {
                            name: account.name,
                          })}
                          title={t("accountsSheet.importHistoryTitle")}
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-accent"
                        >
                          <Download size={14} aria-hidden focusable={false} />
                        </button>
                        <button
                          type="button"
                          disabled={historyCount === 0}
                          onClick={() => onViewHistory(account.id)}
                          aria-label={t("accountsSheet.viewHistoryAria", {
                            name: account.name,
                          })}
                          title={
                            historyCount === 0
                              ? t("accountsSheet.noHistoryImported")
                              : t("accountsSheet.viewHistoryEntries", {
                                  n: historyCount,
                                })
                          }
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <History size={14} aria-hidden focusable={false} />
                        </button>
                        <button
                          type="button"
                          disabled={!canCut}
                          onClick={() => onCutHistory(account.id)}
                          aria-label={t("accountsSheet.cutHistoryAria", {
                            name: account.name,
                          })}
                          title={
                            canCut
                              ? t("accountsSheet.cutHistoryTitle")
                              : t("accountsSheet.nothingToCut")
                          }
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Scissors size={14} aria-hidden focusable={false} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditAccount(account.id)}
                          aria-label={t("accountsSheet.editAccountAria", {
                            name: account.name,
                          })}
                          title={t("accountsSheet.editAccountTitle")}
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-accent"
                        >
                          <Pencil size={14} aria-hidden focusable={false} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="bg-surface-3 p-0">
                  <button
                    type="button"
                    onClick={onCreateAccount}
                    className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-0 bg-transparent px-3 py-2 text-sm text-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  >
                    <Plus size={14} aria-hidden focusable={false} />
                    {t("accountsSheet.addAccount")}
                  </button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold tracking-wider uppercase text-fg-bright">
            {t("accountsSheet.transfers")}
          </h3>
          <button
            type="button"
            onClick={onFindTransfers}
            disabled={transferCandidateCount === 0}
            title={
              transferCandidateCount === 0
                ? t("accountsSheet.noTransferPairs")
                : transferCandidateCount === 1
                  ? t("accountsSheet.reviewTransferPairs", {
                      n: transferCandidateCount,
                    })
                  : t("accountsSheet.reviewTransferPairsPlural", {
                      n: transferCandidateCount,
                    })
            }
            className="inline-flex cursor-pointer items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Repeat size={11} aria-hidden focusable={false} />
            {t("accountsSheet.findTransfers")}
            {transferCandidateCount > 0 && (
              <span className="rounded bg-accent/15 px-1 text-accent">
                {transferCandidateCount}
              </span>
            )}
          </button>
        </div>
        <div className="overflow-clip rounded border border-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-3 text-xs tracking-wider uppercase text-muted">
                <th className="w-20 px-2 py-1.5 text-left">
                  {t("accountsSheet.date")}
                </th>
                <th className="px-2 py-1.5 text-left">
                  {t("accountsSheet.description")}
                </th>
                <th className="hidden px-2 py-1.5 text-left md:table-cell">
                  {t("accountsSheet.transfer")}
                </th>
                <th className="px-2 py-1.5 text-right">
                  {t("accountsSheet.amount")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedTransactions.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-xs text-muted"
                  >
                    {t("accountsSheet.noTransfers")}
                  </td>
                </tr>
              )}
              {sortedTransactions.map((tx) => {
                const from = accountsById.get(tx.fromAccountId);
                const to = accountsById.get(tx.toAccountId);
                const type = tx.typeId
                  ? (typesById.get(tx.typeId) ?? null)
                  : null;
                const category = type
                  ? (categoriesById.get(type.categoryId) ?? null)
                  : null;
                return (
                  <tr
                    key={tx.id}
                    className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2"
                    onClick={() => onEditTransaction(tx.id)}
                  >
                    <td className="w-20 px-2 py-2 align-middle font-mono text-xs text-muted whitespace-nowrap">
                      {formatShortDate(tx.date, settings.shortDateFormat, lang)}
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <span className="block text-fg-bright">
                        {tx.description}
                      </span>
                      {category && (
                        <span
                          className="mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                          style={{
                            color: category.color,
                            backgroundColor: `color-mix(in srgb, ${category.color} 18%, transparent)`,
                          }}
                        >
                          {displayCategoryName(category, t)}
                        </span>
                      )}
                      {/* On mobile the dedicated transfer column is
                          hidden — fold the from/to summary into the
                          description cell instead so the row still
                          shows the direction at a glance. */}
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted md:hidden">
                        <span>{from?.name ?? "?"}</span>
                        <ArrowRight
                          size={10}
                          aria-hidden
                          focusable={false}
                          className="shrink-0"
                        />
                        <span>{to?.name ?? "?"}</span>
                      </span>
                    </td>
                    <td className="hidden px-2 py-2 align-middle text-xs text-muted md:table-cell">
                      <span className="inline-flex items-center gap-1.5">
                        <AccountChip account={from ?? null} />
                        <ArrowRight
                          size={12}
                          aria-hidden
                          focusable={false}
                          className="shrink-0 text-flag"
                        />
                        <AccountChip account={to ?? null} />
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right align-middle font-mono tabular-nums whitespace-nowrap text-fg-bright">
                      {formatBalance(tx.amount, settings)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="bg-surface-3 p-0">
                  <button
                    type="button"
                    onClick={onCreateTransaction}
                    disabled={data.accounts.length < 2}
                    title={
                      data.accounts.length < 2
                        ? t("accountsSheet.needTwoAccounts")
                        : undefined
                    }
                    className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-0 bg-transparent px-3 py-2 text-sm text-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ArrowLeftRight size={14} aria-hidden focusable={false} />
                    {t("accountsSheet.newTransfer")}
                  </button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </section>
  );
}

function AccountChip({ account }: { account: Account | null }) {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1 rounded border border-line bg-surface-2 px-1.5 py-0.5 text-xs text-fg-bright">
      <span
        aria-hidden
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
        style={{
          color: account?.color,
          backgroundColor: account?.color
            ? `color-mix(in srgb, ${account.color} 18%, transparent)`
            : undefined,
        }}
      >
        {account?.glyph ? (
          <CategoryIconGlyph name={account.glyph} size={10} />
        ) : (
          <Wallet size={10} aria-hidden focusable={false} />
        )}
      </span>
      <span className="truncate">
        {account?.name ?? t("accountsSheet.unknown")}
      </span>
    </span>
  );
}
