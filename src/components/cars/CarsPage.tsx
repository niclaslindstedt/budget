import { useEffect, useMemo, useState } from "react";
import { Car as CarIcon, Pencil, Plus } from "lucide-react";

import { findCarExpenseCandidates } from "../../data/cars/find";
import { allTypes } from "../../data/presets/merge";
import type { Action } from "../../data/reducer";
import type {
  Car,
  CarExpense,
  EntryType,
  Settings,
  Sheet,
  UserData,
} from "../../data/types";
import { useT } from "../../i18n";
import { ActiveRowProvider } from "../ActiveRowProvider";
import { ConfirmDialog } from "../ConfirmDialog";
import { useModalDispatch } from "../modal-dispatch";
import {
  SheetTitleMenu,
  favoriteMenuItem,
  type SheetTitleMenuItem,
} from "../SheetTitleMenu";
import { CarCard } from "./CarCard";
import { CarCostChartModal } from "./CarCostChartModal";
import { CarEditorModal } from "./CarEditorModal";
import { CarExpenseFinderModal } from "./CarExpenseFinderModal";
import { CarExpensesModal } from "./CarExpensesModal";
import { CarValueChartModal } from "./CarValueChartModal";
import { ManualCarExpenseModal } from "./ManualCarExpenseModal";
import { UpdateCarValueModal } from "./UpdateCarValueModal";

type Props = {
  sheet: Sheet;
  data: UserData;
  settings: Settings;
  dispatch: (action: Action) => void;
};

// The page's mutually-exclusive modal set, modelled as one discriminated
// state so only one can be open at a time by construction. Each opens
// from a car card (or the sheet "…" menu) with the card behind it, so
// none of them stack. The manual-expense editor is the exception: it
// can layer on top of the `expenses` list modal, so it keeps its own
// state below.
type CarModalState =
  | { kind: "edit"; car: Car }
  | { kind: "create" }
  | { kind: "value"; car: Car }
  | { kind: "chart"; car: Car }
  | { kind: "costs"; car: Car }
  | { kind: "expenses"; car: Car }
  | { kind: "find"; car: Car }
  | { kind: "deleteCar"; car: Car };

export function CarsPage({ sheet, data, settings, dispatch }: Props) {
  const t = useT();
  const dispatchModal = useModalDispatch();

  const [modal, setModal] = useState<CarModalState | null>(null);
  // The manual-expense editor — stacks ON TOP of the `expenses` list
  // modal (edit a manual row) or opens on its own from the card menu.
  // `expense: null` is add mode.
  const [manualEditor, setManualEditor] = useState<{
    car: Car;
    expense: CarExpense | null;
  } | null>(null);

  // Land at the top of the page when switching to this sheet.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [sheet.id]);

  // Merged preset + user types — resolves each expense's / candidate's
  // display name and glyph.
  const typesById = useMemo(() => {
    const m = new Map<string, EntryType>();
    for (const type of allTypes(data)) m.set(type.id, type);
    return m;
  }, [data]);

  // Active cars first (stored order), sold ones after — kept for
  // history, not part of the active fleet. Mirrors the properties page.
  const cars = useMemo(
    () =>
      [...data.cars].sort((a, b) => {
        const aSold = a.soldAt !== undefined || a.soldFor !== undefined;
        const bSold = b.soldAt !== undefined || b.soldFor !== undefined;
        if (aSold !== bSold) return aSold ? 1 : -1;
        return 0;
      }),
    [data.cars],
  );

  const loanFor = (car: Car) =>
    car.loanId !== undefined
      ? (data.loans.find((l) => l.id === car.loanId) ?? null)
      : null;

  // The modals read the live record after each dispatch so an edit /
  // add is reflected immediately (held by id, resolved against `data`).
  const liveCar = (car: Car): Car | null =>
    data.cars.find((c) => c.id === car.id) ?? null;
  const liveValueCar = modal?.kind === "value" ? liveCar(modal.car) : null;
  const liveChartCar = modal?.kind === "chart" ? liveCar(modal.car) : null;
  const liveCostsCar = modal?.kind === "costs" ? liveCar(modal.car) : null;
  const liveExpensesCar =
    modal?.kind === "expenses" ? liveCar(modal.car) : null;
  const liveFindCar = modal?.kind === "find" ? liveCar(modal.car) : null;
  const liveManualCar = manualEditor ? liveCar(manualEditor.car) : null;

  // Candidate charges — recomputed while the finder is open so an
  // ignore / exclude dispatch drops the row immediately.
  const candidates = useMemo(
    () => (liveFindCar !== null ? findCarExpenseCandidates(data) : []),
    [liveFindCar, data],
  );

  const titleMenuItems: SheetTitleMenuItem[] = [
    favoriteMenuItem(sheet, t, dispatchModal),
    {
      key: "edit",
      icon: <Pencil size={16} aria-hidden focusable={false} />,
      label: t("sheet.editSheet"),
      onClick: () =>
        dispatchModal({ kind: "open-edit-sheet", sheetId: sheet.id }),
    },
  ];

  const hasCars = cars.length > 0;

  return (
    <ActiveRowProvider>
      <section>
        <header className="mb-2 flex items-center justify-center md:mb-6">
          <h2 className="m-0">
            <SheetTitleMenu sheetName={sheet.name} items={titleMenuItems} />
          </h2>
        </header>

        <section className="mb-4 flex flex-col gap-4" data-sheet-content>
          {!hasCars ? (
            <div className="flex flex-col items-center gap-4 rounded border border-line bg-surface px-4 py-8 text-center">
              <p className="m-0 text-sm text-muted">{t("carsSheet.noCars")}</p>
              <button
                type="button"
                onClick={() => setModal({ kind: "create" })}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-line bg-surface-3 px-3 py-2 text-sm text-accent hover:bg-surface"
              >
                <CarIcon size={16} aria-hidden focusable={false} />
                {t("carsSheet.addCar")}
              </button>
            </div>
          ) : (
            <>
              {cars.map((car) => (
                <CarCard
                  key={car.id}
                  car={car}
                  loan={loanFor(car)}
                  settings={settings}
                  onUpdateValue={(car) => setModal({ kind: "value", car })}
                  onVisualizeValue={(car) => setModal({ kind: "chart", car })}
                  onViewCosts={(car) => setModal({ kind: "costs", car })}
                  onViewExpenses={(car) => setModal({ kind: "expenses", car })}
                  onFindExpenses={(car) => setModal({ kind: "find", car })}
                  onAddManualExpense={(car) =>
                    setManualEditor({ car, expense: null })
                  }
                  onEditCar={(car) => setModal({ kind: "edit", car })}
                  onDeleteCar={(car) => setModal({ kind: "deleteCar", car })}
                />
              ))}
              <button
                type="button"
                onClick={() => setModal({ kind: "create" })}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded border border-line bg-surface-3 px-3 py-2 text-sm text-accent hover:bg-surface"
              >
                <Plus size={16} aria-hidden focusable={false} />
                {t("carsSheet.addCar")}
              </button>
            </>
          )}
        </section>

        <CarEditorModal
          open={modal?.kind === "edit" || modal?.kind === "create"}
          car={modal?.kind === "edit" ? modal.car : null}
          loans={data.loans}
          settings={settings}
          onClose={() => setModal(null)}
          onSubmit={(carId, patch) => {
            dispatch({ type: "updateCar", carId, patch });
            setModal(null);
          }}
          onCreate={(car) => {
            dispatch({ type: "addCar", car });
            setModal(null);
          }}
          onDelete={(car) => setModal({ kind: "deleteCar", car })}
        />

        <UpdateCarValueModal
          open={liveValueCar !== null}
          car={liveValueCar}
          settings={settings}
          onClose={() => setModal(null)}
          onAdd={(carId, snapshot) =>
            dispatch({ type: "addCarSnapshot", carId, snapshot })
          }
          onImport={(carId, points) =>
            dispatch({ type: "importCarSnapshots", carId, points })
          }
          onDelete={(carId, snapshotId) =>
            dispatch({ type: "deleteCarSnapshot", carId, snapshotId })
          }
        />

        <CarValueChartModal
          open={liveChartCar !== null}
          car={liveChartCar}
          loan={liveChartCar ? loanFor(liveChartCar) : null}
          settings={settings}
          onClose={() => setModal(null)}
        />

        <CarCostChartModal
          open={liveCostsCar !== null}
          car={liveCostsCar}
          loan={liveCostsCar ? loanFor(liveCostsCar) : null}
          settings={settings}
          typesById={typesById}
          onClose={() => setModal(null)}
        />

        <CarExpensesModal
          open={liveExpensesCar !== null}
          car={liveExpensesCar}
          settings={settings}
          typesById={typesById}
          onClose={() => setModal(null)}
          onRemoveExpense={(carId, expenseId) =>
            dispatch({ type: "removeCarExpense", carId, expenseId })
          }
          onEditExpense={(car, expense) => setManualEditor({ car, expense })}
          onFindExpenses={(car) => setModal({ kind: "find", car })}
          onAddManual={(car) => setManualEditor({ car, expense: null })}
        />

        <CarExpenseFinderModal
          open={liveFindCar !== null}
          car={liveFindCar}
          candidates={candidates}
          settings={settings}
          typesById={typesById}
          onClose={() => setModal(null)}
          onAdd={(carId, expenses) =>
            dispatch({ type: "addCarExpenses", carId, expenses })
          }
          onIgnore={(entryId) =>
            dispatch({ type: "ignoreCarExpenseEntry", entryId })
          }
          onExcludeSimilar={(description) =>
            dispatch({ type: "excludeSimilarCarExpenses", description })
          }
        />

        <ManualCarExpenseModal
          open={liveManualCar !== null}
          car={liveManualCar}
          expense={manualEditor?.expense ?? null}
          settings={settings}
          typesById={typesById}
          onClose={() => setManualEditor(null)}
          onAdd={(carId, expense) =>
            dispatch({ type: "addCarExpenses", carId, expenses: [expense] })
          }
          onUpdate={(carId, expenseId, patch) =>
            dispatch({ type: "updateCarExpense", carId, expenseId, patch })
          }
        />

        <ConfirmDialog
          open={modal?.kind === "deleteCar"}
          title={t("carsSheet.deleteCarTitle")}
          description={
            modal?.kind === "deleteCar"
              ? t("carsSheet.deleteCarConfirm", { name: modal.car.name })
              : null
          }
          actions={[
            {
              label: t("carsSheet.deleteCar"),
              tone: "danger",
              onSelect: () => {
                if (modal?.kind === "deleteCar")
                  dispatch({ type: "deleteCar", carId: modal.car.id });
                setModal(null);
              },
            },
          ]}
          onCancel={() => setModal(null)}
        />
      </section>
    </ActiveRowProvider>
  );
}
