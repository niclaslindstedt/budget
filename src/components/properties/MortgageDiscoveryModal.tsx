import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Home, Search } from "lucide-react";

import {
  discoverMortgagePayments,
  DEFAULT_MORTGAGE_TOLERANCE,
  emptyMortgageDiagnostics,
  monthsWithinBand,
  type MortgagePaymentSeries,
} from "../../data/property-mortgage/discovery";
import {
  resolveMonthlyPaymentAt,
  splitPaymentAcrossMortgages,
} from "../../data/property-mortgage/payment";
import { PRESET_TYPE_MORTGAGE_ID } from "../../data/presets/types";
import { newId } from "../../data/sheet";
import type {
  Company,
  EntryType,
  HistoryEntry,
  MatchRule,
  MerchantHint,
  MortgagePayment,
  Property,
  Settings,
} from "../../data/types";
import { useResetOnOpen, type FloatingPlacement } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { formatBalance, formatMonthLabel } from "../../utils/format";
import { createLogger } from "../../utils/logger";
import { FloatingPanel } from "../FloatingPanel";
import { Button, Slider } from "../form";
import { Modal } from "../Modal";

// The guided "Find mortgage payments" walk, opened from the Properties
// sheet's "…" menu. A property's monthly mortgage cost is paid to the bank
// as a single transaction covering every loan against it, so the walk runs
// per property: pick the property, and it scans its mortgages' bound
// account history for the recurring combined charge — anchored on the
// charges the user tagged with one of the property's lenders or the
// Mortgage type, ranked by closeness to the expected total (the sum of
// every mortgage's amortisation + interest). Each found transaction is
// then split across the property's mortgages by their expected share at
// that month's rate, recording one payment per mortgage that adds up to
// exactly what was paid.
//
// `centered`: the walk is all selection controls, no soft-keyboard inputs.

// Diagnostics flow to the in-app Logs tab (Developer settings) so a user who
// reports "no matches" can capture exactly what the scan saw — the funnel
// (entries dropped as inflows / collapsed transfers / meaningless
// descriptions) and every grouped candidate with its amount, distance to the
// expected payment, and keep/drop reason.
const log = createLogger("mortgage-finder");

type Props = {
  open: boolean;
  // Which property to scan when the modal opens — the card that launched the
  // walk. The in-modal property picker can still switch to another property.
  initialPropertyId: string | null;
  properties: readonly Property[];
  history: Record<string, HistoryEntry[]>;
  merchantHints: Readonly<Record<string, MerchantHint>>;
  matchRules: readonly MatchRule[];
  companies: readonly Company[];
  types: readonly EntryType[];
  settings: Settings;
  onClose: () => void;
  onAdd: (
    propertyId: string,
    paymentsByMortgageId: Record<string, MortgagePayment[]>,
  ) => void;
};

export function MortgageDiscoveryModal({
  open,
  initialPropertyId,
  properties,
  history,
  merchantHints,
  matchRules,
  companies,
  types,
  settings,
  onClose,
  onAdd,
}: Props) {
  const t = useT();
  const lang = useLang();
  const [propertyId, setPropertyId] = useState<string | null>(
    initialPropertyId,
  );
  const [propertyPickerOpen, setPropertyPickerOpen] = useState(false);
  // null = "use the default (everything selected)"; a Set once the user
  // has toggled at least one group.
  const [selectedKeys, setSelectedKeys] = useState<Set<string> | null>(null);
  const [tolerancePct, setTolerancePct] = useState(
    Math.round(DEFAULT_MORTGAGE_TOLERANCE * 100),
  );
  const tolerance = tolerancePct / 100;

  // Resolve the chosen property against the live list (default to the
  // first), so an edit elsewhere doesn't strand a stale snapshot.
  const property =
    properties.find((p) => p.id === propertyId) ?? properties[0] ?? null;
  const mortgages = useMemo(() => property?.mortgages ?? [], [property]);

  // Snap to the launching card's property each time the walk opens; switching
  // property inside the modal (via the picker) still re-runs the per-property
  // reset below through `property?.id`.
  useResetOnOpen(open, initialPropertyId, () => {
    setPropertyId(initialPropertyId);
  });

  useResetOnOpen(open, property?.id, () => {
    setSelectedKeys(null);
    setTolerancePct(Math.round(DEFAULT_MORTGAGE_TOLERANCE * 100));
    setPropertyPickerOpen(false);
  });

  // The account the property's loans are paid from, and its history — a
  // property is paid to the bank as one charge covering every loan, so the
  // account is shared across the property's mortgages (`Property.accountId`).
  const entries = useMemo(
    () => (property?.accountId ? (history[property.accountId] ?? []) : []),
    [property, history],
  );

  const hasAccount = Boolean(property?.accountId);

  // Bank entries already backing a payment on any of the property's
  // mortgages — the fallback anchor and the months to skip.
  const addedSourceIds = useMemo(() => {
    const set = new Set<string>();
    for (const m of mortgages)
      for (const p of m.payments)
        if (p.sourceHistoryId) set.add(p.sourceHistoryId);
    return set;
  }, [mortgages]);

  // Expected figures from the loan terms, at today's rate — the combined
  // monthly total plus each mortgage's own, used to rank the likeliest
  // charge first.
  const targetAmounts = useMemo(() => {
    const today = todayIso();
    const each = mortgages.map((m) => resolveMonthlyPaymentAt(m, today));
    const combined = each.reduce((s, v) => s + v, 0);
    return [combined, ...each];
  }, [mortgages]);

  // Per-target schedules parallel to `targetAmounts`: when each loan started
  // being charged and how often. The finder reads these to tell how many
  // charges to expect since the loan began, so a clean run that covers only
  // part of that window isn't flagged "highly probable". Index 0 is the
  // combined charge — it recurs as often as the most frequent loan and starts
  // when the earliest one did.
  const targetSchedules = useMemo(() => {
    const each = mortgages.map((m) => ({
      startDate: m.loanStartDate ?? property?.purchaseDate,
      cadenceMonths: m.paymentCadenceMonths ?? 1,
    }));
    const starts = each
      .map((s) => s.startDate)
      .filter((d): d is string => d !== undefined);
    const combined = {
      startDate:
        starts.length > 0
          ? starts.reduce((a, b) => (a < b ? a : b))
          : property?.purchaseDate,
      cadenceMonths:
        each.length > 0 ? Math.min(...each.map((s) => s.cadenceMonths)) : 1,
    };
    return [combined, ...each];
  }, [mortgages, property]);

  const companyIds = useMemo(
    () => (property?.companyId ? [property.companyId] : []),
    [property],
  );

  const result = useMemo(() => {
    if (!property || !hasAccount)
      return {
        series: [],
        seed: "none" as const,
        diagnostics: emptyMortgageDiagnostics(),
      };
    return discoverMortgagePayments({
      entries,
      merchantHints,
      matchRules,
      companies,
      types,
      companyIds,
      mortgageTypeId: PRESET_TYPE_MORTGAGE_ID,
      seedEntryIds: [...addedSourceIds],
      fromDate: property.purchaseDate,
      toDate: property.soldDate,
      targetAmounts,
      targetSchedules,
    });
  }, [
    property,
    hasAccount,
    entries,
    merchantHints,
    matchRules,
    companies,
    types,
    companyIds,
    addedSourceIds,
    targetAmounts,
    targetSchedules,
  ]);

  // Mirror the scan funnel to the Logs tab whenever the inputs change while
  // the walk is open. One summary line plus a line per grouped candidate —
  // enough to tell a "no matches" report apart from "matched but filtered".
  useEffect(() => {
    if (!open || !property || !hasAccount) return;
    const d = result.diagnostics;
    // targets[0] is the combined expected monthly payment — the figure the
    // walk is hunting for.
    const expected = d.targetAmounts[0];
    log.info(
      `find "${property.name}": seed=${d.seed} series=${result.series.length} ` +
        `expectedPayment≈${expected === undefined ? "n/a" : Math.round(expected)} ` +
        `entries=${d.totalEntries} outflows=${d.outflowEntries} ` +
        `groups=${d.groupCount} tagged=${d.tagKeyCount} payments=${d.paymentKeyCount} ` +
        `skipped(hidden=${d.skippedHidden} collapsed=${d.skippedCollapsed} ` +
        `inflow=${d.skippedInflow} meaningless=${d.skippedMeaningless} ` +
        `salvaged=${d.salvagedByAmount}) ` +
        `targets=[${d.targetAmounts.map((a) => Math.round(a)).join(", ")}]`,
    );
    for (const c of d.candidates) {
      log.info(
        `  candidate "${c.label}": amount=${Math.round(c.suggestedAmount)} ` +
          `months=${c.monthCount} eligible=${c.eligibleMonthCount} ` +
          `delta=${c.targetDelta === undefined ? "n/a" : c.targetDelta.toFixed(3)} ` +
          `${c.regularCadence ? "cadence " : ""}${c.coversExpectedWindow ? "full-window " : "partial-window "}` +
          `${c.highlyProbable ? "highly-probable " : ""}` +
          `${c.synthetic ? "amount-grouped " : ""}-> ${c.outcome}`,
      );
    }
  }, [open, property, hasAccount, result]);

  // The pre-checked set when the user hasn't toggled anything yet
  // (`selectedKeys === null`). When the scan surfaces any "highly probable"
  // charge, pre-check only those — the steady, complete rhythm is the surest
  // sign they're the mortgage, so weaker candidates are opt-in rather than
  // opt-out. With no highly-probable hit, fall back to pre-checking every
  // charge found.
  const defaultSelectedKeys = useMemo(() => {
    const probable = result.series.filter((s) => s.highlyProbable);
    const source = probable.length > 0 ? probable : result.series;
    return new Set(source.map((s) => s.key));
  }, [result.series]);

  // Build the per-mortgage payments: each selected charge's months within
  // the band become a combined transaction, split across the property's
  // mortgages by their expected share at that month's rate.
  const preview = useMemo(() => {
    const byMortgage: Record<string, MortgagePayment[]> = {};
    const freshMonthKeys: string[] = [];
    let alreadyAdded = 0;
    const effectiveKeys = selectedKeys ?? defaultSelectedKeys;
    for (const series of result.series) {
      if (!effectiveKeys.has(series.key)) continue;
      for (const month of monthsWithinBand(
        series,
        series.suggestedAmount,
        tolerance,
      )) {
        if (addedSourceIds.has(month.entryId)) {
          alreadyAdded++;
          continue;
        }
        const split = splitPaymentAcrossMortgages(
          mortgages,
          month.amount,
          month.date,
        );
        for (const [mortgageId, amount] of split) {
          (byMortgage[mortgageId] ??= []).push({
            id: newId(),
            date: month.date,
            amount,
            sourceHistoryId: month.entryId,
          });
        }
        freshMonthKeys.push(month.monthKey);
      }
    }
    const sortedKeys = [...freshMonthKeys].sort();
    const spanMonths =
      sortedKeys.length === 0
        ? 0
        : monthSpan(sortedKeys[0], sortedKeys[sortedKeys.length - 1]);
    return {
      byMortgage,
      transactions: freshMonthKeys.length,
      alreadyAdded,
      spanMonths,
      firstMonth: sortedKeys[0],
      lastMonth: sortedKeys[sortedKeys.length - 1],
    };
  }, [
    result,
    selectedKeys,
    defaultSelectedKeys,
    addedSourceIds,
    tolerance,
    mortgages,
  ]);

  if (!open) return null;

  const {
    byMortgage,
    transactions,
    alreadyAdded,
    spanMonths,
    firstMonth,
    lastMonth,
  } = preview;

  function handleAdd() {
    if (!property || transactions === 0) return;
    onAdd(property.id, byMortgage);
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
        {!property ? (
          <p className="m-0 text-sm text-muted">
            {t("properties.findNoProperties")}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {properties.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold tracking-wider uppercase text-muted">
                  {t("properties.findSelectProperty")}
                </span>
                <PropertyPicker
                  properties={properties}
                  value={property.id}
                  open={propertyPickerOpen}
                  onToggle={() => setPropertyPickerOpen((v) => !v)}
                  onClose={() => setPropertyPickerOpen(false)}
                  onPick={(id) => {
                    setPropertyId(id);
                    setSelectedKeys(null);
                    setPropertyPickerOpen(false);
                  }}
                />
              </div>
            )}

            {mortgages.length === 0 ? (
              <p className="m-0 text-sm text-muted">
                {t("properties.findNoMortgages")}
              </p>
            ) : !hasAccount ? (
              <p className="m-0 text-sm text-muted">
                {t("properties.findNoAccount")}
              </p>
            ) : result.seed === "none" ? (
              <p className="m-0 text-sm text-muted">
                {t("properties.findNeedsTags")}
              </p>
            ) : result.series.length === 0 ? (
              <p className="m-0 text-sm text-muted">
                {t("properties.findNoneFound")}
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold tracking-wider uppercase text-muted">
                    {t("properties.findSelectCharges")}
                  </span>
                  <span className="text-xs text-muted">
                    {result.seed === "tags"
                      ? t("properties.findSeedTags")
                      : result.seed === "payments"
                        ? t("properties.findSeedPayments")
                        : t("properties.findSeedAmount")}
                  </span>
                  <ul
                    className="m-0 flex list-none flex-col gap-1 p-0"
                    role="group"
                    aria-label={t("properties.findSelectCharges")}
                  >
                    {result.series.map((s) => (
                      <ChargeRow
                        key={s.key}
                        series={s}
                        settings={settings}
                        checked={
                          selectedKeys === null
                            ? defaultSelectedKeys.has(s.key)
                            : selectedKeys.has(s.key)
                        }
                        onToggle={() =>
                          setSelectedKeys((prev) => {
                            const base = prev ?? defaultSelectedKeys;
                            const next = new Set(base);
                            if (next.has(s.key)) next.delete(s.key);
                            else next.add(s.key);
                            return next;
                          })
                        }
                      />
                    ))}
                  </ul>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold tracking-wider uppercase text-muted">
                      {t("properties.findToleranceLabel")}
                    </span>
                    <span className="text-sm text-fg-bright">
                      {t("properties.findToleranceValue", {
                        pct: tolerancePct,
                      })}
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
                  <span className="text-sm text-fg-bright">
                    {transactions === 1
                      ? t("properties.findTxnCountOne", { count: transactions })
                      : t("properties.findTxnCountOther", {
                          count: transactions,
                        })}
                    {transactions > 0 && (
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
                  {transactions > 0 && mortgages.length > 1 && (
                    <span className="text-xs text-muted">
                      {t("properties.findSplitHint", {
                        count: mortgages.length,
                      })}
                    </span>
                  )}
                  {firstMonth && lastMonth && (
                    <span className="text-xs text-meta">
                      {t("properties.findRange", {
                        start: formatMonthLabel(firstMonth, lang),
                        end: formatMonthLabel(lastMonth, lang),
                      })}
                    </span>
                  )}
                </div>
              </>
            )}
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
          disabled={transactions === 0}
        >
          {transactions === 1
            ? t("properties.findAddOne", { count: transactions })
            : t("properties.findAddOther", { count: transactions })}
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

const PROPERTY_PICKER_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 240 },
  anchor: "left",
  coordinateSpace: "viewport",
};

function PropertyPicker({
  properties,
  value,
  open,
  onToggle,
  onClose,
  onPick,
}: {
  properties: readonly Property[];
  value: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const selected = properties.find((p) => p.id === value) ?? null;
  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
      >
        <Home size={14} className="shrink-0 text-accent" aria-hidden />
        <span className="flex-1 truncate">{selected?.name}</span>
        <ChevronDown size={14} className="shrink-0 text-muted" aria-hidden />
      </button>
      <FloatingPanel
        open={open}
        onClose={onClose}
        triggerRef={triggerRef}
        placement={PROPERTY_PICKER_PLACEMENT}
      >
        <ul role="listbox" className="max-h-64 overflow-auto py-1">
          {properties.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={p.id === value}
                onClick={() => onPick(p.id)}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <span className="flex-1 truncate">{p.name}</span>
                {p.id === value && (
                  <Check size={14} className="text-accent" aria-hidden />
                )}
              </button>
            </li>
          ))}
        </ul>
      </FloatingPanel>
    </div>
  );
}

function ChargeRow({
  series,
  settings,
  checked,
  onToggle,
}: {
  series: MortgagePaymentSeries;
  settings: Settings;
  checked: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const highlyProbable = series.highlyProbable;
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded border bg-surface-2 px-2.5 py-2 text-left text-sm text-fg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
          highlyProbable
            ? "border-success hover:border-success"
            : "border-line hover:border-accent"
        }`}
      >
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-fg-bright">{series.label}</span>
            {highlyProbable && (
              <span className="shrink-0 rounded-full border-0 bg-success px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase text-page-bg">
                {t("properties.findHighlyProbable")}
              </span>
            )}
          </span>
          <span className="text-xs text-muted">
            {formatBalance(series.suggestedAmount, settings, {
              neverAbbreviate: true,
            })}
            {" · "}
            {series.months.length === 1
              ? t("properties.findTxnCountOne", { count: series.months.length })
              : t("properties.findTxnCountOther", {
                  count: series.months.length,
                })}
            {" · "}
            {series.spanMonths === 1
              ? t("properties.findSpanMonthsOne", { count: series.spanMonths })
              : t("properties.findSpanMonthsOther", {
                  count: series.spanMonths,
                })}
          </span>
        </span>
        <span
          aria-hidden
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
            checked
              ? "border-accent bg-accent text-page-bg"
              : "border-line bg-surface"
          }`}
        >
          {checked && <Check size={13} focusable={false} />}
        </span>
      </button>
    </li>
  );
}
