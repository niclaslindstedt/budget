import { Home, Pencil, Plus, Search, TrendingUp, Trash2 } from "lucide-react";

import { resolveMonthlyAmortization } from "../../data/property-mortgage/amortization";
import type { Account, Mortgage, Property, Settings } from "../../data/types";
import { useT } from "../../i18n";
import { formatBalance, formatNumber } from "../../utils/format";

// One property's block on the Properties page: its name, what it cost,
// its current value (the latest recorded snapshot), and the mortgages
// against it. All editing routes back through the page's modals via the
// callbacks — the card is presentational.

type Props = {
  property: Property;
  accountsById: ReadonlyMap<string, Account>;
  settings: Settings;
  onEditProperty: (property: Property) => void;
  onDeleteProperty: (property: Property) => void;
  onUpdateValue: (property: Property) => void;
  onAddMortgage: (property: Property) => void;
  onEditMortgage: (property: Property, mortgage: Mortgage) => void;
  onDeleteMortgage: (property: Property, mortgage: Mortgage) => void;
  onFindPayments: (property: Property, mortgage: Mortgage) => void;
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
  settings,
  onEditProperty,
  onDeleteProperty,
  onUpdateValue,
  onAddMortgage,
  onEditMortgage,
  onDeleteMortgage,
  onFindPayments,
}: Props) {
  const t = useT();
  const value = currentValue(property);

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
              {formatBalance(value, settings)}
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
              {formatBalance(property.purchaseAmount, settings)}
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
                accountsById={accountsById}
                settings={settings}
                onEdit={onEditMortgage}
                onDelete={onDeleteMortgage}
                onFind={onFindPayments}
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
  accountsById,
  settings,
  onEdit,
  onDelete,
  onFind,
}: {
  property: Property;
  mortgage: Mortgage;
  accountsById: ReadonlyMap<string, Account>;
  settings: Settings;
  onEdit: (property: Property, mortgage: Mortgage) => void;
  onDelete: (property: Property, mortgage: Mortgage) => void;
  onFind: (property: Property, mortgage: Mortgage) => void;
}) {
  const t = useT();
  const account = mortgage.accountId
    ? accountsById.get(mortgage.accountId)
    : undefined;
  const count = mortgage.payments.length;
  const principal = mortgage.payments.reduce((s, p) => s + p.principal, 0);
  const interest = mortgage.payments.reduce((s, p) => s + p.interest, 0);
  const monthlyAmort = resolveMonthlyAmortization(mortgage);
  const hasTerms =
    mortgage.loanAmount !== undefined ||
    mortgage.currentBalance !== undefined ||
    mortgage.interestRate !== undefined ||
    mortgage.rateChangeMonths !== undefined ||
    mortgage.nextRateChangeDate !== undefined ||
    mortgage.amortization !== undefined;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-line bg-surface-2 px-2.5 py-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-fg-bright">{mortgage.name}</span>
        <span className="block truncate text-xs text-muted">
          {account ? account.name : t("properties.noAccountBound")}
          {count > 0 && (
            <>
              {" · "}
              {count === 1
                ? t("properties.paymentsCountOne", { count })
                : t("properties.paymentsCountOther", { count })}
            </>
          )}
        </span>
        {hasTerms && (
          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
            {mortgage.currentBalance !== undefined && (
              <span>
                {t("properties.balanceShort")}{" "}
                <span className="tabular-nums text-fg">
                  {formatBalance(mortgage.currentBalance, settings)}
                </span>
              </span>
            )}
            {mortgage.loanAmount !== undefined && (
              <span>
                {t("properties.loanShort")}{" "}
                <span className="tabular-nums text-fg">
                  {formatBalance(mortgage.loanAmount, settings)}
                </span>
              </span>
            )}
            {mortgage.interestRate !== undefined && (
              <span>
                {t("properties.rateShort")}{" "}
                <span className="tabular-nums text-fg">
                  {formatNumber(mortgage.interestRate, settings, {
                    neverAbbreviate: true,
                  })}
                  %
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
                    amount: formatBalance(monthlyAmort, settings),
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
        <span className="text-xs text-muted">
          {t("properties.principalTotal")}{" "}
          <span className="tabular-nums text-fg">
            {formatBalance(principal, settings)}
          </span>
          {" · "}
          {t("properties.interestTotal")}{" "}
          <span className="tabular-nums text-fg">
            {formatBalance(interest, settings)}
          </span>
        </span>
      )}
      <span className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onFind(property, mortgage)}
          className="inline-flex cursor-pointer items-center gap-1 rounded border border-line bg-surface px-2 py-1 text-xs text-accent hover:bg-surface-3"
        >
          <Search size={14} aria-hidden focusable={false} />
          <span className="hidden sm:inline">
            {t("properties.findPayments")}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onEdit(property, mortgage)}
          aria-label={t("properties.editMortgage")}
          className="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-fg"
        >
          <Pencil size={15} aria-hidden focusable={false} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(property, mortgage)}
          aria-label={t("properties.deleteMortgage")}
          className="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-danger"
        >
          <Trash2 size={15} aria-hidden focusable={false} />
        </button>
      </span>
    </li>
  );
}
