import { BarChart3, LineChart, ReceiptText, TrendingUp } from "lucide-react";

import {
  carCostPerDistance,
  carTotalCostOfOwnership,
} from "../../data/cars/costs";
import {
  carDistanceDriven,
  computeCarCurrentValue,
  currentCarMileage,
  leasedCarEquity,
} from "../../data/cars/value";
import type { Car, Loan, Settings } from "../../data/types";
import { useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { formatBalance, formatNumber } from "../../utils/format";
import { CategoryIconGlyph } from "../icons";
import { CarActionsMenu } from "./CarActionsMenu";
import { ownershipLabel } from "./CarEditorModal";

// One car's block on the Cars page: what it's worth, how far it has
// been driven, and what it has really cost — the three legs (expenses,
// depreciation, loan interest) summed, plus the per-km headline once
// odometer data exists. All editing routes back through the page's
// modals via the callbacks — the card is presentational.

// Shared pill styling for the small data tokens on a car card — the
// ownership form, the sold badge, and the co-ownership share. Mirrors
// the property card's pill.
const PILL_CLASS =
  "inline-flex shrink-0 items-center rounded-full border border-line bg-surface-3 px-1.5 py-0.5 text-xs font-medium text-muted";

type Props = {
  car: Car;
  // The loan financing this car, resolved by the page (null when none).
  loan: Loan | null;
  settings: Settings;
  onUpdateValue: (car: Car) => void;
  onVisualizeValue: (car: Car) => void;
  onViewCosts: (car: Car) => void;
  onViewExpenses: (car: Car) => void;
  onFindExpenses: (car: Car) => void;
  onAddManualExpense: (car: Car) => void;
  onManageContracts: (car: Car) => void;
  onEditCar: (car: Car) => void;
  onDeleteCar: (car: Car) => void;
};

export function CarCard({
  car,
  loan,
  settings,
  onUpdateValue,
  onVisualizeValue,
  onViewCosts,
  onViewExpenses,
  onFindExpenses,
  onAddManualExpense,
  onManageContracts,
  onEditCar,
  onDeleteCar,
}: Props) {
  const t = useT();
  const today = todayIso();
  const isSold = car.soldAt !== undefined || car.soldFor !== undefined;
  // Value surfaces only apply where the user holds capital — a leased /
  // pool car renders costs alone.
  const tracksValue = car.ownership === "owned" || car.ownership === "shared";
  const value = computeCarCurrentValue(car, today);
  const mileage = currentCarMileage(car, today);
  const distance = carDistanceDriven(car, today);
  const legs = carTotalCostOfOwnership(car, loan ?? undefined, today);
  const totalCost =
    legs.expenses + (legs.depreciation ?? 0) + (legs.loanInterest ?? 0);
  const perDistance = carCostPerDistance(car, loan ?? undefined, today);
  // A leased car's current net-worth position (market value minus
  // outstanding lease balance) — negative while the car is worth less
  // than the balance owed, recovering toward zero by lease end.
  const leaseEquity =
    car.ownership === "leased" ? leasedCarEquity(car, today) : undefined;

  const ownershipPill = ownershipLabel(t, car.ownership);

  return (
    <section className="overflow-clip rounded border border-line bg-surface">
      <header className="flex items-center gap-2 border-b border-line bg-surface-3 px-3 py-2">
        <CategoryIconGlyph
          name={car.glyph ?? "car"}
          size={16}
          className="shrink-0 text-accent"
          style={car.color ? { color: car.color } : undefined}
        />
        <span className="min-w-0 flex-1 truncate font-bold text-fg-bright">
          {car.name}
        </span>
        <span className={PILL_CLASS}>{ownershipPill}</span>
        {car.sharePct !== undefined && (
          <span className={PILL_CLASS}>
            {t("carsSheet.sharePill", { pct: car.sharePct })}
          </span>
        )}
        {isSold && (
          <span className={PILL_CLASS}>{t("carsSheet.soldBadge")}</span>
        )}
        {tracksValue && (
          <button
            type="button"
            onClick={() => onVisualizeValue(car)}
            aria-label={t("carsSheet.valueChartTitle")}
            className="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-fg"
          >
            <LineChart size={16} aria-hidden focusable={false} />
          </button>
        )}
        <button
          type="button"
          onClick={() => onViewCosts(car)}
          aria-label={t("carsSheet.costChartTitle")}
          className="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-fg"
        >
          <BarChart3 size={16} aria-hidden focusable={false} />
        </button>
        <button
          type="button"
          onClick={() => onViewExpenses(car)}
          aria-label={t("carsSheet.viewExpenses")}
          className="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-fg"
        >
          <ReceiptText size={16} aria-hidden focusable={false} />
        </button>
        <CarActionsMenu
          car={car}
          onFindExpenses={onFindExpenses}
          onAddManualExpense={onAddManualExpense}
          onManageContracts={onManageContracts}
          onEditCar={onEditCar}
          onDeleteCar={onDeleteCar}
        />
      </header>

      {car.description !== undefined && car.description !== "" && (
        <p className="m-0 border-b border-line px-3 py-1.5 text-xs text-muted">
          {car.description}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 px-3 py-2 text-sm sm:grid-cols-3">
        {tracksValue && !isSold && (
          <Stat label={t("carsSheet.currentValue")}>
            <button
              type="button"
              onClick={() => onUpdateValue(car)}
              aria-label={t("carsSheet.updateValue")}
              className="group flex w-fit cursor-pointer items-center gap-1 rounded border-0 bg-transparent p-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              {value !== undefined ? (
                <span className="tabular-nums text-fg-bright group-hover:text-accent">
                  {formatBalance(value, settings, { neverAbbreviate: true })}
                </span>
              ) : (
                <span className="text-xs text-muted group-hover:text-accent">
                  {t("carsSheet.noValue")}
                </span>
              )}
              <TrendingUp
                size={12}
                aria-hidden
                focusable={false}
                className="shrink-0 text-muted group-hover:text-accent"
              />
            </button>
          </Stat>
        )}
        {car.ownership === "leased" && car.leaseMonthlyCost !== undefined && (
          <Stat label={t("carsSheet.leaseMonthlyCostLabel")}>
            <span className="tabular-nums text-fg">
              {formatBalance(car.leaseMonthlyCost, settings, {
                neverAbbreviate: true,
              })}
            </span>
          </Stat>
        )}
        {leaseEquity !== undefined && (
          <Stat label={t("carsSheet.leaseNetPosition")}>
            <span
              className={`tabular-nums ${
                leaseEquity < 0 ? "text-negative" : "text-positive"
              }`}
            >
              {formatBalance(leaseEquity, settings, { neverAbbreviate: true })}
            </span>
          </Stat>
        )}
        {tracksValue && car.purchasePrice !== undefined && (
          <Stat label={t("carsSheet.boughtFor")}>
            <span className="tabular-nums text-fg">
              {formatBalance(car.purchasePrice, settings, {
                neverAbbreviate: true,
              })}
            </span>
          </Stat>
        )}
        {car.purchaseDate !== undefined && (
          <Stat label={t("carsSheet.purchased")}>
            <span className="text-fg">{car.purchaseDate}</span>
          </Stat>
        )}
        {isSold && car.soldFor !== undefined && (
          <Stat label={t("carsSheet.soldFor")}>
            <span className="tabular-nums text-fg">
              {formatBalance(car.soldFor, settings, { neverAbbreviate: true })}
            </span>
          </Stat>
        )}
        {isSold && car.soldAt !== undefined && (
          <Stat label={t("carsSheet.soldOn")}>
            <span className="text-fg">{car.soldAt}</span>
          </Stat>
        )}
        {mileage !== undefined && (
          <Stat label={t("carsSheet.mileageLabel")}>
            <button
              type="button"
              onClick={() => onUpdateValue(car)}
              aria-label={t("carsSheet.updateValue")}
              className="group flex w-fit cursor-pointer items-center gap-1 rounded border-0 bg-transparent p-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <span className="tabular-nums text-fg group-hover:text-accent">
                {formatNumber(mileage, settings, { neverAbbreviate: true })}
              </span>
              <TrendingUp
                size={12}
                aria-hidden
                focusable={false}
                className="shrink-0 text-muted group-hover:text-accent"
              />
            </button>
          </Stat>
        )}
        {distance !== undefined && distance > 0 && (
          <Stat label={t("carsSheet.distanceDriven")}>
            <span className="tabular-nums text-fg">
              {formatNumber(distance, settings, { neverAbbreviate: true })}
            </span>
          </Stat>
        )}
        <Stat label={t("carsSheet.totalCosts")}>
          <button
            type="button"
            onClick={() => onViewCosts(car)}
            aria-label={t("carsSheet.costChartTitle")}
            className="group flex w-fit cursor-pointer items-center gap-1 rounded border-0 bg-transparent p-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          >
            <span className="tabular-nums text-fg-bright group-hover:text-accent">
              {formatBalance(totalCost, settings, { neverAbbreviate: true })}
            </span>
          </button>
        </Stat>
        {perDistance !== undefined && (
          <Stat label={t("carsSheet.costPerDistance")}>
            <span className="tabular-nums text-fg-bright">
              {/* Force decimals — a per-km rate rounded to whole
                  currency units ("2 kr") hides most of the signal. */}
              {formatBalance(
                perDistance,
                { ...settings, showDecimals: true },
                { neverAbbreviate: true },
              )}
            </span>
          </Stat>
        )}
        {loan && (
          <Stat label={t("carsSheet.loanLabel")}>
            <span className="truncate text-fg">{loan.name}</span>
          </Stat>
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
