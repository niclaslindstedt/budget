import {
  Fragment,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  AlignLeft,
  ArrowLeftRight,
  ArrowRight,
  Calendar,
  DollarSign,
  Download,
  Eye,
  Landmark,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Wallet,
  Wrench,
} from "lucide-react";

import { allCategories, allTypes } from "../data/presets";
import { accountBalance } from "../data/sheet";
import type {
  Account,
  Category,
  EntryType,
  Settings,
  Sheet,
  UserData,
} from "../data/types";
import { useLang, useT } from "../i18n";
import { bcp47, type Lang } from "../i18n/locale";
import { displayCategoryName } from "../i18n/preset-names";
import { formatBalance, formatShortDate } from "../utils/format";
import { monthColorVar, monthNumberFromKey } from "../utils/monthColor";
import { AccountActionsMenu } from "./AccountActionsMenu";
import { ActiveRowProvider } from "./ActiveRowProvider";
import { useBlocksSheet } from "./useBlocksSheet";
import { CategoryIconGlyph } from "./icons";

const monthFormatCache = new Map<Lang, Intl.DateTimeFormat>();

function monthFormatFor(lang: Lang): Intl.DateTimeFormat {
  let f = monthFormatCache.get(lang);
  if (!f) {
    f = new Intl.DateTimeFormat(bcp47(lang), {
      month: "long",
      year: "numeric",
    });
    monthFormatCache.set(lang, f);
  }
  return f;
}

function formatMonth(key: string, lang: Lang): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return monthFormatFor(lang).format(new Date(y, m - 1, 1));
}

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
  onCreateTransaction: () => void;
  onEditTransaction: (transactionId: string) => void;
  // Opens the import-history modal scoped to the clicked account.
  onImportHistory: (accountId: string) => void;
  // Opens the read-only history viewer for the clicked account. The
  // viewer handles the empty state itself, so callers can fire this
  // even when the account has no imported entries — the modal shows
  // a "no history" placeholder with the import path inside.
  onViewHistory: (accountId: string) => void;
  // Opens the "cut history" modal scoped to the clicked account. Drops
  // imported entries and cross-account transactions dated before a
  // user-picked cutoff — useful when an account's purpose has changed
  // and the old history is no longer relevant.
  onCutHistory: (accountId: string) => void;
  onEditSheet: (sheetId: string) => void;
  onDownloadSheet: (sheetId: string) => void;
};

export function AccountsSheetView({
  sheet,
  data,
  settings,
  onCreateAccount,
  onEditAccount,
  onDeleteAccount,
  onUpdateBalance,
  onCreateTransaction,
  onEditTransaction,
  onImportHistory,
  onViewHistory,
  onCutHistory,
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
  // Per-account count of cross-account transactions, used by the swipe
  // strip's cut button to decide whether anything is cuttable when the
  // account has no imported history (transfers alone are enough). The
  // map is built once per render so each row read is O(1).
  const transactionCountByAccount = useMemo(() => {
    const m = new Map<string, number>();
    for (const tx of data.transactions) {
      m.set(tx.fromAccountId, (m.get(tx.fromAccountId) ?? 0) + 1);
      m.set(tx.toAccountId, (m.get(tx.toAccountId) ?? 0) + 1);
    }
    return m;
  }, [data.transactions]);
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

  // Transactions sorted with the newest first so the log reads as a
  // recency-first ledger, mirroring how the user thinks about
  // transfers ("the dinner cover was last week").
  const sortedTransactions = useMemo(() => {
    return [...data.transactions].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
    );
  }, [data.transactions]);

  // Walk the sorted (newest-first) transfers and emit one group per
  // `YYYY-MM` so the table can drop a colored month-marker row between
  // groups — mirrors the HistoryModal chrome so short dates (18/5) stay
  // readable when the year or month rolls over.
  const transferGroups = useMemo(() => {
    const result: {
      monthKey: string;
      transactions: typeof sortedTransactions;
    }[] = [];
    for (const tx of sortedTransactions) {
      const key = tx.date.slice(0, 7);
      const last = result[result.length - 1];
      if (last && last.monthKey === key) last.transactions.push(tx);
      else result.push({ monthKey: key, transactions: [tx] });
    }
    return result;
  }, [sortedTransactions]);

  return (
    <ActiveRowProvider>
      <section>
        <header className="mb-4 flex items-center justify-center gap-2">
          <h2 className="m-0 text-base font-bold text-fg-bright">
            {sheet.name}
          </h2>
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

        <section className="mb-6" data-sheet-content>
          <h3 className="mb-2 text-xs font-bold tracking-wider uppercase text-fg-bright">
            {t("accountsSheet.title")}
          </h3>
          <div className="overflow-clip rounded border border-line bg-surface">
            <table className="accounts-table w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-3 text-xs tracking-wider uppercase text-muted">
                  <th scope="col" className="w-10 px-2 py-1.5"></th>
                  <th
                    scope="col"
                    className="px-2 py-1.5 text-left"
                    aria-label={t("accountsSheet.name")}
                  >
                    <span className="inline-flex items-center gap-1.5 md:gap-2">
                      <Tag
                        size={14}
                        className="shrink-0 text-accent"
                        aria-hidden
                        focusable={false}
                      />
                      <span className="hidden md:inline">
                        {t("accountsSheet.name")}
                      </span>
                    </span>
                  </th>
                  <th
                    scope="col"
                    className="account-bank-cell hidden px-2 py-1.5 text-left md:table-cell"
                    aria-label={t("accountsSheet.bank")}
                  >
                    <span className="inline-flex items-center gap-1.5 md:gap-2">
                      <Landmark
                        size={14}
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
                    className="px-2 py-1.5 text-right"
                    aria-label={t("accountsSheet.balance")}
                  >
                    <span className="inline-flex items-center gap-1.5 md:gap-2">
                      <Wallet
                        size={14}
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
                    className="w-20 px-2 py-1.5 text-right"
                    aria-label={t("accountsSheet.historyCountHeader")}
                    title={t("accountsSheet.historyCountTitle")}
                  >
                    <span className="inline-flex items-center justify-end gap-1.5 md:gap-2">
                      <Eye
                        size={14}
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
                    className="account-action-cell w-32 px-2 py-1.5"
                    aria-label={t("sheet.rowActions")}
                  >
                    <span className="inline-flex items-center justify-center gap-1.5 md:gap-2">
                      <Wrench
                        size={14}
                        className="shrink-0 text-accent"
                        aria-hidden
                        focusable={false}
                      />
                      <span className="hidden md:inline">
                        {t("sheet.actions")}
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
                  const transactionsForAccount =
                    transactionCountByAccount.get(account.id) ?? 0;
                  const canCut = historyCount > 0 || transactionsForAccount > 0;
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
          <h3 className="mb-2 text-xs font-bold tracking-wider uppercase text-fg-bright">
            {t("accountsSheet.transfers")}
          </h3>
          <div className="overflow-clip rounded border border-line bg-surface">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-3 text-xs tracking-wider uppercase text-muted">
                  <th
                    scope="col"
                    className="w-20 px-2 py-1.5 text-left"
                    aria-label={t("accountsSheet.date")}
                  >
                    <span className="inline-flex items-center gap-1.5 md:gap-2">
                      <Calendar
                        size={14}
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
                    className="px-2 py-1.5 text-left"
                    aria-label={t("accountsSheet.description")}
                  >
                    <span className="inline-flex items-center gap-1.5 md:gap-2">
                      <AlignLeft
                        size={14}
                        className="shrink-0 text-accent"
                        aria-hidden
                        focusable={false}
                      />
                      <span className="hidden md:inline">
                        {t("accountsSheet.description")}
                      </span>
                    </span>
                  </th>
                  <th
                    scope="col"
                    className="hidden px-2 py-1.5 text-left md:table-cell"
                    aria-label={t("accountsSheet.transfer")}
                  >
                    <span className="inline-flex items-center gap-1.5 md:gap-2">
                      <ArrowLeftRight
                        size={14}
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
                    className="px-2 py-1.5 text-right"
                    aria-label={t("accountsSheet.amount")}
                  >
                    <span className="inline-flex items-center gap-1.5 md:gap-2">
                      <DollarSign
                        size={14}
                        className="shrink-0 text-accent"
                        aria-hidden
                        focusable={false}
                      />
                      <span className="hidden md:inline">
                        {t("accountsSheet.amount")}
                      </span>
                    </span>
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
                {transferGroups.map((group) => {
                  const monthNum = monthNumberFromKey(group.monthKey);
                  const monthColor =
                    monthNum !== null ? monthColorVar(monthNum) : undefined;
                  const colorStyle: CSSProperties | undefined = monthColor
                    ? { color: monthColor }
                    : undefined;
                  return (
                    <Fragment key={group.monthKey}>
                      <tr className="border-b border-line bg-surface-2">
                        <td
                          colSpan={4}
                          className="px-2 py-1 text-xs font-bold tracking-wider uppercase"
                          style={colorStyle}
                        >
                          {formatMonth(group.monthKey, lang)}
                        </td>
                      </tr>
                      {group.transactions.map((tx) => {
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
                            <td
                              className="w-20 px-2 py-2 align-middle font-mono text-xs whitespace-nowrap"
                              style={colorStyle}
                            >
                              {formatShortDate(
                                tx.date,
                                settings.shortDateFormat,
                                lang,
                              )}
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
                                  shows the direction at a glance. Names go
                                  into sr-only spans so the row still reads
                                  "Extrakonto → Lönekonto" for screen
                                  readers; the visible chips are
                                  color + glyph only to keep the layout
                                  tight at phone widths. */}
                              <span className="mt-0.5 flex items-center gap-1 md:hidden">
                                <AccountGlyph account={from ?? null} />
                                <span className="sr-only">
                                  {from?.name ?? t("accountsSheet.unknown")}
                                </span>
                                <ArrowRight
                                  size={10}
                                  aria-hidden
                                  focusable={false}
                                  className="shrink-0 text-flag"
                                />
                                <AccountGlyph account={to ?? null} />
                                <span className="sr-only">
                                  {to?.name ?? t("accountsSheet.unknown")}
                                </span>
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
                    </Fragment>
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
    </ActiveRowProvider>
  );
}

type AccountRowProps = {
  account: Account;
  balance: number;
  accountSettings: Settings;
  historyCount: number;
  canCut: boolean;
  canUpdateBalance: boolean;
  onEditAccount: (accountId: string) => void;
  onDeleteAccount: (accountId: string, name: string) => void;
  onUpdateBalance: (accountId: string) => void;
  onImportHistory: (accountId: string) => void;
  onViewHistory: (accountId: string) => void;
  onCutHistory: (accountId: string) => void;
};

const SWIPE_THRESHOLD = 40;

function AccountRowImpl({
  account,
  balance,
  accountSettings,
  historyCount,
  canCut,
  canUpdateBalance,
  onEditAccount,
  onDeleteAccount,
  onUpdateBalance,
  onImportHistory,
  onViewHistory,
  onCutHistory,
}: AccountRowProps) {
  const t = useT();
  const [swiped, setSwiped] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const moved = useRef(false);

  // Hook the row into the ActiveRowProvider so a tap elsewhere in the
  // accounts table only dismisses the swipe — the underlying control
  // still gets a follow-up tap to fire properly. Mirrors the budget
  // sheet's SheetRow wiring.
  useBlocksSheet(account.id, swiped, () => setSwiped(false));

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    moved.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null || startY.current === null) return;
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      moved.current = true;
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const endX = e.changedTouches[0].clientX;
    const dx = endX - startX.current;
    startX.current = null;
    startY.current = null;
    if (!moved.current) return;
    if (dx < -SWIPE_THRESHOLD) setSwiped(true);
    else if (dx > SWIPE_THRESHOLD) setSwiped(false);
  };

  const rowClass = [
    swiped ? "is-swiped" : "",
    "border-b border-line last:border-b-0 hover:bg-surface-2",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <tr
      className={rowClass}
      data-row-id={account.id}
      // Without this marker, the document-level `useSheetSwipe` hook
      // treats a left-swipe on the row as a sheet-switch gesture and
      // navigates away before `setSwiped(true)` ever paints — see the
      // opt-out selector in `src/hooks/useSheetSwipe.ts`. Mirrors the
      // equivalent attribute on `SheetRow`.
      data-swipe-handled
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
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
          onClick={() => {
            setSwiped(false);
            onViewHistory(account.id);
          }}
          aria-label={t("accountsSheet.viewHistoryAria", {
            name: account.name,
          })}
          title={
            historyCount === 0
              ? t("accountsSheet.noHistoryImported")
              : t("accountsSheet.viewHistoryEntries", { n: historyCount })
          }
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
      <td className="account-bank-cell hidden px-2 py-2 align-middle text-xs text-muted md:table-cell">
        {account.bank ? <span className="block">{account.bank}</span> : null}
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
        {canUpdateBalance ? (
          <button
            type="button"
            onClick={() => {
              setSwiped(false);
              onUpdateBalance(account.id);
            }}
            aria-label={t("accountsSheet.updateBalanceAria", {
              name: account.name,
            })}
            title={t("accountsSheet.updateBalanceTitle")}
            className="cursor-pointer border-0 bg-transparent p-0 font-mono tabular-nums text-inherit hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          >
            {formatBalance(balance, accountSettings)}
          </button>
        ) : (
          <span className="font-mono" title={t("account.addBudgetSheetHint")}>
            {formatBalance(balance, accountSettings)}
          </span>
        )}
      </td>
      <td className="w-20 px-2 py-2 text-right align-middle">
        <button
          type="button"
          onClick={() => {
            setSwiped(false);
            onViewHistory(account.id);
          }}
          aria-label={t("accountsSheet.viewHistoryAria", {
            name: account.name,
          })}
          title={
            historyCount === 0
              ? t("accountsSheet.noHistoryImported")
              : t("accountsSheet.viewHistoryEntries", { n: historyCount })
          }
          className={`w-full cursor-pointer border-0 bg-transparent p-0 text-right font-mono text-xs tabular-nums hover:text-accent ${
            historyCount === 0 ? "text-muted" : "text-fg"
          }`}
        >
          {historyCount.toLocaleString()}
        </button>
      </td>
      <td className="account-action-cell w-32 p-0 align-middle">
        <div className="flex h-full w-full items-stretch justify-end">
          <button
            type="button"
            onClick={() => {
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
            onClick={() => {
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
            onImportHistory={onImportHistory}
            onCutHistory={onCutHistory}
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
const AccountRow = memo(AccountRowImpl);

function AccountChip({ account }: { account: Account | null }) {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1 rounded border border-line bg-surface-2 px-1.5 py-0.5 text-xs text-fg-bright">
      <AccountGlyph account={account} size={10} />
      <span className="truncate">
        {account?.name ?? t("accountsSheet.unknown")}
      </span>
    </span>
  );
}

// Colored circle + glyph for an account, with no surrounding chip
// chrome. Used directly on mobile inside the transfer row's
// description cell where the dedicated transfer column is hidden —
// callers wrap it in an sr-only label so the account is still
// announced. Falls back to a wallet glyph when the account has no
// custom icon, matching the ACCOUNTS table row.
function AccountGlyph({
  account,
  size = 12,
}: {
  account: Account | null;
  size?: number;
}) {
  const circleSize = size + 6;
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: circleSize,
        height: circleSize,
        color: account?.color,
        backgroundColor: account?.color
          ? `color-mix(in srgb, ${account.color} 18%, transparent)`
          : undefined,
      }}
    >
      {account?.glyph ? (
        <CategoryIconGlyph name={account.glyph} size={size} />
      ) : (
        <Wallet size={size} aria-hidden focusable={false} />
      )}
    </span>
  );
}
