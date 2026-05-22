import { useEffect, useMemo, useState } from "react";
import { Scissors } from "lucide-react";

import type { Account, HistoryEntry, Transaction } from "../data/types";
import { todayIso } from "../utils/date";
import { useT } from "../i18n";
import { Button } from "./form";
import { Modal } from "./Modal";

type Props = {
  open: boolean;
  account: Account | null;
  history: HistoryEntry[];
  transactions: Transaction[];
  onCancel: () => void;
  onConfirm: (cutoffDate: string) => void;
};

// "Cut" an account's history by dropping every bank-history entry and
// every transfer transaction dated strictly before `cutoffDate`. Used
// when an account's purpose has changed (e.g. a private account turning
// into a shared one) and the pre-cutoff stuff is no longer relevant.
export function CutAccountHistoryModal({
  open,
  account,
  history,
  transactions,
  onCancel,
  onConfirm,
}: Props) {
  const t = useT();
  const [cutoffDate, setCutoffDate] = useState("");

  useEffect(() => {
    if (open) setCutoffDate(todayIso());
  }, [open]);

  const historyToCut = useMemo(() => {
    if (!cutoffDate || !account) return 0;
    return history.filter((e) => e.date < cutoffDate).length;
  }, [history, cutoffDate, account]);

  const transactionsToCut = useMemo(() => {
    if (!cutoffDate || !account) return 0;
    return transactions.filter(
      (tx) =>
        (tx.fromAccountId === account.id || tx.toAccountId === account.id) &&
        tx.date < cutoffDate,
    ).length;
  }, [transactions, cutoffDate, account]);

  const totalToCut = historyToCut + transactionsToCut;
  const canCut = cutoffDate.length === 10 && totalToCut > 0;

  function handleConfirm() {
    if (!canCut) return;
    onConfirm(cutoffDate);
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      labelledBy="cut-account-history-title"
      size="max-w-md"
      scrollableBody={false}
      centered
    >
      <Modal.Header
        icon={<Scissors size={14} aria-hidden focusable={false} />}
        title={t("cutHistory.title", { name: account?.name ?? "" })}
        onClose={onCancel}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">{t("cutHistory.hint")}</p>

          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs text-muted">
              {t("cutHistory.cutoffDate")}
            </span>
            <input
              type="date"
              value={cutoffDate}
              onChange={(e) => setCutoffDate(e.target.value)}
              className="field-input min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-path"
            />
          </label>

          <div className="rounded border border-line bg-surface-2 px-3 py-2 text-sm">
            {cutoffDate.length !== 10 ? (
              <span className="text-muted">
                {t("cutHistory.pickDateFirst")}
              </span>
            ) : totalToCut === 0 ? (
              <span className="text-muted">
                {t("cutHistory.nothingToCut", { date: cutoffDate })}
              </span>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="text-fg">
                  {t("cutHistory.preview", { date: cutoffDate })}
                </div>
                <ul className="ml-4 list-disc text-muted">
                  <li>
                    {historyToCut === 1
                      ? t("cutHistory.previewHistoryOne", { n: historyToCut })
                      : t("cutHistory.previewHistoryOther", {
                          n: historyToCut,
                        })}
                  </li>
                  <li>
                    {transactionsToCut === 1
                      ? t("cutHistory.previewTransactionsOne", {
                          n: transactionsToCut,
                        })
                      : t("cutHistory.previewTransactionsOther", {
                          n: transactionsToCut,
                        })}
                  </li>
                </ul>
                <div className="mt-1 text-xs text-muted">
                  {t("cutHistory.irreversible")}
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="danger"
          withIcon
          onClick={handleConfirm}
          disabled={!canCut}
        >
          <Scissors size={14} aria-hidden focusable={false} />
          {t("cutHistory.confirm")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
