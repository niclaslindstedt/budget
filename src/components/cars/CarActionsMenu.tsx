import { FileText, Gauge, Pencil, Plus, Search, Trash2 } from "lucide-react";

import type { Car } from "../../data/types";
import { useT } from "../../i18n";
import { ActionsMenu } from "../form/ActionsMenu";
import { type MenuItem } from "../form/menu";

type Props = {
  car: Car;
  onUpdateRange: (car: Car) => void;
  onFindExpenses: (car: Car) => void;
  onAddManualExpense: (car: Car) => void;
  onManageContracts: (car: Car) => void;
  onEditCar: (car: Car) => void;
  onDeleteCar: (car: Car) => void;
};

// The "…" overflow menu in a car card's header. Collapses the per-car
// actions (update range, find / add expenses, edit, delete) into one
// trigger so the header stays uncluttered. Updating the recorded value is
// reached by pressing the current-value figure in the card's stat grid;
// the value chart, cost chart, and expenses list are their own glyph
// buttons to the left of this menu. Mirrors `PropertyActionsMenu`.
//
// "Update range" is the always-reachable entry point for logging an
// odometer reading — the card's Range stat only opens the modal once a
// reading exists, and a leased car has no value stat at all, so without
// this a fresh leased car had no way in. A car-pool car is pure running
// cost with no per-km story of its own, so it doesn't offer range
// tracking.
export function CarActionsMenu({
  car,
  onUpdateRange,
  onFindExpenses,
  onAddManualExpense,
  onManageContracts,
  onEditCar,
  onDeleteCar,
}: Props) {
  const t = useT();

  const items: MenuItem[] = [
    ...(car.ownership !== "pool"
      ? [
          {
            key: "updateRange",
            icon: <Gauge size={16} aria-hidden focusable={false} />,
            label: t("carsSheet.updateRange"),
            onClick: () => onUpdateRange(car),
          },
        ]
      : []),
    {
      key: "findExpenses",
      icon: <Search size={16} aria-hidden focusable={false} />,
      label: t("carsSheet.findExpenses"),
      onClick: () => onFindExpenses(car),
    },
    {
      key: "addManualExpense",
      icon: <Plus size={16} aria-hidden focusable={false} />,
      label: t("carsSheet.addManualExpense"),
      onClick: () => onAddManualExpense(car),
    },
    {
      key: "contracts",
      icon: <FileText size={16} aria-hidden focusable={false} />,
      label: t("carsSheet.contractsMenu"),
      onClick: () => onManageContracts(car),
    },
    {
      key: "editCar",
      icon: <Pencil size={16} aria-hidden focusable={false} />,
      label: t("carsSheet.editCar"),
      onClick: () => onEditCar(car),
    },
    {
      key: "deleteCar",
      icon: <Trash2 size={16} aria-hidden focusable={false} />,
      label: t("carsSheet.deleteCar"),
      danger: true,
      onClick: () => onDeleteCar(car),
    },
  ];

  return (
    <ActionsMenu
      items={items}
      ariaLabel={t("cell.moreActions")}
      // Card-header trigger, not the swipe-strip "…" — a quiet icon
      // button matching the header's other glyph buttons.
      triggerClassName="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-fg"
    />
  );
}
