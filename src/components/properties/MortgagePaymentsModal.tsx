import { useMemo, useState } from "react";
import {
  Coins,
  Pencil,
  Percent,
  ReceiptText,
  Scale,
  TrendingDown,
  Trash2,
} from "lucide-react";

import {
  groupPaymentsByCharge,
  reconcileMortgageAmortization,
  splitRecordedPayment,
} from "../../data/property-mortgage/payment";
import type { Property, Settings } from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatShortDate } from "../../utils/format";
import { ConfirmDialog } from "../ConfirmDialog";
import { Button } from "../form";
import { Modal } from "../Modal";
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
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {groups.map((group) => (
              <li
                key={group.key}
                className="overflow-clip rounded border border-line bg-surface-2"
              >
                <div className="flex items-baseline justify-between gap-2 border-b border-line bg-surface-3 px-2.5 py-1.5 text-xs">
                  <span className="tabular-nums text-muted">
                    {formatShortDate(
                      group.date,
                      settings.shortDateFormat,
                      lang,
                    )}
                  </span>
                  <span className="tabular-nums font-bold text-fg-bright">
                    {formatBalance(group.total, settings, {
                      neverAbbreviate: true,
                    })}
                  </span>
                </div>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-muted">
                      <th className="px-2.5 py-1 text-left" />
                      <th
                        className="px-1 py-1 text-right font-normal"
                        title={t("properties.amortShort")}
                      >
                        <TrendingDown
                          size={13}
                          className="ml-auto"
                          aria-label={t("properties.amortShort")}
                          focusable={false}
                        />
                      </th>
                      <th
                        className="px-1 py-1 text-right font-normal"
                        title={t("properties.interestShort")}
                      >
                        <Percent
                          size={13}
                          className="ml-auto"
                          aria-label={t("properties.interestShort")}
                          focusable={false}
                        />
                      </th>
                      <th
                        className="px-1 py-1 text-right font-normal"
                        title={t("properties.paymentAmount")}
                      >
                        <Coins
                          size={13}
                          className="ml-auto"
                          aria-label={t("properties.paymentAmount")}
                          focusable={false}
                        />
                      </th>
                      <th className="px-2.5 py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => {
                      const split = splitRecordedPayment(
                        item.mortgage,
                        item.payment,
                      );
                      return (
                        <tr
                          key={item.payment.id}
                          className="border-t border-line"
                        >
                          <td className="px-2.5 py-1.5 text-fg">
                            {item.mortgage.name}
                          </td>
                          <td className="px-1 py-1.5 text-right text-xs whitespace-nowrap tabular-nums text-muted">
                            {formatBalance(split.amortization, settings, {
                              neverAbbreviate: true,
                            })}
                          </td>
                          <td className="px-1 py-1.5 text-right text-xs whitespace-nowrap tabular-nums text-muted">
                            {formatBalance(split.interest, settings, {
                              neverAbbreviate: true,
                            })}
                          </td>
                          <td className="px-1 py-1.5 text-right whitespace-nowrap tabular-nums text-fg-bright">
                            {formatBalance(item.payment.amount, settings, {
                              neverAbbreviate: true,
                            })}
                          </td>
                          <td className="px-2.5 py-1">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setEditing({
                                    key: group.key,
                                    mortgageId: item.mortgage.id,
                                  })
                                }
                                aria-label={t("properties.editPayment")}
                                className="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-fg"
                              >
                                <Pencil
                                  size={16}
                                  aria-hidden
                                  focusable={false}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setPendingDelete({
                                    mortgageId: item.mortgage.id,
                                    paymentId: item.payment.id,
                                    mortgageName: item.mortgage.name,
                                    date: item.payment.date,
                                    amount: item.payment.amount,
                                  })
                                }
                                aria-label={t("properties.deletePayment")}
                                className="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-danger"
                              >
                                <Trash2
                                  size={16}
                                  aria-hidden
                                  focusable={false}
                                />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </li>
            ))}
          </ul>
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
