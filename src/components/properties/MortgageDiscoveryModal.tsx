import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";

import {
  discoverMortgagePayments,
  type MortgagePaymentSeries,
} from "../../data/property-mortgage/discovery";
import { newId } from "../../data/sheet";
import type {
  HistoryEntry,
  Mortgage,
  MortgagePayment,
  Settings,
} from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import { formatBalance } from "../../utils/format";
import { Button } from "../form";
import { Modal } from "../Modal";

// The guided "Find mortgage payments" walk. Scans the mortgage's bound
// account history for recurring monthly outflows and lets the user map
// one as the payment (amortisation) charge and, optionally, a second as a
// separate interest charge — then adds the per-month payments. Mirrors
// the salary "Find salaries" walk, adapted to outflows and the
// principal / interest split.
//
// `centered`: the walk is all selection buttons, no soft-keyboard inputs.

type Props = {
  open: boolean;
  mortgage: Mortgage | null;
  history: Record<string, HistoryEntry[]>;
  settings: Settings;
  onClose: () => void;
  onAdd: (payments: MortgagePayment[]) => void;
};

export function MortgageDiscoveryModal({
  open,
  mortgage,
  history,
  settings,
  onClose,
  onAdd,
}: Props) {
  const t = useT();
  const [principalKey, setPrincipalKey] = useState<string | null>(null);
  const [interestKey, setInterestKey] = useState<string | null>(null);

  const accountId = mortgage?.accountId ?? null;

  const result = useMemo(() => {
    if (!accountId) return { series: [] };
    return discoverMortgagePayments({ entries: history[accountId] ?? [] });
  }, [accountId, history]);

  useResetOnOpen(open, mortgage?.id, () => {
    // Pre-select the highest-confidence series as the likely payment.
    setPrincipalKey(result.series[0]?.key ?? null);
    setInterestKey(null);
  });

  // Bank entries already backing a payment on this mortgage — skip those
  // months so the same charge isn't offered twice.
  const addedSourceIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of mortgage?.payments ?? []) {
      if (p.sourceHistoryId) set.add(p.sourceHistoryId);
      if (p.interestSourceHistoryId) set.add(p.interestSourceHistoryId);
    }
    return set;
  }, [mortgage?.payments]);

  const principalSeries =
    result.series.find((s) => s.key === principalKey) ?? null;
  const interestSeries =
    result.series.find((s) => s.key === interestKey) ?? null;

  // Build the per-month payments from the selected series, splitting into
  // "fresh" (will be added) and "already added" (dedup) for display.
  const { fresh, alreadyAdded } = useMemo(() => {
    const freshPayments: MortgagePayment[] = [];
    let added = 0;
    if (!principalSeries) return { fresh: freshPayments, alreadyAdded: added };
    const interestByMonth = new Map(
      (interestSeries?.months ?? []).map((m) => [m.monthKey, m]),
    );
    for (const month of principalSeries.months) {
      if (addedSourceIds.has(month.entryId)) {
        added++;
        continue;
      }
      const interest = interestByMonth.get(month.monthKey);
      const payment: MortgagePayment = {
        id: newId(),
        date: month.date,
        principal: month.amount,
        interest: interest?.amount ?? 0,
        sourceHistoryId: month.entryId,
      };
      if (interest) payment.interestSourceHistoryId = interest.entryId;
      freshPayments.push(payment);
    }
    return { fresh: freshPayments, alreadyAdded: added };
  }, [principalSeries, interestSeries, addedSourceIds]);

  if (!open || !mortgage) return null;

  const hasAccount = accountId !== null;
  const hasSeries = result.series.length > 0;

  function handleAdd() {
    if (fresh.length === 0) return;
    onAdd(fresh);
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="mortgage-discovery-modal-title"
      size="max-w-md"
      centered
    >
      <Modal.Header
        icon={<Search size={14} aria-hidden focusable={false} />}
        title={t("properties.findTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        {!hasAccount ? (
          <p className="m-0 text-sm text-muted">
            {t("properties.findNoAccount")}
          </p>
        ) : !hasSeries ? (
          <p className="m-0 text-sm text-muted">
            {t("properties.findNoneFound")}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <SeriesPicker
              label={t("properties.findPickPrincipal")}
              series={result.series}
              value={principalKey}
              settings={settings}
              onPick={setPrincipalKey}
            />
            <SeriesPicker
              label={t("properties.findPickInterest")}
              series={result.series.filter((s) => s.key !== principalKey)}
              value={interestKey}
              settings={settings}
              noneLabel={t("properties.findNoInterest")}
              onPick={setInterestKey}
            />

            <div className="flex flex-col gap-1 rounded border border-line bg-surface-2 px-3 py-2">
              <span className="text-xs font-bold tracking-wider uppercase text-muted">
                {t("properties.findPreview")}
              </span>
              {!principalSeries ? (
                <span className="text-xs text-muted">
                  {t("properties.findEmptySelection")}
                </span>
              ) : (
                <span className="text-sm text-fg-bright">
                  {fresh.length === 1
                    ? t("properties.findMonthsOne", { count: fresh.length })
                    : t("properties.findMonthsOther", { count: fresh.length })}
                  {alreadyAdded > 0 && (
                    <span className="text-muted">
                      {" · "}
                      {t("properties.findAlreadyAdded")} ({alreadyAdded})
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={handleAdd}
          disabled={fresh.length === 0}
        >
          {fresh.length === 1
            ? t("properties.findAddOne", { count: fresh.length })
            : t("properties.findAddOther", { count: fresh.length })}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function SeriesPicker({
  label,
  series,
  value,
  settings,
  noneLabel,
  onPick,
}: {
  label: string;
  series: readonly MortgagePaymentSeries[];
  value: string | null;
  settings: Settings;
  // When provided, a leading "none" option is offered (interest is
  // optional — a combined charge has no separate interest series).
  noneLabel?: string;
  onPick: (key: string | null) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-bold tracking-wider uppercase text-muted">
        {label}
      </span>
      <ul className="m-0 flex list-none flex-col gap-1 p-0" role="listbox">
        {noneLabel !== undefined && (
          <li>
            <button
              type="button"
              role="option"
              aria-selected={value === null}
              onClick={() => onPick(null)}
              className="flex w-full cursor-pointer items-center justify-between gap-2 rounded border border-line bg-surface-2 px-2.5 py-2 text-left text-sm text-muted hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <span className="flex-1 truncate">{noneLabel}</span>
              {value === null && (
                <Check
                  size={14}
                  className="shrink-0 text-accent"
                  aria-hidden
                  focusable={false}
                />
              )}
            </button>
          </li>
        )}
        {series.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              role="option"
              aria-selected={s.key === value}
              onClick={() => onPick(s.key)}
              className="flex w-full cursor-pointer items-center justify-between gap-2 rounded border border-line bg-surface-2 px-2.5 py-2 text-left text-sm text-fg hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-fg-bright">{s.label}</span>
                <span className="text-xs text-muted">
                  {formatBalance(s.suggestedAmount, settings, {
                    neverAbbreviate: true,
                  })}
                  {" · "}
                  {s.months.length === 1
                    ? t("properties.findMonthsOne", { count: s.months.length })
                    : t("properties.findMonthsOther", {
                        count: s.months.length,
                      })}
                </span>
              </span>
              {s.key === value && (
                <Check
                  size={14}
                  className="shrink-0 text-accent"
                  aria-hidden
                  focusable={false}
                />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
