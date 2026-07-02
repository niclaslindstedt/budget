import { Pencil, Plus, Search, Trash2 } from "lucide-react";

import type { Car } from "../../data/types";
import { useT } from "../../i18n";
import { ActionsMenu } from "../form/ActionsMenu";
import { type MenuItem } from "../form/menu";

type Props = {
  car: Car;
  onFindExpenses: (car: Car) => void;
  onAddManualExpense: (car: Car) => void;
  onEditCar: (car: Car) => void;
  onDeleteCar: (car: Car) => void;
};

// The "…" overflow menu in a car card's header. Collapses the per-car
// actions (find / add expenses, edit, delete) into one trigger so the
// header stays uncluttered. Updating the recorded value is reached by
// pressing the current-value figure in the card's stat grid; the value
// chart, cost chart, and expenses list are their own glyph buttons to
// the left of this menu. Mirrors `PropertyActionsMenu`.
export function CarActionsMenu({
  car,
  onFindExpenses,
  onAddManualExpense,
  onEditCar,
  onDeleteCar,
}: Props) {
  const t = useT();

  const items: MenuItem[] = [
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
