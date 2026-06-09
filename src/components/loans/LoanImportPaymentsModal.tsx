import { useMemo, useState } from "react";
import { Download } from "lucide-react";

import {
  findLoanPaymentCandidates,
  type LoanPaymentCandidate,
} from "../../data/loans/candidates";
import type { Loan, Settings, UserData } from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatDate } from "../../utils/format";
import { Button, Checkbox } from "../form";
import { Modal } from "../Modal";
import { LOAN_KIND_LABEL_KEY } from "./loan-kind";

// The guided half of loan payment import: every bank entry typed with the
// loan kind's preset type (or matching the loan's learned patterns) that
// isn't already recorded, presented as tick-rows. Importing records the
// ticked entries as payments AND remembers their bank descriptions so the
// next statement import auto-attaches matching charges silently.
//
// `centered`: checkbox rows only — nothing opens the soft keyboard.

type Props = {
  open: boolean;
  loan: Loan | null;
  data: UserData;
  settings: Settings;
  onClose: () => void;
  onImport: (loanId: string, selected: LoanPaymentCandidate[]) => void;
};

export function LoanImportPaymentsModal({
  open,
  loan,
  data,
  settings,
  onClose,
  onImport,
}: Props) {
  const t = useT();
  const lang = useLang();
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());

  // Default-ticked: a fresh open starts with everything selected.
  useResetOnOpen(open, loan?.id ?? null, () => {
    setExcluded(new Set());
  });

  const candidates = useMemo(
    () => (open && loan ? findLoanPaymentCandidates(loan, data) : []),
    [open, loan, data],
  );

  // Bucket id → display name (accounts and savings share the id-space).
  const accountNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const account of data.accounts) m.set(account.id, account.name);
    for (const saving of data.savings) m.set(saving.id, saving.name);
    return m;
  }, [data.accounts, data.savings]);

  if (!open || !loan) return null;

  const selected = candidates.filter((c) => !excluded.has(c.entry.id));
  const allSelected = selected.length === candidates.length;

  function toggle(entryId: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  function toggleAll() {
    setExcluded(
      allSelected ? new Set(candidates.map((c) => c.entry.id)) : new Set(),
    );
  }

  function handleImport() {
    if (!loan || selected.length === 0) return;
    onImport(loan.id, selected);
    onClose();
  }

  return (
    <Modal
      open
      centered
      onClose={onClose}
      labelledBy="loan-import-payments-title"
      size="max-w-md"
    >
      <Modal.Header
        icon={<Download size={14} aria-hidden focusable={false} />}
        title={t("loansSheet.importTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          {candidates.length === 0 ? (
            <p className="m-0 text-sm text-muted">
              {t("loansSheet.importEmpty", {
                type: t(LOAN_KIND_LABEL_KEY[loan.kind]),
              })}
            </p>
          ) : (
            <>
              <p className="m-0 text-xs text-muted">
                {t("loansSheet.importHint", { name: loan.name })}
              </p>
              <div className="flex items-center justify-between">
                <Checkbox
                  checked={allSelected}
                  onChange={toggleAll}
                  label={t("loansSheet.selectAll")}
                />
                <span className="text-xs text-muted tabular-nums">
                  {selected.length}/{candidates.length}
                </span>
              </div>
              <ul className="m-0 flex max-h-80 list-none flex-col gap-1 overflow-y-auto p-0">
                {candidates.map(({ accountId, entry }) => (
                  <li key={entry.id}>
                    <Checkbox
                      checked={!excluded.has(entry.id)}
                      onChange={() => toggle(entry.id)}
                      className="w-full rounded border border-line bg-surface-2 px-2 py-1.5 hover:bg-surface"
                      label={
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm text-fg-bright">
                              {entry.userDescription ?? entry.description}
                            </span>
                            <span className="truncate text-xs text-muted">
                              {formatDate(
                                entry.date,
                                settings.dateFormat,
                                lang,
                              )}
                              {" · "}
                              {accountNames.get(accountId) ?? accountId}
                            </span>
                          </span>
                          <span className="shrink-0 font-mono text-xs text-fg tabular-nums">
                            {formatBalance(Math.abs(entry.amount), settings, {
                              neverAbbreviate: true,
                            })}
                          </span>
                        </span>
                      }
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={handleImport}
          disabled={selected.length === 0}
        >
          {selected.length === 1
            ? t("loansSheet.importCountOne", { n: selected.length })
            : t("loansSheet.importCountOther", { n: selected.length })}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
