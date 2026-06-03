import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";

import { resolveMonthlyAmortization } from "../../data/property-mortgage/amortization";
import {
  discoverMortgagePayments,
  DEFAULT_MORTGAGE_TOLERANCE,
  monthsWithinBand,
  type MortgagePaymentSeries,
  type MortgageTarget,
  type MortgageTargets,
} from "../../data/property-mortgage/discovery";
import { resolveMonthlyInterest } from "../../data/property-mortgage/interest";
import { newId } from "../../data/sheet";
import type {
  HistoryEntry,
  Mortgage,
  MortgagePayment,
  Settings,
} from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatMonthLabel } from "../../utils/format";
import { Button, Slider } from "../form";
import { Modal } from "../Modal";

// The guided "Find mortgage payments" walk. Scans the mortgage's bound
// account history for recurring monthly outflows and matches them against
// the mortgage's known figures — the monthly interest (rate × balance) and
// the amortisation (primary sum), individually and combined — within a
// tunable ± band. The closest amount match is pre-selected; the user maps
// one series as the payment (amortisation) charge and, optionally, a
// second as a separate interest charge, then confirms adding that charge's
// pattern: N payments across M months, deduping months already recorded.
// Mirrors the salary "Find salaries" walk, adapted to outflows and the
// principal / interest split.
//
// `centered`: the walk is all selection controls, no soft-keyboard inputs.

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
  const lang = useLang();
  const [principalKey, setPrincipalKey] = useState<string | null>(null);
  const [interestKey, setInterestKey] = useState<string | null>(null);
  // Match-band half-width as a percentage; the data layer takes a fraction.
  const [tolerancePct, setTolerancePct] = useState(
    Math.round(DEFAULT_MORTGAGE_TOLERANCE * 100),
  );
  const tolerance = tolerancePct / 100;

  const accountId = mortgage?.accountId ?? null;

  // The mortgage's known monthly figures the scan matches charges against.
  const targets = useMemo<MortgageTargets>(
    () => ({
      interest: mortgage ? resolveMonthlyInterest(mortgage) : null,
      principal: mortgage ? resolveMonthlyAmortization(mortgage) : null,
    }),
    [mortgage],
  );

  const result = useMemo(() => {
    if (!accountId) return { series: [] };
    return discoverMortgagePayments({
      entries: history[accountId] ?? [],
      targets,
      tolerance,
    });
  }, [accountId, history, targets, tolerance]);

  useResetOnOpen(open, mortgage?.id, () => {
    // Pre-select the closest amount match (the combined or amortisation
    // charge) as the payment, and a distinct interest match — if one exists
    // — as the separate interest leg. Series are sorted matches-first, so
    // the first principal/combined match is also the closest.
    const principal =
      result.series.find(
        (s) =>
          s.matchedTarget === "combined" || s.matchedTarget === "principal",
      ) ?? result.series[0];
    setPrincipalKey(principal?.key ?? null);
    const interest = result.series.find(
      (s) => s.matchedTarget === "interest" && s.key !== principal?.key,
    );
    setInterestKey(interest?.key ?? null);
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

  // Build the per-month payments from the selected series. The picked
  // charge's pattern is its description plus an amount band: months that
  // stray outside ± tolerance of the typical charge are dropped (a stray
  // double-draw shouldn't ride in). Split into "fresh" (will be added) and
  // "already added" (dedup) for the confirmation summary.
  const preview = useMemo(() => {
    const freshPayments: MortgagePayment[] = [];
    const freshMonthKeys: string[] = [];
    let added = 0;
    if (!principalSeries)
      return { fresh: freshPayments, alreadyAdded: added, spanMonths: 0 };

    const interestByMonth = new Map(
      monthsWithinBand(
        interestSeries ?? { ...principalSeries, months: [] },
        interestSeries?.suggestedAmount ?? 0,
        tolerance,
      ).map((m) => [m.monthKey, m]),
    );
    const principalMonths = monthsWithinBand(
      principalSeries,
      principalSeries.suggestedAmount,
      tolerance,
    );

    for (const month of principalMonths) {
      if (addedSourceIds.has(month.entryId)) {
        added++;
        continue;
      }
      const interestMonth = interestByMonth.get(month.monthKey);
      let principal = month.amount;
      let interest = 0;
      let interestSourceId: string | undefined;
      if (interestMonth) {
        // Separate interest charge: this series is the amortisation leg.
        interest = interestMonth.amount;
        interestSourceId = interestMonth.entryId;
      } else if (
        principalSeries.matchedTarget === "combined" &&
        targets.interest !== null
      ) {
        // Combined charge: peel the known interest off the total, the rest
        // is amortisation.
        interest = Math.min(targets.interest, month.amount);
        principal = month.amount - interest;
      }
      const payment: MortgagePayment = {
        id: newId(),
        date: month.date,
        principal,
        interest,
        sourceHistoryId: month.entryId,
      };
      if (interestSourceId) payment.interestSourceHistoryId = interestSourceId;
      freshPayments.push(payment);
      freshMonthKeys.push(month.monthKey);
    }

    const sortedKeys = [...freshMonthKeys].sort();
    const spanMonths =
      sortedKeys.length === 0
        ? 0
        : monthSpan(sortedKeys[0], sortedKeys[sortedKeys.length - 1]);
    return { fresh: freshPayments, alreadyAdded: added, spanMonths };
  }, [principalSeries, interestSeries, addedSourceIds, targets, tolerance]);

  const { fresh, alreadyAdded, spanMonths } = preview;

  if (!open || !mortgage) return null;

  const hasAccount = accountId !== null;
  const hasSeries = result.series.length > 0;

  const firstFresh = fresh[0];
  const lastFresh = fresh[fresh.length - 1];

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

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold tracking-wider uppercase text-muted">
                  {t("properties.findToleranceLabel")}
                </span>
                <span className="text-sm text-fg-bright">
                  {t("properties.findToleranceValue", { pct: tolerancePct })}
                </span>
              </div>
              <Slider
                min={2}
                max={25}
                step={1}
                value={tolerancePct}
                onChange={setTolerancePct}
                ariaLabel={t("properties.findToleranceLabel")}
                formatValueText={(v) =>
                  t("properties.findToleranceValue", { pct: v })
                }
              />
              <span className="text-xs text-muted">
                {t("properties.findToleranceHint")}
              </span>
            </div>

            <div className="flex flex-col gap-1 rounded border border-line bg-surface-2 px-3 py-2">
              <span className="text-xs font-bold tracking-wider uppercase text-muted">
                {t("properties.findPreview")}
              </span>
              {!principalSeries ? (
                <span className="text-xs text-muted">
                  {t("properties.findEmptySelection")}
                </span>
              ) : (
                <>
                  <span className="text-xs text-muted">
                    {t("properties.findPatternHint")}
                  </span>
                  <span className="text-sm text-fg-bright">
                    {fresh.length === 1
                      ? t("properties.paymentsCountOne", {
                          count: fresh.length,
                        })
                      : t("properties.paymentsCountOther", {
                          count: fresh.length,
                        })}
                    {fresh.length > 0 && (
                      <>
                        {" · "}
                        {spanMonths === 1
                          ? t("properties.findSpanMonthsOne", {
                              count: spanMonths,
                            })
                          : t("properties.findSpanMonthsOther", {
                              count: spanMonths,
                            })}
                      </>
                    )}
                    {alreadyAdded > 0 && (
                      <span className="text-muted">
                        {" · "}
                        {t("properties.findAlreadyAdded")} ({alreadyAdded})
                      </span>
                    )}
                  </span>
                  {firstFresh && lastFresh && (
                    <span className="text-xs text-meta">
                      {t("properties.findRange", {
                        start: formatMonthLabel(
                          firstFresh.date.slice(0, 7),
                          lang,
                        ),
                        end: formatMonthLabel(lastFresh.date.slice(0, 7), lang),
                      })}
                    </span>
                  )}
                </>
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

// Calendar months from `first` to `last` "YYYY-MM" keys, inclusive.
function monthSpan(first: string, last: string): number {
  const fy = Number(first.slice(0, 4));
  const fm = Number(first.slice(5, 7));
  const ly = Number(last.slice(0, 4));
  const lm = Number(last.slice(5, 7));
  return (ly - fy) * 12 + (lm - fm) + 1;
}

const TARGET_KEY = {
  interest: "properties.findTargetInterest",
  principal: "properties.findTargetPrincipal",
  combined: "properties.findTargetCombined",
} as const satisfies Record<MortgageTarget, string>;

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
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-fg-bright">{s.label}</span>
                  <span
                    className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                      s.matchedTarget
                        ? "bg-accent/15 text-accent"
                        : "bg-surface-3 text-muted"
                    }`}
                  >
                    {s.matchedTarget
                      ? t(TARGET_KEY[s.matchedTarget])
                      : t("properties.findTargetRecurring")}
                  </span>
                </span>
                <span className="text-xs text-muted">
                  {formatBalance(s.suggestedAmount, settings, {
                    neverAbbreviate: true,
                  })}
                  {" · "}
                  {s.months.length === 1
                    ? t("properties.paymentsCountOne", {
                        count: s.months.length,
                      })
                    : t("properties.paymentsCountOther", {
                        count: s.months.length,
                      })}
                  {" · "}
                  {s.spanMonths === 1
                    ? t("properties.findSpanMonthsOne", { count: s.spanMonths })
                    : t("properties.findSpanMonthsOther", {
                        count: s.spanMonths,
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
