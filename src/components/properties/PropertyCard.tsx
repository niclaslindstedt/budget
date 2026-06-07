import { Check, ChevronRight, Home, Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { resolveMonthlyAmortization } from "../../data/property-mortgage/amortization";
import { resolveMonthlyInterest } from "../../data/property-mortgage/interest";
import { splitRecordedPayment } from "../../data/property-mortgage/payment";
import { mortgagePayoffProgress } from "../../data/property-mortgage/progress";
import type {
  Account,
  Company,
  Mortgage,
  Property,
  Settings,
} from "../../data/types";
import { useT } from "../../i18n";
import { formatBalance, formatNumber, formatRate } from "../../utils/format";
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
  onNetSaleProfit: (property: Property) => void;
  onViewPayments: (property: Property) => void;
  onViewRepairs: (property: Property) => void;
  onAddMortgage: (property: Property) => void;
  onEditMortgage: (property: Property, mortgage: Mortgage) => void;
  onDeleteMortgage: (property: Property, mortgage: Mortgage) => void;
};

// The most recent recorded value, or undefined when none recorded.
function currentValue(property: Property): number | undefined {
  let latest: { date: string; value: number } | undefined;
  for (const point of property.valueHistory) {
    if (!latest || point.date > latest.date) latest = point;
  }
  return latest?.value;
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
  onNetSaleProfit,
  onViewPayments,
  onViewRepairs,
  onAddMortgage,
  onEditMortgage,
  onDeleteMortgage,
}: Props) {
  const t = useT();
  const value = currentValue(property);
  const hasPayments = property.mortgages.some((m) => m.payments.length > 0);
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
          hasPayments={hasPayments}
          missingReceiptCount={repairSummary.missingReceiptCount}
          onUpdateValue={onUpdateValue}
          onUploadFile={onUploadFile}
          onNetSaleProfit={onNetSaleProfit}
          onViewPayments={onViewPayments}
          onViewRepairs={onViewRepairs}
          onEditProperty={onEditProperty}
          onDeleteProperty={onDeleteProperty}
        />
      </header>

      <div className="grid grid-cols-2 gap-2 px-3 py-2 text-sm sm:grid-cols-3">
        <Stat label={t("properties.currentValue")}>
          {value !== undefined ? (
            <span className="tabular-nums text-fg-bright">
              {formatBalance(value, settings, { neverAbbreviate: true })}
            </span>
          ) : (
            <span className="text-xs text-muted">
              {t("properties.noValue")}
            </span>
          )}
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
      </div>

      <div className="border-t border-line px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-bold tracking-wider uppercase text-muted">
            {t("properties.mortgages")}
          </span>
          <button
            type="button"
            onClick={() => onAddMortgage(property)}
            className="inline-flex cursor-pointer items-center gap-1 rounded border-0 bg-transparent px-1 text-xs text-accent hover:underline"
          >
            <Plus size={14} aria-hidden focusable={false} />
            {t("properties.addMortgage")}
          </button>
        </div>
        {property.mortgages.length === 0 ? (
          <p className="m-0 text-xs text-muted">
            {t("properties.noMortgages")}
          </p>
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
  const paidPanelId = useId();
  // The paid / interest / amortisation breakdown starts collapsed; pressing
  // the payoff "power bar" toggles it open (only meaningful once there are
  // recorded payments and the bar itself is shown).
  const [showPaid, setShowPaid] = useState(false);
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
  const payoffComplete = progress !== null && progress >= 1;
  const payoffPercent =
    progress === null
      ? 0
      : payoffComplete
        ? 100
        : Math.min(99, Math.round(progress * 100));
  // The payoff bar doubles as the toggle for the paid breakdown, but only
  // when there's both a bar to press and a breakdown to expose. With no bar
  // (no loan terms) but recorded payments, the breakdown stays always-on.
  const canCollapse = progress !== null && count > 0;
  const hasTerms =
    mortgage.loanAmount !== undefined ||
    mortgage.currentBalance !== undefined ||
    mortgage.interestRate !== undefined ||
    mortgage.rateChangeMonths !== undefined ||
    mortgage.nextRateChangeDate !== undefined ||
    mortgage.amortization !== undefined;

  // The per-month amortisation, formatted with its "/mo" suffix and an
  // optional "(N%)" tail when the loan amortises by a percentage of its
  // original amount — so the figure reads the same as the editor's preview.
  const amortPerMonth =
    monthlyAmort !== null
      ? t("properties.amortPerMonth", {
          amount: formatBalance(monthlyAmort, settings, {
            neverAbbreviate: true,
          }),
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
                {formatRate(mortgage.interestRate, settings)}%
              </MortgageStat>
            )}
            {amortPerMonth !== null && (
              <MortgageStat label={t("properties.amortShort")}>
                {amortPerMonth}
              </MortgageStat>
            )}
            {monthlyInterest !== null && (
              <MortgageStat label={t("properties.interestShort")}>
                {t("properties.interestPerMonth", {
                  amount: formatBalance(monthlyInterest, settings, {
                    neverAbbreviate: true,
                  }),
                })}
              </MortgageStat>
            )}
            {mortgage.nextRateChangeDate !== undefined && (
              <MortgageStat label={t("properties.nextRateChangeShort")}>
                {mortgage.nextRateChangeDate}
              </MortgageStat>
            )}
          </dl>
          {mortgage.rateChangeMonths !== undefined && (
            <p className="m-0 text-xs text-muted">
              {mortgage.rateChangeMonths === 1
                ? t("properties.rateResetsOne")
                : t("properties.rateResetsOther", {
                    count: mortgage.rateChangeMonths,
                  })}
            </p>
          )}
        </>
      )}

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

      {count > 0 && (progress === null || showPaid) && (
        <dl
          id={paidPanelId}
          className="m-0 grid grid-cols-3 gap-x-3 rounded bg-surface-3 px-2.5 py-2"
        >
          <MortgageStat label={t("properties.paidTotal")} emphasize>
            {formatBalance(paid, settings, { neverAbbreviate: true })}
          </MortgageStat>
          <MortgageStat label={t("properties.interestShort")}>
            {formatBalance(paidSplit.interest, settings, {
              neverAbbreviate: true,
            })}
          </MortgageStat>
          <MortgageStat label={t("properties.amortShort")}>
            {formatBalance(paidSplit.amortization, settings, {
              neverAbbreviate: true,
            })}
          </MortgageStat>
        </dl>
      )}
    </li>
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
