import {
  Home,
  Pencil,
  Plus,
  ReceiptText,
  TrendingUp,
  Trash2,
} from "lucide-react";

import { resolveMonthlyAmortization } from "../../data/property-mortgage/amortization";
import { splitRecordedPayment } from "../../data/property-mortgage/payment";
import type {
  Account,
  Company,
  Mortgage,
  Property,
  Settings,
} from "../../data/types";
import { useT } from "../../i18n";
import { formatBalance, formatNumber, formatRate } from "../../utils/format";

// One property's block on the Properties page: its name, what it cost,
// its current value (the latest recorded snapshot), and the mortgages
// against it. All editing routes back through the page's modals via the
// callbacks — the card is presentational.

type Props = {
  property: Property;
  accountsById: ReadonlyMap<string, Account>;
  companiesById: ReadonlyMap<string, Company>;
  settings: Settings;
  onEditProperty: (property: Property) => void;
  onDeleteProperty: (property: Property) => void;
  onUpdateValue: (property: Property) => void;
  onViewPayments: (property: Property) => void;
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
  onEditProperty,
  onDeleteProperty,
  onUpdateValue,
  onViewPayments,
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
        <button
          type="button"
          onClick={() => onUpdateValue(property)}
          className="inline-flex cursor-pointer items-center gap-1 rounded border border-line bg-surface px-2 py-1 text-xs text-accent hover:bg-surface-2"
        >
          <TrendingUp size={14} aria-hidden focusable={false} />
          <span className="hidden sm:inline">
            {t("properties.updateValue")}
          </span>
        </button>
        {hasPayments && (
          <button
            type="button"
            onClick={() => onViewPayments(property)}
            aria-label={t("properties.viewPayments")}
            className="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-fg"
          >
            <ReceiptText size={16} aria-hidden focusable={false} />
          </button>
        )}
        <button
          type="button"
          onClick={() => onEditProperty(property)}
          aria-label={t("properties.editProperty")}
          className="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-fg"
        >
          <Pencil size={16} aria-hidden focusable={false} />
        </button>
        <button
          type="button"
          onClick={() => onDeleteProperty(property)}
          aria-label={t("properties.deleteProperty")}
          className="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-danger"
        >
          <Trash2 size={16} aria-hidden focusable={false} />
        </button>
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
  const hasTerms =
    mortgage.loanAmount !== undefined ||
    mortgage.currentBalance !== undefined ||
    mortgage.interestRate !== undefined ||
    mortgage.rateChangeMonths !== undefined ||
    mortgage.nextRateChangeDate !== undefined ||
    mortgage.amortization !== undefined;

  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded border border-line bg-surface-2 px-2.5 py-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-fg-bright">{mortgage.name}</span>
        <span className="block truncate text-xs text-muted">
          {count === 0
            ? t("properties.noPaymentsYet")
            : count === 1
              ? t("properties.paymentsCountOne", { count })
              : t("properties.paymentsCountOther", { count })}
        </span>
        {hasTerms && (
          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
            {mortgage.currentBalance !== undefined && (
              <span>
                {t("properties.balanceShort")}{" "}
                <span className="tabular-nums text-fg">
                  {formatBalance(mortgage.currentBalance, settings, {
                    neverAbbreviate: true,
                  })}
                </span>
              </span>
            )}
            {mortgage.loanAmount !== undefined && (
              <span>
                {t("properties.loanShort")}{" "}
                <span className="tabular-nums text-fg">
                  {formatBalance(mortgage.loanAmount, settings, {
                    neverAbbreviate: true,
                  })}
                </span>
              </span>
            )}
            {mortgage.interestRate !== undefined && (
              <span>
                {t("properties.rateShort")}{" "}
                <span className="tabular-nums text-fg">
                  {formatRate(mortgage.interestRate, settings)}%
                </span>
              </span>
            )}
            {mortgage.rateChangeMonths !== undefined && (
              <span>
                {mortgage.rateChangeMonths === 1
                  ? t("properties.rateResetsOne")
                  : t("properties.rateResetsOther", {
                      count: mortgage.rateChangeMonths,
                    })}
              </span>
            )}
            {mortgage.nextRateChangeDate !== undefined && (
              <span>
                {t("properties.nextRateChangeShort")}{" "}
                <span className="tabular-nums text-fg">
                  {mortgage.nextRateChangeDate}
                </span>
              </span>
            )}
            {monthlyAmort !== null && (
              <span>
                {t("properties.amortShort")}{" "}
                <span className="tabular-nums text-fg">
                  {t("properties.amortPerMonth", {
                    amount: formatBalance(monthlyAmort, settings, {
                      neverAbbreviate: true,
                    }),
                  })}
                </span>
                {mortgage.amortization?.mode === "percent" && (
                  <>
                    {" ("}
                    {formatNumber(mortgage.amortization.percent, settings, {
                      neverAbbreviate: true,
                    })}
                    {"%)"}
                  </>
                )}
              </span>
            )}
          </span>
        )}
      </span>
      {count > 0 && (
        <span className="flex flex-col items-end gap-0.5 text-xs text-muted">
          <span>
            {t("properties.paidTotal")}{" "}
            <span className="tabular-nums text-fg">
              {formatBalance(paid, settings, { neverAbbreviate: true })}
            </span>
          </span>
          <span className="flex flex-wrap justify-end gap-x-2">
            <span>
              {t("properties.interestShort")}{" "}
              <span className="tabular-nums text-fg">
                {formatBalance(paidSplit.interest, settings, {
                  neverAbbreviate: true,
                })}
              </span>
            </span>
            <span>
              {t("properties.amortShort")}{" "}
              <span className="tabular-nums text-fg">
                {formatBalance(paidSplit.amortization, settings, {
                  neverAbbreviate: true,
                })}
              </span>
            </span>
          </span>
        </span>
      )}
      <span className="flex items-center gap-2">
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
      </span>
    </li>
  );
}
