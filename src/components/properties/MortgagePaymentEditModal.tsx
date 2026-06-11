import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";

import {
  splitPaymentAcrossMortgages,
  type MortgageChargeGroup,
} from "../../data/finance/payment";
import type { Settings } from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import {
  formatAmountForInput,
  formatBalance,
  parseAmount,
} from "../../utils/format";
import { Button, ClearableInput, DATE_INPUT_CLASS } from "../form";
import { Modal } from "../Modal";

// Edit one mortgage's share within a charge. The charge total is fixed
// (it's what the bank drew), so pinning this mortgage's amount re-splits
// the remainder across the other mortgages in the charge — amortisation
// first, then interest, via `splitPaymentAcrossMortgages` — and a live
// preview shows that re-balance before saving. A date change applies to the
// whole charge (one transaction, one date). On save the full new split for
// the charge is handed up as `updates`. A single-mortgage charge has no
// siblings, so the amount just corrects that one payment.

export type ChargeSplitUpdate = {
  mortgageId: string;
  paymentId: string;
  amount: number;
  date: string;
};

type Props = {
  open: boolean;
  group: MortgageChargeGroup | null;
  mortgageId: string | null;
  settings: Settings;
  onClose: () => void;
  onSubmit: (updates: ChargeSplitUpdate[]) => void;
};

export function MortgagePaymentEditModal({
  open,
  group,
  mortgageId,
  settings,
  onClose,
  onSubmit,
}: Props) {
  const t = useT();

  const editing =
    group && mortgageId
      ? (group.items.find((i) => i.mortgage.id === mortgageId) ?? null)
      : null;
  const siblings = useMemo(
    () =>
      group && mortgageId
        ? group.items.filter((i) => i.mortgage.id !== mortgageId)
        : [],
    [group, mortgageId],
  );
  const hasSiblings = siblings.length > 0;
  const total = group?.total ?? 0;

  const [amountText, setAmountText] = useState("");
  const [dateText, setDateText] = useState("");

  useResetOnOpen(open, editing?.payment.id, () => {
    setAmountText(
      editing ? formatAmountForInput(editing.payment.amount, settings) : "",
    );
    setDateText(editing?.payment.date ?? "");
  });

  const parsed = parseAmount(amountText);
  // Clamp the pinned share to the charge so siblings never go negative.
  // A single-mortgage charge has no fixed sibling total, so any
  // non-negative amount is allowed (it becomes the whole charge).
  const pinned =
    parsed === null
      ? null
      : hasSiblings
        ? Math.min(Math.max(parsed, 0), total)
        : Math.max(parsed, 0);

  // The siblings' re-balanced shares, previewed live and written on save.
  const siblingShares = useMemo(() => {
    if (pinned === null || !hasSiblings) return new Map<string, number>();
    return splitPaymentAcrossMortgages(
      siblings.map((s) => s.mortgage),
      total - pinned,
      dateText,
    );
  }, [pinned, hasSiblings, siblings, total, dateText]);

  if (!open || !editing) return null;

  const handleSubmit = () => {
    if (pinned === null) return;
    const updates: ChargeSplitUpdate[] = [
      {
        mortgageId: editing.mortgage.id,
        paymentId: editing.payment.id,
        amount: pinned,
        date: dateText,
      },
      ...siblings.map((s) => ({
        mortgageId: s.mortgage.id,
        paymentId: s.payment.id,
        amount: siblingShares.get(s.mortgage.id) ?? 0,
        date: dateText,
      })),
    ];
    onSubmit(updates);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="edit-mortgage-payment-title"
      size="max-w-md"
    >
      <Modal.Header
        icon={<Pencil size={14} aria-hidden focusable={false} />}
        title={t("properties.editPayment")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="grid gap-3">
          <div className="truncate text-sm font-bold text-fg-bright">
            {editing.mortgage.name}
          </div>
          {hasSiblings && (
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted">{t("properties.chargeTotal")}</span>
              <span className="tabular-nums text-fg">
                {formatBalance(total, settings, { neverAbbreviate: true })}
              </span>
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.paymentDate")}
            </span>
            <input
              type="date"
              value={dateText}
              onChange={(e) => setDateText(e.target.value)}
              className={DATE_INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.paymentAmount")}
            </span>
            <ClearableInput
              value={amountText}
              onValueChange={setAmountText}
              inputMode="decimal"
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </label>
          {hasSiblings && (
            <fieldset className="flex flex-col gap-1.5 rounded border border-line bg-surface-3 p-3">
              <legend className="px-1 text-xs text-muted">
                {t("properties.paymentRebalanceHint", {
                  total: formatBalance(total, settings, {
                    neverAbbreviate: true,
                  }),
                })}
              </legend>
              {siblings.map((s) => (
                <div
                  key={s.mortgage.id}
                  className="flex items-baseline justify-between gap-2 text-sm"
                >
                  <span className="min-w-0 truncate text-fg">
                    {s.mortgage.name}
                  </span>
                  <span className="tabular-nums text-fg-bright">
                    {formatBalance(
                      siblingShares.get(s.mortgage.id) ?? 0,
                      settings,
                      {
                        neverAbbreviate: true,
                      },
                    )}
                  </span>
                </div>
              ))}
            </fieldset>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={pinned === null}
        >
          {t("common.save")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
