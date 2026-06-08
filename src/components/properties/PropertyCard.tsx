import {
  Check,
  ChevronRight,
  Home,
  Pencil,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useId, useState } from "react";

import { unlock } from "../../data/achievements";
import {
  aggregateMortgages,
  type MortgageAggregate,
} from "../../data/property-mortgage/aggregate";
import { resolveMonthlyAmortization } from "../../data/property-mortgage/amortization";
import { resolveMonthlyInterest } from "../../data/property-mortgage/interest";
import { splitRecordedPayment } from "../../data/property-mortgage/payment";
import { mortgagePayoffProgress } from "../../data/property-mortgage/progress";
import { currentPropertyValue } from "../../data/property-value/value";
import type {
  Account,
  Company,
  Mortgage,
  Property,
  Settings,
} from "../../data/types";
import { useT, type TFunction } from "../../i18n";
import { formatBalance, formatNumber, formatRate } from "../../utils/format";
import { MortgageSectionMenu } from "./MortgageSectionMenu";
import { MortgageViewToggle } from "./MortgageViewToggle";
import { PropertyActionsMenu } from "./PropertyActionsMenu";

// One property's block on the Properties page: its name, what it cost,
// its current value (the latest recorded snapshot), and the mortgages
// against it. All editing routes back through the page's modals via the
// callbacks — the card is presentational.

// Precomputed repairs summary for the card — the page resolves receipt
// status (which needs the bank history) so the card stays presentational.
type RepairSummary = {
  count: number;
  missingReceiptCount: number;
};

// Shared pill styling for the small data tokens on a property card — the
// rate-reset cadence, the per-area value / fee, and the loan-to-value
// share. A rounded, muted chip that reads as metadata next to the figure.
const PILL_CLASS =
  "inline-flex shrink-0 items-center rounded-full border border-line bg-surface-3 px-1.5 py-0.5 text-xs font-medium text-muted";

type Props = {
  property: Property;
  accountsById: ReadonlyMap<string, Account>;
  companiesById: ReadonlyMap<string, Company>;
  settings: Settings;
  repairSummary: RepairSummary;
  onEditProperty: (property: Property) => void;
  onDeleteProperty: (property: Property) => void;
  onUpdateValue: (property: Property) => void;
  onUploadFile: (property: Property) => void;
  onVisualizeValue: (property: Property) => void;
  onNetSaleProfit: (property: Property) => void;
  onViewPayments: (property: Property) => void;
  onViewRepairs: (property: Property) => void;
  onExportProperty: (property: Property) => void;
  onAddMortgage: (property: Property) => void;
  onEditMortgage: (property: Property, mortgage: Mortgage) => void;
  onDeleteMortgage: (property: Property, mortgage: Mortgage) => void;
};

// The rate-reset cadence pill next to a mortgage's rate. Sub-year cadences
// read in months ("monthly", "3 months"); whole-year cadences read in years
// ("yearly", "2 years"). A reset interval is always a whole number of months
// and, at or above a year, a whole number of years (never "1.5 years"), so a
// clean `% 12` check picks the unit.
function rateResetPillLabel(t: TFunction, months: number): string {
  if (months >= 12 && months % 12 === 0) {
    const years = months / 12;
    return years === 1
      ? t("properties.rateResetPillYearOne")
      : t("properties.rateResetPillYearOther", { count: years });
  }
  return months === 1
    ? t("properties.rateResetPillOne")
    : t("properties.rateResetPillOther", { count: months });
}

export function PropertyCard({
  property,
  accountsById,
  companiesById,
  settings,
  repairSummary,
  onEditProperty,
  onDeleteProperty,
  onUpdateValue,
  onUploadFile,
  onVisualizeValue,
  onNetSaleProfit,
  onViewPayments,
  onViewRepairs,
  onExportProperty,
  onAddMortgage,
  onEditMortgage,
  onDeleteMortgage,
}: Props) {
  const t = useT();
  const value = currentPropertyValue(property);
  // Per-area figures shown as pills next to the current value and the
  // monthly fee. Only when a positive living area is recorded, so a
  // missing or zero size hides the pill rather than dividing by nothing.
  // The fee is stored per month, so the per-area pill annualises it (×12)
  // to read as a yearly cost per unit of area.
  const size = property.size;
  const hasArea = size !== undefined && size > 0;
  const valuePerArea =
    hasArea && value !== undefined ? value / size : undefined;
  const feePerArea =
    hasArea && property.fee !== undefined
      ? (property.fee * 12) / size
      : undefined;
  const hasPayments = property.mortgages.some((m) => m.payments.length > 0);
  // The unified view collapses every mortgage into one summed card; it's only
  // meaningful (and only offered) when there are two or more loans to combine.
  // Ephemeral per-card state — resets to the unified default on reload, like
  // the per-row "show paid breakdown" toggle below.
  const canToggleView = property.mortgages.length >= 2;
  const [mortgageView, setMortgageView] = useState<"unified" | "split">(
    "unified",
  );
  const showUnified = canToggleView && mortgageView === "unified";
  const lender = property.companyId
    ? companiesById.get(property.companyId)
    : undefined;
  const account = property.accountId
    ? accountsById.get(property.accountId)
    : undefined;

  return (
    <section className="overflow-clip rounded border border-line bg-surface">
      <header className="flex items-center gap-2 border-b border-line bg-surface-3 px-3 py-2">
        <Home
          size={16}
          className="shrink-0 text-accent"
          aria-hidden
          focusable={false}
        />
        <span className="flex-1 truncate font-bold text-fg-bright">
          {property.name}
        </span>
        <PropertyActionsMenu
          property={property}
          missingReceiptCount={repairSummary.missingReceiptCount}
          onUploadFile={onUploadFile}
          onVisualizeValue={onVisualizeValue}
          onNetSaleProfit={onNetSaleProfit}
          onViewRepairs={onViewRepairs}
          onExportProperty={onExportProperty}
          onEditProperty={onEditProperty}
          onDeleteProperty={onDeleteProperty}
        />
      </header>

      <div className="grid grid-cols-2 gap-2 px-3 py-2 text-sm sm:grid-cols-3">
        <Stat label={t("properties.currentValue")}>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onUpdateValue(property)}
              aria-label={t("properties.updateValue")}
              className="group flex w-fit cursor-pointer items-center gap-1 rounded border-0 bg-transparent p-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              {value !== undefined ? (
                <span className="tabular-nums text-fg-bright group-hover:text-accent">
                  {formatBalance(value, settings, { neverAbbreviate: true })}
                </span>
              ) : (
                <span className="text-xs text-muted group-hover:text-accent">
                  {t("properties.noValue")}
                </span>
              )}
              <TrendingUp
                size={12}
                aria-hidden
                focusable={false}
                className="shrink-0 text-muted group-hover:text-accent"
              />
            </button>
            {valuePerArea !== undefined && (
              <span
                title={t("properties.valuePerAreaTitle", {
                  unit: settings.propertySizeUnit,
                })}
                className={PILL_CLASS}
              >
                {formatNumber(valuePerArea, settings)}/
                {settings.propertySizeUnit}
              </span>
            )}
          </div>
        </Stat>
        <Stat label={t("properties.boughtFor")}>
          {property.purchaseAmount !== undefined ? (
            <span className="tabular-nums text-fg">
              {formatBalance(property.purchaseAmount, settings, {
                neverAbbreviate: true,
              })}
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </Stat>
        {property.purchaseDate && (
          <Stat label={t("properties.purchased")}>
            <span className="text-fg">{property.purchaseDate}</span>
          </Stat>
        )}
        {lender && (
          <Stat label={t("properties.lenderLabel")}>
            <span className="truncate text-fg">{lender.name}</span>
          </Stat>
        )}
        {account && (
          <Stat label={t("properties.accountLabel")}>
            <span className="truncate text-fg">{account.name}</span>
          </Stat>
        )}
        {property.size !== undefined && (
          <Stat label={t("properties.size")}>
            <span className="tabular-nums text-fg">
              {formatNumber(property.size, settings, { neverAbbreviate: true })}{" "}
              {settings.propertySizeUnit}
            </span>
          </Stat>
        )}
        {property.rooms !== undefined && (
          <Stat label={t("properties.rooms")}>
            <span className="tabular-nums text-fg">
              {formatNumber(property.rooms, settings, {
                neverAbbreviate: true,
              })}
            </span>
          </Stat>
        )}
        {property.fee !== undefined && (
          <Stat label={t("properties.fee")}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="tabular-nums text-fg">
                {formatBalance(property.fee, settings, {
                  neverAbbreviate: true,
                })}
              </span>
              {feePerArea !== undefined && (
                <span
                  title={t("properties.feePerAreaTitle", {
                    unit: settings.propertySizeUnit,
                  })}
                  className={PILL_CLASS}
                >
                  {formatBalance(feePerArea, settings, {
                    neverAbbreviate: true,
                  })}
                  /{settings.propertySizeUnit}/{t("properties.perYearUnit")}
                </span>
              )}
            </div>
          </Stat>
        )}
      </div>

      <div className="border-t border-line px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-bold tracking-wider uppercase text-muted">
            {t("properties.mortgages")}
          </span>
          <div className="flex items-center gap-1.5">
            {canToggleView && (
              <MortgageViewToggle
                view={mortgageView}
                onChange={(next) => {
                  setMortgageView(next);
                  // The unified view is the default, but the unlock rewards
                  // actively reaching for it through the toggle.
                  if (next === "unified") unlock("unifiedMortgage");
                }}
              />
            )}
            <MortgageSectionMenu
              property={property}
              hasPayments={hasPayments}
              onAddMortgage={onAddMortgage}
              onViewPayments={onViewPayments}
            />
          </div>
        </div>
        {property.mortgages.length === 0 ? (
          <p className="m-0 text-xs text-muted">
            {t("properties.noMortgages")}
          </p>
        ) : showUnified ? (
          <UnifiedMortgageView
            mortgages={property.mortgages}
            propertyValue={value}
            settings={settings}
          />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {property.mortgages.map((mortgage) => (
              <MortgageRow
                key={mortgage.id}
                property={property}
                mortgage={mortgage}
                settings={settings}
                onEdit={onEditMortgage}
                onDelete={onDeleteMortgage}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </div>
  );
}

function MortgageRow({
  property,
  mortgage,
  settings,
  onEdit,
  onDelete,
}: {
  property: Property;
  mortgage: Mortgage;
  settings: Settings;
  onEdit: (property: Property, mortgage: Mortgage) => void;
  onDelete: (property: Property, mortgage: Mortgage) => void;
}) {
  const t = useT();
  const count = mortgage.payments.length;
  // Sum what's been paid and how it divides between interest and
  // amortisation, so a loan that carries all the principal (or all the
  // interest) is obvious at a glance rather than hidden in one total.
  const paidSplit = mortgage.payments.reduce(
    (acc, p) => {
      const split = splitRecordedPayment(mortgage, p);
      acc.amortization += split.amortization;
      acc.interest += split.interest;
      return acc;
    },
    { amortization: 0, interest: 0 },
  );
  const paid = paidSplit.amortization + paidSplit.interest;
  const monthlyAmort = resolveMonthlyAmortization(mortgage);
  // Interest the loan is accruing right now — the rate in effect applied to
  // what's still owed (rate × outstanding balance, monthly), so the figure
  // reads next to the monthly amortisation as "what each leg of the payment
  // costs currently". `null` when neither a rate nor a balance is known.
  const monthlyInterest = resolveMonthlyInterest(mortgage);
  // Share of the original loan amortised away so far — drives the payoff
  // "power bar". `null` when the loan / balance terms can't resolve it.
  const progress = mortgagePayoffProgress(mortgage);
  const hasTerms =
    mortgage.loanAmount !== undefined ||
    mortgage.currentBalance !== undefined ||
    mortgage.interestRate !== undefined ||
    mortgage.rateChangeMonths !== undefined ||
    mortgage.nextRateChangeDate !== undefined ||
    mortgage.amortization !== undefined;

  // The per-month amortisation amount, with an optional "(N%)" tail when the
  // loan amortises by a percentage of its original amount — the "/ month"
  // cadence lives in the stat label, so the figure stays a bare amount.
  const amortPerMonth =
    monthlyAmort !== null
      ? formatBalance(monthlyAmort, settings, {
          neverAbbreviate: true,
        }) +
        (mortgage.amortization?.mode === "percent"
          ? ` (${formatNumber(mortgage.amortization.percent, settings, {
              neverAbbreviate: true,
            })}%)`
          : "")
      : null;

  return (
    <li className="flex flex-col gap-2.5 rounded border border-line bg-surface-2 px-3 py-2.5 text-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <span className="block truncate font-bold text-fg-bright">
            {mortgage.name}
          </span>
          <span className="block truncate text-xs text-muted">
            {count === 0
              ? t("properties.noPaymentsYet")
              : count === 1
                ? t("properties.paymentsCountOne", { count })
                : t("properties.paymentsCountOther", { count })}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(property, mortgage)}
            aria-label={t("properties.editMortgage")}
            className="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-fg"
          >
            <Pencil size={16} aria-hidden focusable={false} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(property, mortgage)}
            aria-label={t("properties.deleteMortgage")}
            className="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-danger"
          >
            <Trash2 size={16} aria-hidden focusable={false} />
          </button>
        </div>
      </div>

      {hasTerms && (
        <>
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2">
            {mortgage.currentBalance !== undefined && (
              <MortgageStat label={t("properties.balanceShort")}>
                {formatBalance(mortgage.currentBalance, settings, {
                  neverAbbreviate: true,
                })}
              </MortgageStat>
            )}
            {mortgage.loanAmount !== undefined && (
              <MortgageStat label={t("properties.loanShort")}>
                {formatBalance(mortgage.loanAmount, settings, {
                  neverAbbreviate: true,
                })}
              </MortgageStat>
            )}
            {mortgage.interestRate !== undefined && (
              <MortgageStat label={t("properties.rateShort")}>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0">
                    {formatRate(mortgage.interestRate, settings)}%
                  </span>
                  {mortgage.rateChangeMonths !== undefined && (
                    <span className={PILL_CLASS}>
                      {rateResetPillLabel(t, mortgage.rateChangeMonths)}
                    </span>
                  )}
                </span>
              </MortgageStat>
            )}
            {mortgage.nextRateChangeDate !== undefined && (
              <MortgageStat label={t("properties.nextRateChangeShort")}>
                {mortgage.nextRateChangeDate}
              </MortgageStat>
            )}
            {amortPerMonth !== null && (
              <MortgageStat label={t("properties.amortPerMonthLabel")}>
                {amortPerMonth}
              </MortgageStat>
            )}
            {monthlyInterest !== null && (
              <MortgageStat label={t("properties.interestPerMonthLabel")}>
                {formatBalance(monthlyInterest, settings, {
                  neverAbbreviate: true,
                })}
              </MortgageStat>
            )}
          </dl>
        </>
      )}

      <PayoffSection
        progress={progress}
        paid={{
          total: paid,
          interest: paidSplit.interest,
          amortization: paidSplit.amortization,
        }}
        paymentCount={count}
        settings={settings}
      />
    </li>
  );
}

// The payoff "power bar" plus its collapsible paid / interest / amortisation
// breakdown — shared by a single mortgage row and the unified summary so both
// behave identically. The bar shows whenever payoff `progress` resolves; the
// breakdown shows once there are recorded payments, and the bar doubles as the
// toggle that hides / shows it (only when there's both a bar to press and a
// breakdown to expose). With no bar (no loan terms) but recorded payments, the
// breakdown stays always-on.
function PayoffSection({
  progress,
  paid,
  paymentCount,
  settings,
}: {
  progress: number | null;
  paid: { total: number; interest: number; amortization: number };
  paymentCount: number;
  settings: Settings;
}) {
  const t = useT();
  const paidPanelId = useId();
  const [showPaid, setShowPaid] = useState(false);
  const payoffComplete = progress !== null && progress >= 1;
  const payoffPercent =
    progress === null
      ? 0
      : payoffComplete
        ? 100
        : Math.min(99, Math.round(progress * 100));
  const canCollapse = progress !== null && paymentCount > 0;

  return (
    <>
      {progress !== null &&
        (() => {
          const bar = (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-1 text-xs text-muted">
                  {canCollapse && (
                    <ChevronRight
                      size={12}
                      aria-hidden
                      focusable={false}
                      className={`shrink-0 transition-transform ${
                        showPaid ? "rotate-90" : ""
                      }`}
                    />
                  )}
                  {t("properties.payoffLabel")}
                </span>
                <span
                  className={`flex items-center gap-1 text-xs font-bold tabular-nums ${
                    payoffComplete ? "text-success" : "text-fg-bright"
                  }`}
                >
                  {payoffComplete && (
                    <Check size={12} aria-hidden focusable={false} />
                  )}
                  {t("properties.payoffPercent", { percent: payoffPercent })}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={payoffPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t("properties.payoffBarLabel", {
                  percent: payoffPercent,
                })}
                className="h-2 overflow-clip rounded-full bg-surface-3"
              >
                <div
                  className={`h-full rounded-full transition-[width] ${
                    payoffComplete ? "bg-success" : "bg-accent"
                  }`}
                  style={{ width: `${payoffPercent}%` }}
                />
              </div>
            </>
          );
          return canCollapse ? (
            <button
              type="button"
              onClick={() => setShowPaid((open) => !open)}
              aria-expanded={showPaid}
              aria-controls={paidPanelId}
              aria-label={
                showPaid
                  ? t("properties.payoffToggleHide")
                  : t("properties.payoffToggleShow")
              }
              className="flex w-full cursor-pointer flex-col gap-1 rounded border-0 bg-transparent p-0 text-left"
            >
              {bar}
            </button>
          ) : (
            <div className="flex flex-col gap-1">{bar}</div>
          );
        })()}

      {paymentCount > 0 && (progress === null || showPaid) && (
        <dl
          id={paidPanelId}
          className="m-0 grid grid-cols-3 gap-x-3 rounded bg-surface-3 px-2.5 py-2"
        >
          <MortgageStat label={t("properties.paidTotal")} emphasize>
            {formatBalance(paid.total, settings, { neverAbbreviate: true })}
          </MortgageStat>
          <MortgageStat label={t("properties.interestShort")}>
            {formatBalance(paid.interest, settings, {
              neverAbbreviate: true,
            })}
          </MortgageStat>
          <MortgageStat label={t("properties.amortShort")}>
            {formatBalance(paid.amortization, settings, {
              neverAbbreviate: true,
            })}
          </MortgageStat>
        </dl>
      )}
    </>
  );
}

// The unified mortgage view: every loan on the property collapsed into one
// summed card — combined balance / loan, the balance-weighted effective rate,
// total monthly interest and amortisation, and an aggregate payoff bar. The
// toggle to this view lives in the mortgage section's "…" menu; switching back
// to "split" shows the individual `MortgageRow`s (where each loan is edited).
function UnifiedMortgageView({
  mortgages,
  propertyValue,
  settings,
}: {
  mortgages: Mortgage[];
  propertyValue: number | undefined;
  settings: Settings;
}) {
  const t = useT();
  const agg: MortgageAggregate = aggregateMortgages(mortgages);
  // Share of the property's current value tied up in loans (combined balance ÷
  // current value), shown after the balance. Only when both figures resolve
  // and the value is positive, so a missing or zero value hides it rather than
  // dividing by nothing.
  const loanShare =
    agg.totalBalance !== undefined &&
    propertyValue !== undefined &&
    propertyValue > 0
      ? Math.round((agg.totalBalance / propertyValue) * 100)
      : undefined;

  return (
    <div className="flex flex-col gap-2.5 rounded border border-line bg-surface-2 px-3 py-2.5 text-sm">
      <span className="block truncate text-xs font-bold tracking-wider uppercase text-muted">
        {t("properties.mortgageCountOther", { count: agg.count })}
      </span>

      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2">
        {agg.totalBalance !== undefined && (
          <MortgageStat label={t("properties.balanceShort")}>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">
                {formatBalance(agg.totalBalance, settings, {
                  neverAbbreviate: true,
                })}
              </span>
              {loanShare !== undefined && (
                <span
                  title={t("properties.loanToValueTitle")}
                  className={PILL_CLASS}
                >
                  {loanShare}%
                </span>
              )}
            </span>
          </MortgageStat>
        )}
        {agg.totalLoan !== undefined && (
          <MortgageStat label={t("properties.loanShort")}>
            {formatBalance(agg.totalLoan, settings, { neverAbbreviate: true })}
          </MortgageStat>
        )}
        {agg.effectiveRate !== null && (
          <MortgageStat label={t("properties.effectiveRateShort")}>
            {formatRate(agg.effectiveRate, settings)}%
          </MortgageStat>
        )}
        {agg.monthlyAmortization !== null && (
          <MortgageStat label={t("properties.amortPerMonthLabel")}>
            {formatBalance(agg.monthlyAmortization, settings, {
              neverAbbreviate: true,
            })}
          </MortgageStat>
        )}
        {agg.monthlyInterest !== null && (
          <MortgageStat label={t("properties.interestPerMonthLabel")}>
            {formatBalance(agg.monthlyInterest, settings, {
              neverAbbreviate: true,
            })}
          </MortgageStat>
        )}
      </dl>

      <PayoffSection
        progress={agg.progress}
        paid={agg.paid}
        paymentCount={agg.paymentCount}
        settings={settings}
      />
    </div>
  );
}

// A single label-over-value figure inside a mortgage's terms / paid grid.
// Stacking the label above the value (instead of a wrapped inline run)
// keeps the numbers aligned and scannable on a narrow phone.
function MortgageStat({
  label,
  emphasize,
  children,
}: {
  label: string;
  emphasize?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={`m-0 truncate tabular-nums ${
          emphasize ? "text-fg-bright" : "text-fg"
        }`}
      >
        {children}
      </dd>
    </div>
  );
}
