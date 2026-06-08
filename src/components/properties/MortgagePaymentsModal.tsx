import { memo, useMemo, useRef, useState } from "react";
import {
  Coins,
  Landmark,
  Pencil,
  Percent,
  ReceiptText,
  Scale,
  Settings2,
  TrendingDown,
  Trash2,
} from "lucide-react";

import {
  type MortgageChargeGroup,
  groupPaymentsByCharge,
  type MortgageChargeItem,
  reconcileMortgageAmortization,
  splitRecordedPayment,
} from "../../data/property-mortgage/payment";
import type {
  Account,
  HistoryEntry,
  Property,
  Settings,
} from "../../data/types";
import type { FloatingPlacement } from "../../hooks";
import { useResetOnOpen } from "../../hooks";
import { useRowSwipe } from "../../hooks/useRowSwipe";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatDate, formatShortDate } from "../../utils/format";
import { ActiveRowProvider } from "../ActiveRowProvider";
import { ConfirmDialog } from "../ConfirmDialog";
import { FloatingPanel } from "../FloatingPanel";
import { Button } from "../form";
import { Modal } from "../Modal";
import { useClaimActiveRow } from "../useClaimActiveRow";
import {
  MortgagePaymentEditModal,
  type ChargeSplitUpdate,
} from "./MortgagePaymentEditModal";

// Per-property payments view: every recorded mortgage payment, grouped by
// the monthly charge it came from so the split across the mortgages is
// visible at a glance. Each mortgage's share is its own row with edit and
// delete affordances — editing one share re-balances the charge (handled by
// the edit modal), deleting removes that single record.

type Props = {
  open: boolean;
  property: Property | null;
  settings: Settings;
  // The account the property's mortgages are paid from, when bound — used
  // to label the original bank transaction in the per-charge popover.
  account: Account | null;
  // Bank-history entries keyed by id for the property's account, so a
  // charge group can resolve the original transaction it was split from
  // (its `sourceHistoryId`) for the popover. Empty when the account has no
  // history (or no account is bound).
  sourceTransactions: Map<string, HistoryEntry>;
  onClose: () => void;
  onSetChargeSplit: (updates: ChargeSplitUpdate[]) => void;
  onDeletePayment: (mortgageId: string, paymentId: string) => void;
  onDeleteAll: () => void;
};

// A snapshot of the row queued for deletion — held by value (not by
// reference into `property`) so the confirm copy survives the re-render
// the delete itself triggers.
type PendingDelete = {
  mortgageId: string;
  paymentId: string;
  mortgageName: string;
  date: string;
  amount: number;
};

export function MortgagePaymentsModal({
  open,
  property,
  settings,
  account,
  sourceTransactions,
  onClose,
  onSetChargeSplit,
  onDeletePayment,
  onDeleteAll,
}: Props) {
  const t = useT();
  const lang = useLang();

  const groups = useMemo(
    () => (property ? groupPaymentsByCharge(property) : []),
    [property],
  );

  // Loans whose recorded amortisation doesn't reconcile with the drop from
  // the original loan to the current balance — surfaced as a footer so a
  // missing payment (or a stale balance) is visible. A sub-currency-unit
  // gap is just percent-mode rounding, so only ≥ 1 differences show.
  const unaccounted = useMemo(
    () =>
      (property ? reconcileMortgageAmortization(property) : []).filter(
        (r) => Math.abs(r.unaccounted) >= 1,
      ),
    [property],
  );

  const [editing, setEditing] = useState<{
    key: string;
    mortgageId: string;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );
  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false);

  useResetOnOpen(open, property?.id, () => {
    setEditing(null);
    setPendingDelete(null);
    setConfirmingDeleteAll(false);
  });

  const editingGroup = editing
    ? (groups.find((g) => g.key === editing.key) ?? null)
    : null;

  if (!open || !property) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="mortgage-payments-title"
      size="max-w-2xl"
      fixedHeight
    >
      <Modal.Header
        icon={<ReceiptText size={14} aria-hidden focusable={false} />}
        title={t("properties.paymentsTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        {groups.length === 0 ? (
          <p className="m-0 py-6 text-center text-sm text-muted">
            {t("properties.paymentsEmpty")}
          </p>
        ) : (
          <ActiveRowProvider>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {groups.map((group) => (
                <li
                  key={group.key}
                  className="overflow-clip rounded border border-line bg-surface-2"
                >
                  <MortgageChargeHeader
                    group={group}
                    settings={settings}
                    account={account}
                    entry={
                      group.sourceHistoryId
                        ? (sourceTransactions.get(group.sourceHistoryId) ??
                          null)
                        : null
                    }
                  />
                  <table className="swipe-table mortgage-payments-table w-full border-collapse text-sm">
                    <thead>
                      <tr className="text-muted">
                        <th
                          className="w-full px-2.5 py-1 text-left font-normal"
                          title={t("properties.loanColumn")}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Landmark
                              size={13}
                              className="shrink-0 text-accent"
                              aria-label={t("properties.loanColumn")}
                              focusable={false}
                            />
                            <span className="hidden md:inline">
                              {t("properties.loanColumn")}
                            </span>
                          </span>
                        </th>
                        <th
                          className="px-1 py-1 text-left font-normal"
                          title={t("properties.amortShort")}
                        >
                          <span className="inline-flex items-center justify-start">
                            <TrendingDown
                              size={13}
                              className="shrink-0 text-accent"
                              aria-label={t("properties.amortShort")}
                              focusable={false}
                            />
                          </span>
                        </th>
                        <th
                          className="px-1 py-1 text-left font-normal"
                          title={t("properties.interestShort")}
                        >
                          <span className="inline-flex items-center justify-start">
                            <Percent
                              size={13}
                              className="shrink-0 text-accent"
                              aria-label={t("properties.interestShort")}
                              focusable={false}
                            />
                          </span>
                        </th>
                        <th
                          className="px-1 py-1 text-left font-normal"
                          title={t("properties.paymentAmount")}
                        >
                          <span className="inline-flex items-center justify-start">
                            <Coins
                              size={13}
                              className="shrink-0 text-accent"
                              aria-label={t("properties.paymentAmount")}
                              focusable={false}
                            />
                          </span>
                        </th>
                        <th
                          className="swipe-action-cell mortgage-payments-action-cell w-32 px-2.5 py-1 text-right font-normal"
                          title={t("properties.actionsColumn")}
                        >
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <Settings2
                              size={13}
                              className="shrink-0 text-accent"
                              aria-label={t("properties.actionsColumn")}
                              focusable={false}
                            />
                            <span className="hidden md:inline">
                              {t("properties.actionsColumn")}
                            </span>
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((item) => (
                        <MortgagePaymentRow
                          key={item.payment.id}
                          item={item}
                          settings={settings}
                          onEdit={() =>
                            setEditing({
                              key: group.key,
                              mortgageId: item.mortgage.id,
                            })
                          }
                          onDelete={() =>
                            setPendingDelete({
                              mortgageId: item.mortgage.id,
                              paymentId: item.payment.id,
                              mortgageName: item.mortgage.name,
                              date: item.payment.date,
                              amount: item.payment.amount,
                            })
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </li>
              ))}
            </ul>
          </ActiveRowProvider>
        )}

        {unaccounted.length > 0 && (
          <section className="mt-3 overflow-clip rounded border border-line bg-surface-2">
            <div className="flex items-center gap-1.5 border-b border-line bg-surface-3 px-2.5 py-1.5">
              <Scale
                size={13}
                className="text-muted"
                aria-hidden
                focusable={false}
              />
              <span className="text-xs font-bold tracking-wider text-muted uppercase">
                {t("properties.unaccountedTitle")}
              </span>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {unaccounted.map((r) => (
                <li
                  key={r.mortgage.id}
                  className="flex items-baseline justify-between gap-2 border-t border-line px-2.5 py-1.5 text-sm first:border-t-0"
                >
                  <span className="min-w-0 truncate text-fg">
                    {r.mortgage.name}
                  </span>
                  <span className="whitespace-nowrap tabular-nums text-negative">
                    {formatBalance(r.unaccounted, settings, {
                      neverAbbreviate: true,
                    })}
                  </span>
                </li>
              ))}
            </ul>
            <p className="m-0 border-t border-line px-2.5 py-1.5 text-xs text-muted">
              {t("properties.unaccountedHint")}
            </p>
          </section>
        )}
      </Modal.Body>

      {groups.length > 0 && (
        <Modal.Footer className="justify-start">
          <Button
            variant="danger"
            withIcon
            onClick={() => setConfirmingDeleteAll(true)}
          >
            <Trash2 size={16} aria-hidden focusable={false} />
            {t("properties.deleteAllPayments")}
          </Button>
        </Modal.Footer>
      )}

      <MortgagePaymentEditModal
        open={editingGroup !== null}
        group={editingGroup}
        mortgageId={editing?.mortgageId ?? null}
        settings={settings}
        onClose={() => setEditing(null)}
        onSubmit={(updates) => {
          onSetChargeSplit(updates);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("properties.deletePaymentTitle")}
        description={
          pendingDelete
            ? t("properties.deletePaymentConfirm", {
                name: pendingDelete.mortgageName,
                date: formatShortDate(
                  pendingDelete.date,
                  settings.shortDateFormat,
                  lang,
                ),
                amount: formatBalance(pendingDelete.amount, settings, {
                  neverAbbreviate: true,
                }),
              })
            : null
        }
        actions={[
          {
            label: t("properties.delete"),
            tone: "danger",
            onSelect: () => {
              if (pendingDelete)
                onDeletePayment(
                  pendingDelete.mortgageId,
                  pendingDelete.paymentId,
                );
              setPendingDelete(null);
            },
          },
        ]}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={confirmingDeleteAll}
        title={t("properties.deleteAllPaymentsTitle")}
        description={t("properties.deleteAllPaymentsConfirm", {
          name: property.name,
        })}
        actions={[
          {
            label: t("properties.delete"),
            tone: "danger",
            onSelect: () => {
              onDeleteAll();
              setConfirmingDeleteAll(false);
            },
          },
        ]}
        onCancel={() => setConfirmingDeleteAll(false)}
      />
    </Modal>
  );
}

// The popover anchors below the charge header bar.
const SOURCE_POPOVER_PLACEMENT: FloatingPlacement = {
  width: { kind: "max", maxPx: 320 },
  anchor: "left",
  coordinateSpace: "viewport",
};

type ChargeHeaderProps = {
  group: MortgageChargeGroup;
  settings: Settings;
  account: Account | null;
  // The bank transaction this charge was split from, when it's still in the
  // account's history. `null` for hand-entered charges (no `sourceHistoryId`)
  // or when the source entry has since been removed — the header is then a
  // plain, non-interactive bar.
  entry: HistoryEntry | null;
};

// The date + total bar atop each charge. When the originating bank
// transaction is known it becomes a button that reveals the original
// transaction in a popover (reusing the shared `FloatingPanel`), so the
// user can trace a split back to what the bank actually charged.
function MortgageChargeHeader({
  group,
  settings,
  account,
  entry,
}: ChargeHeaderProps) {
  const t = useT();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  const dateText = formatDate(group.date, settings.dateFormat, lang);
  const totalText = formatBalance(group.total, settings, {
    neverAbbreviate: true,
  });

  const barInner = (
    <>
      <span className="flex items-center gap-1.5">
        {entry && (
          <ReceiptText
            size={12}
            className="shrink-0 text-meta"
            aria-hidden
            focusable={false}
          />
        )}
        <span className="tabular-nums text-muted">{dateText}</span>
      </span>
      <span className="tabular-nums font-bold text-fg-bright">{totalText}</span>
    </>
  );

  if (!entry) {
    return (
      <div className="flex items-baseline justify-between gap-2 border-b border-line bg-surface-3 px-2.5 py-1.5 text-xs">
        {barInner}
      </div>
    );
  }

  return (
    <div ref={triggerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("properties.sourceTransactionShow")}
        className="flex w-full cursor-pointer items-baseline justify-between gap-2 border-0 border-b border-line bg-surface-3 px-2.5 py-1.5 text-left text-xs hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        {barInner}
      </button>
      <FloatingPanel
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        placement={SOURCE_POPOVER_PLACEMENT}
      >
        <div className="flex flex-col gap-2 p-3 text-sm">
          <span className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-muted uppercase">
            <ReceiptText
              size={13}
              className="shrink-0 text-accent"
              aria-hidden
              focusable={false}
            />
            {t("properties.sourceTransactionTitle")}
          </span>
          <p className="m-0 font-bold break-words text-fg-bright">
            {entry.description}
          </p>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted">{t("properties.paymentDate")}</dt>
            <dd className="m-0 text-right tabular-nums text-fg">
              {formatShortDate(entry.date, settings.shortDateFormat, lang)}
            </dd>
            <dt className="text-muted">{t("properties.paymentAmount")}</dt>
            <dd className="m-0 text-right tabular-nums text-fg">
              {formatBalance(entry.amount, settings, { neverAbbreviate: true })}
            </dd>
            {account && (
              <>
                <dt className="text-muted">{t("properties.accountLabel")}</dt>
                <dd className="m-0 min-w-0 truncate text-right text-fg">
                  {account.name}
                </dd>
              </>
            )}
          </dl>
        </div>
      </FloatingPanel>
    </div>
  );
}

type RowProps = {
  item: MortgageChargeItem;
  settings: Settings;
  onEdit: () => void;
  onDelete: () => void;
};

// One mortgage's share within a charge. Desktop keeps the edit / delete
// icons inline in the trailing column; on mobile the row swipes left to
// reveal them from behind, mirroring the budget / accounts / items /
// salary tables (see the `.mortgage-payments-table` rules in
// styles/components.css).
function MortgagePaymentRowImpl({
  item,
  settings,
  onEdit,
  onDelete,
}: RowProps) {
  const t = useT();
  const { swiped, setSwiped, touchHandlers } = useRowSwipe();
  // A swiped row exposes edit / delete; claim the active-row slot so a tap
  // elsewhere only retracts the swipe instead of also firing the control
  // underneath.
  useClaimActiveRow(item.payment.id, swiped, () => setSwiped(false));
  const split = splitRecordedPayment(item.mortgage, item.payment);

  return (
    <tr
      className={`border-t border-line${swiped ? " is-swiped" : ""}`}
      data-row-id={item.payment.id}
      data-swipe-handled
      {...touchHandlers}
    >
      <td className="px-2.5 py-1.5 text-fg">
        <span className="block truncate">{item.mortgage.name}</span>
      </td>
      <td className="px-1 py-1.5 text-left text-xs whitespace-nowrap tabular-nums text-muted">
        {formatBalance(split.amortization, settings, {
          neverAbbreviate: true,
        })}
      </td>
      <td className="px-1 py-1.5 text-left text-xs whitespace-nowrap tabular-nums text-muted">
        {formatBalance(split.interest, settings, {
          neverAbbreviate: true,
        })}
      </td>
      <td className="px-1 py-1.5 text-left whitespace-nowrap tabular-nums text-fg-bright">
        {formatBalance(item.payment.amount, settings, {
          neverAbbreviate: true,
        })}
      </td>
      <td className="swipe-action-cell mortgage-payments-action-cell w-32 p-0 align-middle">
        <div className="flex h-full w-full items-stretch justify-end">
          <button
            type="button"
            onClick={() => {
              setSwiped(false);
              onEdit();
            }}
            aria-label={t("properties.editPayment")}
            className="action-btn action-btn-pen inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
          >
            <Pencil size={16} aria-hidden focusable={false} />
          </button>
          <button
            type="button"
            onClick={() => {
              setSwiped(false);
              onDelete();
            }}
            aria-label={t("properties.deletePayment")}
            className="action-btn action-btn-delete inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-danger"
          >
            <Trash2 size={16} aria-hidden focusable={false} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// Memoised so a swipe on one row doesn't re-render every sibling.
const MortgagePaymentRow = memo(MortgagePaymentRowImpl);
