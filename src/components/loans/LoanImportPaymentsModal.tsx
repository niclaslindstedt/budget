import { useMemo, useState } from "react";
import { Download } from "lucide-react";

import {
  findLoanPaymentCandidates,
  findSimilarLoanPaymentCandidates,
  type LoanPaymentCandidate,
} from "../../data/loans/candidates";
import { resolveLinkedMortgages } from "../../data/loans/balance";
import type { Loan, Settings, UserData } from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatDate } from "../../utils/format";
import { Button, Checkbox, Slider } from "../form";
import { Modal } from "../Modal";
import { LOAN_KIND_LABEL_KEY } from "./loan-kind";

// The guided half of loan payment import: every bank entry typed with the
// loan kind's preset type (or matching the loan's learned patterns) that
// isn't already recorded, presented as tick-rows — plus a suggestions
// section of entries sharing a bank-description key with a direct match
// and a similar amount (tolerance adjustable by slider), so typing ONE
// charge surfaces the loan's whole history. Importing records the ticked
// entries as payments AND remembers their bank descriptions so the next
// statement import attaches matching charges automatically; the two
// checkboxes optionally write the loan's type and name back onto the
// imported entries so the metadata improves both ways. Linked-mortgage
// loans keep the plain list — their payments belong to the Properties
// flow, which owns that metadata surface.
//
// `centered`: checkbox + slider rows only — nothing opens the soft
// keyboard.

// What the import should stamp back onto the imported entries' bank rows.
export type LoanImportOptions = {
  applyType: boolean;
  applyName: boolean;
};

const DEFAULT_TOLERANCE_PCT = 10;

type Props = {
  open: boolean;
  loan: Loan | null;
  data: UserData;
  settings: Settings;
  onClose: () => void;
  onImport: (
    loanId: string,
    selected: LoanPaymentCandidate[],
    options: LoanImportOptions,
  ) => void;
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
  const [tolerancePct, setTolerancePct] = useState(DEFAULT_TOLERANCE_PCT);
  const [applyType, setApplyType] = useState(true);
  const [applyName, setApplyName] = useState(true);

  // Default-ticked: a fresh open starts with everything selected.
  useResetOnOpen(open, loan?.id ?? null, () => {
    setExcluded(new Set());
    setTolerancePct(DEFAULT_TOLERANCE_PCT);
    setApplyType(true);
    setApplyName(true);
  });

  const direct = useMemo(
    () => (open && loan ? findLoanPaymentCandidates(loan, data) : []),
    [open, loan, data],
  );

  // Linked-mortgage loans skip suggestions and metadata stamps — their
  // payments (and the related metadata flows) belong to the Properties
  // sheet.
  const isLinked =
    open && loan !== null
      ? resolveLinkedMortgages(loan, data.properties) !== null
      : false;

  const suggested = useMemo(
    () =>
      open && loan && !isLinked
        ? findSimilarLoanPaymentCandidates(loan, data, direct, tolerancePct)
        : [],
    [open, loan, isLinked, data, direct, tolerancePct],
  );

  // Bucket id → display name (accounts and savings share the id-space).
  const accountNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const account of data.accounts) m.set(account.id, account.name);
    for (const saving of data.savings) m.set(saving.id, saving.name);
    return m;
  }, [data.accounts, data.savings]);

  if (!open || !loan) return null;

  const candidates = [...direct, ...suggested];
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
    onImport(loan.id, selected, {
      applyType: !isLinked && applyType,
      applyName: !isLinked && applyName,
    });
    onClose();
  }

  function candidateRow({ accountId, entry }: LoanPaymentCandidate) {
    return (
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
                  {formatDate(entry.date, settings.dateFormat, lang)}
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
    );
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
              <ul className="m-0 flex max-h-60 list-none flex-col gap-1 overflow-y-auto p-0">
                {direct.map(candidateRow)}
              </ul>
              {!isLinked && direct.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-line pt-3">
                  <span className="text-sm text-fg-bright">
                    {t("loansSheet.importSuggestedTitle")}
                  </span>
                  <p className="m-0 text-xs text-muted">
                    {t("loansSheet.importSuggestedHint")}
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 text-xs text-muted">
                      {t("loansSheet.importTolerance")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Slider
                        min={0}
                        max={50}
                        value={tolerancePct}
                        onChange={setTolerancePct}
                        ariaLabel={t("loansSheet.importTolerance")}
                        formatValueText={(v) => `±${v}%`}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right font-mono text-sm tabular-nums text-fg-bright">
                      ±{tolerancePct}%
                    </span>
                  </div>
                  {suggested.length === 0 ? (
                    <p className="m-0 text-xs text-muted">
                      {t("loansSheet.importSuggestedEmpty", {
                        pct: tolerancePct,
                      })}
                    </p>
                  ) : (
                    <ul className="m-0 flex max-h-60 list-none flex-col gap-1 overflow-y-auto p-0">
                      {suggested.map(candidateRow)}
                    </ul>
                  )}
                </div>
              )}
              {!isLinked && (
                <div className="flex flex-col gap-1.5 border-t border-line pt-3">
                  <Checkbox
                    checked={applyType}
                    onChange={() => setApplyType((v) => !v)}
                    label={t("loansSheet.importApplyType", {
                      type: t(LOAN_KIND_LABEL_KEY[loan.kind]),
                    })}
                  />
                  <Checkbox
                    checked={applyName}
                    onChange={() => setApplyName((v) => !v)}
                    label={t("loansSheet.importApplyName", {
                      name: loan.name,
                    })}
                  />
                </div>
              )}
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
