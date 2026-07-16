import { useRef, useState } from "react";
import { TrendingUp } from "lucide-react";

import {
  isCarPurchaseSnapshot,
  resolveCarSnapshots,
} from "../../data/cars/value";
import type { ImportedPoint } from "../../data/import/value-import";
import { newId } from "../../data/sheet";
import type { Car, CarSnapshot, Settings } from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import {
  distanceUnitLabel,
  formatBalance,
  formatDate,
  formatDistance,
  parseAmount,
} from "../../utils/format";
import { BatchValueImportModal } from "../BatchValueImportModal";
import { Button, ClearableInput, DateField } from "../form";
import { Modal } from "../Modal";

// Record a dated value and/or odometer reading for a car — appends one
// `CarSnapshot`. A sibling of the shared `ValueSnapshotModal`, not a
// wrapper: the shell assumes one value column, and a car snapshot
// records TWO figures (value + mileage, at least one required) in one
// dated point, so the form and history rows are car-specific. The batch
// importer still plugs in for values only.
//
// The synthesised purchase point (`isCarPurchaseSnapshot`) is owned by
// the car's purchase fields — it renders a read-only tag instead of a
// delete button, mirroring the property / item modals.
//
// Not `centered`: the value / mileage fields open the soft keyboard.

const AMOUNT_INPUT_CLASS =
  "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";

type Props = {
  open: boolean;
  car: Car | null;
  settings: Settings;
  onClose: () => void;
  onAdd: (carId: string, snapshot: CarSnapshot) => void;
  onImport: (carId: string, points: ImportedPoint[]) => void;
  onDelete: (carId: string, snapshotId: string) => void;
};

export function UpdateCarValueModal({
  open,
  car,
  settings,
  onClose,
  onAdd,
  onImport,
  onDelete,
}: Props) {
  const t = useT();
  const lang = useLang();
  const [value, setValue] = useState("");
  const [mileage, setMileage] = useState("");
  const [date, setDate] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const valueInputRef = useRef<HTMLInputElement | null>(null);
  const mileageInputRef = useRef<HTMLInputElement | null>(null);

  useResetOnOpen(open, car?.id, () => {
    setValue("");
    setMileage("");
    setDate(todayIso());
    setImportOpen(false);
  });

  if (!open || !car) return null;

  // Value surfaces only apply where the user holds capital. A leased car
  // is pure running cost, so the modal collapses to a plain "date + range"
  // odometer log — the same figure feeds cost-per-distance regardless.
  const tracksValue = car.ownership === "owned" || car.ownership === "shared";
  const unit = distanceUnitLabel(settings);

  const parsedValue = parseAmount(value);
  const parsedMileage = parseAmount(mileage);
  const canSubmit =
    date !== "" &&
    (parsedMileage !== null || (tracksValue && parsedValue !== null));

  // Append the snapshot but keep the modal open so the user can record a
  // run of readings. Clear the figures (the date stays) and refocus.
  function handleAdd() {
    if (!car || !canSubmit) return;
    const snapshot: CarSnapshot = { id: newId(), date };
    if (tracksValue && parsedValue !== null)
      snapshot.value = Math.abs(parsedValue);
    if (parsedMileage !== null) snapshot.mileage = Math.abs(parsedMileage);
    onAdd(car.id, snapshot);
    setValue("");
    setMileage("");
    (tracksValue ? valueInputRef : mileageInputRef).current?.focus();
  }

  // Newest first. Includes the synthesised purchase point so the list is
  // never empty for a car with a dated purchase.
  const history = resolveCarSnapshots(car)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return (
    <>
      <Modal
        open
        onClose={onClose}
        labelledBy="update-car-value-modal-title"
        size="max-w-sm"
      >
        <Modal.Header
          icon={<TrendingUp size={14} aria-hidden focusable={false} />}
          title={
            tracksValue
              ? t("carsSheet.updateValueTitle")
              : t("carsSheet.updateRangeTitle")
          }
          onClose={onClose}
        />
        <Modal.Body>
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm font-bold text-fg-bright">{car.name}</p>

            <p className="m-0 text-xs text-muted">
              {tracksValue
                ? t("carsSheet.valueOrMileageHint")
                : t("carsSheet.rangeOnlyHint", { unit })}
            </p>

            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleAdd();
              }}
            >
              {tracksValue && (
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">
                    {t("carsSheet.valueLabel")}
                  </span>
                  <ClearableInput
                    ref={valueInputRef}
                    value={value}
                    onValueChange={setValue}
                    inputMode="decimal"
                    placeholder={t("carsSheet.valuePlaceholder")}
                    className={AMOUNT_INPUT_CLASS}
                  />
                </label>
              )}

              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">
                  {t("carsSheet.rangeWithUnit", { unit })}
                </span>
                <ClearableInput
                  ref={mileageInputRef}
                  value={mileage}
                  onValueChange={setMileage}
                  inputMode="decimal"
                  placeholder={t("carsSheet.mileagePlaceholder")}
                  className={AMOUNT_INPUT_CLASS}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">
                  {t("carsSheet.asOfLabel")}
                </span>
                <DateField value={date} onChange={setDate} />
              </label>

              <Button type="submit" variant="primary" disabled={!canSubmit}>
                {t("common.add")}
              </Button>
            </form>

            {/* Batch import brings in value points only — offer it just
                where values are tracked. */}
            {tracksValue && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setImportOpen(true)}
              >
                {t("valueImport.trigger")}
              </Button>
            )}

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold tracking-wider uppercase text-muted">
                {t("carsSheet.valueHistory")}
              </span>
              {history.length === 0 ? (
                <p className="m-0 text-xs text-muted">
                  {t("carsSheet.noValueHistory")}
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {history.map((snapshot) => {
                    const isPurchase = isCarPurchaseSnapshot(snapshot);
                    return (
                      <li
                        key={snapshot.id}
                        className="flex items-center justify-between gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm"
                      >
                        <span className="flex items-center gap-2 text-muted">
                          {formatDate(snapshot.date, settings.dateFormat, lang)}
                          {isPurchase && (
                            <span className="rounded-full border border-line px-1.5 text-[0.65rem] tracking-wider uppercase text-muted">
                              {t("carsSheet.purchaseTag")}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-2">
                          {tracksValue && (
                            <span className="tabular-nums text-fg-bright">
                              {snapshot.value !== undefined
                                ? formatBalance(snapshot.value, settings, {
                                    neverAbbreviate: true,
                                  })
                                : "—"}
                            </span>
                          )}
                          <span className="tabular-nums text-muted">
                            {snapshot.mileage !== undefined
                              ? formatDistance(snapshot.mileage, settings, {
                                  neverAbbreviate: true,
                                })
                              : "—"}
                          </span>
                          {isPurchase ? (
                            // Owned by the car's purchase fields — change
                            // it by editing the car, not by deleting a
                            // snapshot here.
                            <span
                              aria-hidden
                              className="px-1 text-xs opacity-0"
                            >
                              ✕
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onDelete(car.id, snapshot.id)}
                              aria-label={t("common.delete")}
                              className="cursor-pointer rounded border-0 bg-transparent px-1 text-xs text-muted hover:text-danger"
                            >
                              ✕
                            </button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose}>
            {t("common.done")}
          </Button>
        </Modal.Footer>
      </Modal>
      <BatchValueImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        subject={car.name}
        valueLabel={t("carsSheet.valueLabel")}
        settings={settings}
        onImport={(points) => onImport(car.id, points)}
      />
    </>
  );
}
