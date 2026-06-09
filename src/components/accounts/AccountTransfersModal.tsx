import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  AlignLeft,
  ArrowLeftRight,
  Calendar,
  DollarSign,
  Wrench,
} from "lucide-react";

import { allCategories, allTypes } from "../../data/presets/merge";
import { compareDateStrings } from "../../data/fiscal-month";
import { savingAsTransferEndpoint } from "../../data/savings/value";
import type {
  Settings,
  TransactionSortOrder,
  UserData,
} from "../../data/types";
import { useLang, useT } from "../../i18n";
import { displayCategoryName, displayTypeName } from "../../i18n/preset-names";
import { formatBalance, formatYearMonth } from "../../utils/format";
import { indexById } from "../../utils/indexById";
import { monthColorVar, monthNumberFromKey } from "../../utils/monthColor";
import { AccountTransferRow } from "./AccountTransferRow";
import { ActiveRowProvider } from "../ActiveRowProvider";
import { Modal } from "../Modal";
import { ModalSearchBar } from "../ModalSearchBar";
import { ModalSearchControls } from "../ModalSearchControls";

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

  // A transfer endpoint can be a regular account or a savings account (both
  // share the transfer id-space), so resolve names against both — otherwise a
  // transfer touching a saving would render a blank from / to.
  const accountsById = useMemo(
    () =>
      indexById([
        ...data.accounts,
        ...data.savings.map(savingAsTransferEndpoint),
      ]),
    [data.accounts, data.savings],
  );
  // Resolve both user-added and built-in preset categories so the
  // transfer log renders a chip even when its typeId resolves to a
  // preset category.
  const categoriesById = useMemo(() => indexById(allCategories(data)), [data]);
  // Types indexed by id so the transfer log can resolve a `tx.typeId` to
  // its parent category for the chip rendering. The map covers presets +
  // user-added types via `allTypes`.
  const typesById = useMemo(() => indexById(allTypes(data)), [data]);

  // Search + sort + filter state, mirroring `BudgetViewerModal`'s
  // viewer-local controls: seeded from the persisted preference and
  // reset on every modal close so steering the order or filtering here
  // never mutates the user's global settings. Re-seeds from settings on
  // close so the next open reflects any preference change made between.
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<TransactionSortOrder>(
    settings.transactionSortOrder,
  );
  const [hideUncompleted, setHideUncompleted] = useState(false);
  useEffect(() => {
    if (!open) {
      setQuery("");
      setSortOrder(settings.transactionSortOrder);
      setHideUncompleted(false);
    }
  }, [open, settings.transactionSortOrder]);

  // Only transfers carrying an explicit `completed` boolean can be
  // hidden — that's the one filter that makes sense here (every row is
  // already a transfer, so a "hide transfers" toggle would empty the
  // list). The toggle drops out entirely when no transfer tracks
  // completion.
  const hasCompletable = useMemo(
    () => data.transfers.some((tx) => typeof tx.completed === "boolean"),
    [data.transfers],
  );

  // Pre-lowercased + pre-formatted search haystacks, built once per
  // change to the source data so the per-keystroke filter below
  // collapses to cheap `indexOf` calls — mirrors the same optimisation
  // `BudgetViewerModal` and `buildSearchIndex` apply.
  const searchIndex = useMemo(() => {
    return data.transfers.map((tx) => {
      const from = accountsById.get(tx.fromAccountId) ?? null;
      const to = accountsById.get(tx.toAccountId) ?? null;
      const type = tx.typeId ? (typesById.get(tx.typeId) ?? null) : null;
      const category = type
        ? (categoriesById.get(type.categoryId) ?? null)
        : null;
      const parts = [
        tx.description,
        from?.name ?? "",
        to?.name ?? "",
        type ? displayTypeName(type, t) : "",
        category ? displayCategoryName(category, t) : "",
        formatBalance(tx.amount, settings),
        tx.date,
      ];
      return { tx, haystack: parts.join(" ").toLowerCase() };
    });
  }, [data.transfers, accountsById, typesById, categoriesById, settings, t]);

  // Apply the completed filter and free-text query, then sort by the
  // viewer-local order. Running on the raw `Transfer` list (not the
  // month groups) keeps the predicate flat.
  const visibleTransfers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = searchIndex.filter((e) => {
      if (hideUncompleted && e.tx.completed === false) return false;
      if (q !== "" && !e.haystack.includes(q)) return false;
      return true;
    });
    return filtered
      .map((e) => e.tx)
      .sort((a, b) => compareDateStrings(a.date, b.date, sortOrder));
  }, [searchIndex, query, hideUncompleted, sortOrder]);

  // Walk the visible transfers and emit one group per `YYYY-MM` so the
  // table can drop a colored month-marker row between groups.
  const transferGroups = useMemo(() => {
    const result: {
      monthKey: string;
      transfers: typeof visibleTransfers;
    }[] = [];
    for (const tx of visibleTransfers) {
      const key = tx.date.slice(0, 7);
      const last = result[result.length - 1];
      if (last && last.monthKey === key) last.transfers.push(tx);
      else result.push({ monthKey: key, transfers: [tx] });
    }
    return result;
  }, [visibleTransfers]);

  // Mobile renders each row as its own CSS grid (the table goes
  // display:block), so a `max-content` amount track resolves to a
  // different width on the header row (just the "$" glyph) than on the
  // data rows (a formatted amount) — which knocks the transfer column,
  // and with it the header's transfer glyph, out of line with the
  // body's account chips. Pin a single shared template instead: a
  // fixed transfer track (the two account glyphs + arrow are a constant
  // width) and an amount track sized to the widest formatted amount, so
  // header and body grids agree column-for-column. Mirrors the
  // `--viewer-row-template` trick in `BudgetViewerModal`.
  const mobileRowTemplate = useMemo(() => {
    let amountChars = 4;
    for (const tx of data.transfers) {
      const text = formatBalance(tx.amount, settings);
      if (text.length > amountChars) amountChars = text.length;
    }
    return `56px minmax(0, 1fr) 66px minmax(60px, calc(${amountChars} * 1ch + 1.25rem))`;
  }, [data.transfers, settings]);

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
        {data.transfers.length > 0 && (
          <ModalSearchBar
            value={query}
            onChange={setQuery}
            placeholder={t("accountsSheet.transfersSearchPlaceholder")}
            actions={
              <ModalSearchControls
                sort={{
                  order: sortOrder,
                  defaultOrder: settings.transactionSortOrder,
                  onToggle: () =>
                    setSortOrder((o) =>
                      o === "newestFirst" ? "oldestFirst" : "newestFirst",
                    ),
                }}
                filters={
                  hasCompletable
                    ? [
                        {
                          key: "hideUncompleted",
                          label: t(
                            "accountsSheet.transfersFilterHideUncompleted",
                          ),
                          checked: hideUncompleted,
                          onChange: setHideUncompleted,
                        },
                      ]
                    : []
                }
              />
            }
          />
        )}
        <ActiveRowProvider>
          <table
            className="swipe-table transfers-table transfers-table-modal w-full border-collapse text-sm md:text-[13px]"
            style={
              {
                "--transfers-row-template": mobileRowTemplate,
              } as CSSProperties
            }
          >
            <thead
              className="sticky z-[15] bg-surface-3"
              style={{ top: "-1px" }}
            >
              {/* `text-xs` lives on each <th>, not here on the grid-
                  container <tr>: the mobile `--transfers-row-template`
                  sizes its amount track in `ch`, which resolves against
                  this row's font-size. Keeping the row at the body's
                  size (instead of the smaller header label size) makes
                  the header and data grids agree, so the transfer glyph
                  lines up with the account chips below. */}
              <tr className="border-b border-line bg-surface-3 font-bold tracking-wider uppercase text-muted">
                <th
                  scope="col"
                  className="w-14 pr-1 pl-2 py-2 text-xs text-left md:w-20 md:px-2.5"
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
                  className="pr-2 pl-1 py-2 text-xs text-left md:px-2.5"
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
                  className="px-1 py-2 text-xs text-left md:px-2.5"
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
                  className="px-2.5 py-2 text-xs text-right"
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
                  className="swipe-action-cell transfer-action-cell w-16 px-2.5 py-2 text-xs"
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
            {visibleTransfers.length === 0 && (
              <tbody>
                <tr className="transfers-fullspan">
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-xs text-muted"
                  >
                    {data.transfers.length === 0
                      ? t("accountsSheet.noTransfers")
                      : t("accountsSheet.transfersSearchNoResults")}
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
