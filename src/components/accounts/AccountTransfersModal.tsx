import { useMemo, type CSSProperties } from "react";
import {
  AlignLeft,
  ArrowLeftRight,
  Calendar,
  DollarSign,
  Wrench,
} from "lucide-react";

import { allCategories, allTypes } from "../../data/presets/merge";
import { compareDateStrings } from "../../data/fiscal-month";
import type { Settings, UserData } from "../../data/types";
import { useLang, useT } from "../../i18n";
import { formatYearMonth } from "../../utils/format";
import { indexById } from "../../utils/indexById";
import { monthColorVar, monthNumberFromKey } from "../../utils/monthColor";
import { AccountTransferRow } from "./AccountTransferRow";
import { ActiveRowProvider } from "../ActiveRowProvider";
import { Modal } from "../Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  data: UserData;
  settings: Settings;
  onCreateTransfer: () => void;
  onEditTransfer: (transferId: string) => void;
};

// Cross-account transfer log, lifted out of the AccountsPage body into a
// modal opened from the accounts title menu — mirrors how the budget
// page tucks its read-only ledger behind the "Viewing mode" modal. The
// rows stay editable here (swipe-to-edit, "New transfer" footer); the
// modal just gives the transfer log a home that doesn't push the
// accounts table off the top of the page.
export function AccountTransfersModal({
  open,
  onClose,
  data,
  settings,
  onCreateTransfer,
  onEditTransfer,
}: Props) {
  const t = useT();
  const lang = useLang();

  const accountsById = useMemo(() => indexById(data.accounts), [data.accounts]);
  // Resolve both user-added and built-in preset categories so the
  // transfer log renders a chip even when its typeId resolves to a
  // preset category.
  const categoriesById = useMemo(() => indexById(allCategories(data)), [data]);
  // Types indexed by id so the transfer log can resolve a `tx.typeId` to
  // its parent category for the chip rendering. The map covers presets +
  // user-added types via `allTypes`.
  const typesById = useMemo(() => indexById(allTypes(data)), [data]);

  // Transfer log direction follows the user's `transactionSortOrder`
  // preference so it agrees with every other transaction list in the
  // app. The historical default was newest-first.
  const sortedTransfers = useMemo(() => {
    const order = settings.transactionSortOrder;
    return [...data.transfers].sort((a, b) =>
      compareDateStrings(a.date, b.date, order),
    );
  }, [data.transfers, settings.transactionSortOrder]);

  // Walk the sorted transfers and emit one group per `YYYY-MM` so the
  // table can drop a colored month-marker row between groups.
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="account-transfers-modal-title"
      size="max-w-4xl"
      fixedHeight
    >
      <Modal.Header
        icon={<ArrowLeftRight size={14} aria-hidden focusable={false} />}
        title={t("accountsSheet.transfers")}
        onClose={onClose}
      />
      <Modal.Body noPadding className="overflow-x-hidden">
        <ActiveRowProvider>
          <table className="transfers-table transfers-table-modal w-full border-collapse text-sm md:text-[13px]">
            <thead
              className="sticky z-[15] bg-surface-3"
              style={{ top: "-1px" }}
            >
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
                </th>
                <th
                  scope="col"
                  className="px-1 py-2 text-left md:px-2.5"
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
            {sortedTransfers.length === 0 && (
              <tbody>
                <tr className="transfers-fullspan">
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-xs text-muted"
                  >
                    {t("accountsSheet.noTransfers")}
                  </td>
                </tr>
              </tbody>
            )}
            {/* One <tbody> per month so each month-header row's sticky
                containing block ends at the next month — gives the
                natural "push the previous label off" behaviour without
                manually managing z-index. */}
            {transferGroups.map((group) => {
              const monthNum = monthNumberFromKey(group.monthKey);
              const monthColor =
                monthNum !== null ? monthColorVar(monthNum) : undefined;
              const headerColorStyle: CSSProperties | undefined = monthColor
                ? { color: monthColor }
                : undefined;
              return (
                <tbody key={group.monthKey}>
                  <tr className="transfers-fullspan transfers-month-header">
                    <td
                      colSpan={5}
                      className="border-b border-line bg-surface-2 px-2 text-xs font-bold tracking-wider uppercase"
                      style={headerColorStyle}
                    >
                      <span className="flex h-7 items-center">
                        {formatYearMonth(group.monthKey, lang)}
                      </span>
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
                      <AccountTransferRow
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
                </tbody>
              );
            })}
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
        </ActiveRowProvider>
      </Modal.Body>
    </Modal>
  );
}
