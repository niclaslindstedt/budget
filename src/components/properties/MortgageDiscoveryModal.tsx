import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";

import { resolveMonthlyAmortization } from "../../data/property-mortgage/amortization";
import {
  discoverMortgagePayments,
  DEFAULT_MORTGAGE_TOLERANCE,
  monthsWithinBand,
  type MortgagePaymentSeries,
} from "../../data/property-mortgage/discovery";
import { resolveMonthlyInterest } from "../../data/property-mortgage/interest";
import { PRESET_TYPE_MORTGAGE_ID } from "../../data/presets/types";
import { newId } from "../../data/sheet";
import type {
  Company,
  EntryType,
  HistoryEntry,
  MatchRule,
  MerchantHint,
  Mortgage,
  MortgagePayment,
  Settings,
} from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatMonthLabel } from "../../utils/format";
import { Button, Slider } from "../form";
import { Modal } from "../Modal";

// The guided "Find mortgage payments" walk. Anchors on the metadata the
// user applied while going through their imported history: the mortgage's
// tied company (the lender) and the "Mortgage" entry type. From the tagged
// charges it learns the bank description + a typical amount and sweeps the
// rest of the account's history for matching months, so a single tagged
// month surfaces every other month of the same charge. When nothing is
// tagged it falls back to the mortgage's already-added payments; with
// neither it nudges the user to tag a month first. The user ticks the
// charge groups to record, then confirms adding every matching month
// within the amount band, deduping months already recorded.
//
// `centered`: the walk is all selection controls, no soft-keyboard inputs.

type Props = {
  open: boolean;
  mortgage: Mortgage | null;
  // The parent property's purchase date (ISO), when recorded — the finder
  // ignores charges before the home was owned.
  purchaseDate?: string;
  history: Record<string, HistoryEntry[]>;
  merchantHints: Readonly<Record<string, MerchantHint>>;
  matchRules: readonly MatchRule[];
  companies: readonly Company[];
  types: readonly EntryType[];
  settings: Settings;
  onClose: () => void;
  onAdd: (payments: MortgagePayment[]) => void;
};

export function MortgageDiscoveryModal({
  open,
  mortgage,
  purchaseDate,
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
  // null = "use the default (everything selected)"; a Set once the user
  // has toggled at least one group.
  const [selectedKeys, setSelectedKeys] = useState<Set<string> | null>(null);
  // Match-band half-width as a percentage; the data layer takes a fraction.
  const [tolerancePct, setTolerancePct] = useState(
    Math.round(DEFAULT_MORTGAGE_TOLERANCE * 100),
  );
  const tolerance = tolerancePct / 100;

  const accountId = mortgage?.accountId ?? null;

  // Bank entries already backing a payment on this mortgage — both the
  // fallback anchor (their descriptions seed the expansion) and the months
  // to skip so the same charge isn't offered twice.
  const addedSourceIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of mortgage?.payments ?? []) {
      if (p.sourceHistoryId) set.add(p.sourceHistoryId);
    }
    return set;
  }, [mortgage?.payments]);

  // Expected monthly figures from the loan terms — the amortisation, the
  // interest, and the two combined — used to rank the likeliest charge
  // first. Either may be unresolved (no terms recorded yet).
  const targetAmounts = useMemo(() => {
    if (!mortgage) return [];
    const amort = resolveMonthlyAmortization(mortgage);
    const interest = resolveMonthlyInterest(mortgage);
    const out: number[] = [];
    if (amort !== null) out.push(amort);
    if (interest !== null) out.push(interest);
    if (amort !== null && interest !== null) out.push(amort + interest);
    return out;
  }, [mortgage]);

  const result = useMemo(() => {
    if (!accountId || !mortgage) return { series: [], seed: "none" as const };
    return discoverMortgagePayments({
      entries: history[accountId] ?? [],
      merchantHints,
      matchRules,
      companies,
      types,
      companyId: mortgage.companyId,
      mortgageTypeId: PRESET_TYPE_MORTGAGE_ID,
      seedEntryIds: [...addedSourceIds],
      fromDate: purchaseDate,
      targetAmounts,
    });
  }, [
    accountId,
    mortgage,
    purchaseDate,
    history,
    merchantHints,
    matchRules,
    companies,
    types,
    addedSourceIds,
    targetAmounts,
  ]);

  useResetOnOpen(open, mortgage?.id, () => {
    setSelectedKeys(null);
    setTolerancePct(Math.round(DEFAULT_MORTGAGE_TOLERANCE * 100));
  });

  // Default to every matched group selected until the user toggles one.
  const isSelected = (key: string) =>
    selectedKeys === null ? true : selectedKeys.has(key);

  function toggle(key: string) {
    setSelectedKeys((prev) => {
      const base = prev ?? new Set(result.series.map((s) => s.key));
      const next = new Set(base);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Build the per-month payments from the selected series: each month
  // within the amount band becomes one payment at the charge's magnitude,
  // skipping months already recorded (dedup by source bank entry).
  const preview = useMemo(() => {
    const fresh: MortgagePayment[] = [];
    const freshMonthKeys: string[] = [];
    let alreadyAdded = 0;
    for (const series of result.series) {
      if (selectedKeys !== null && !selectedKeys.has(series.key)) continue;
      for (const month of monthsWithinBand(
        series,
        series.suggestedAmount,
        tolerance,
      )) {
        if (addedSourceIds.has(month.entryId)) {
          alreadyAdded++;
          continue;
        }
        fresh.push({
          id: newId(),
          date: month.date,
          amount: month.amount,
          sourceHistoryId: month.entryId,
        });
        freshMonthKeys.push(month.monthKey);
      }
    }
    const sortedKeys = [...freshMonthKeys].sort();
    const spanMonths =
      sortedKeys.length === 0
        ? 0
        : monthSpan(sortedKeys[0], sortedKeys[sortedKeys.length - 1]);
    return { fresh, alreadyAdded, spanMonths };
  }, [result, selectedKeys, addedSourceIds, tolerance]);

  const { fresh, alreadyAdded, spanMonths } = preview;

  if (!open || !mortgage) return null;

  const hasAccount = accountId !== null;
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
        ) : result.seed === "none" ? (
          <p className="m-0 text-sm text-muted">
            {t("properties.findNeedsTags")}
          </p>
        ) : result.series.length === 0 ? (
          <p className="m-0 text-sm text-muted">
            {t("properties.findNoneFound")}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold tracking-wider uppercase text-muted">
                {t("properties.findSelectCharges")}
              </span>
              <span className="text-xs text-muted">
                {result.seed === "tags"
                  ? t("properties.findSeedTags")
                  : t("properties.findSeedPayments")}
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
                    checked={isSelected(s.key)}
                    onToggle={() => toggle(s.key)}
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
              <span className="text-sm text-fg-bright">
                {fresh.length === 1
                  ? t("properties.paymentsCountOne", { count: fresh.length })
                  : t("properties.paymentsCountOther", { count: fresh.length })}
                {fresh.length > 0 && (
                  <>
                    {" · "}
                    {spanMonths === 1
                      ? t("properties.findSpanMonthsOne", { count: spanMonths })
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
                    start: formatMonthLabel(firstFresh.date.slice(0, 7), lang),
                    end: formatMonthLabel(lastFresh.date.slice(0, 7), lang),
                  })}
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

// Calendar months from `first` to `last` "YYYY-MM" keys, inclusive.
function monthSpan(first: string, last: string): number {
  const fy = Number(first.slice(0, 4));
  const fm = Number(first.slice(5, 7));
  const ly = Number(last.slice(0, 4));
  const lm = Number(last.slice(5, 7));
  return (ly - fy) * 12 + (lm - fm) + 1;
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
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded border border-line bg-surface-2 px-2.5 py-2 text-left text-sm text-fg hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-fg-bright">{series.label}</span>
          <span className="text-xs text-muted">
            {formatBalance(series.suggestedAmount, settings, {
              neverAbbreviate: true,
            })}
            {" · "}
            {series.months.length === 1
              ? t("properties.paymentsCountOne", {
                  count: series.months.length,
                })
              : t("properties.paymentsCountOther", {
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
