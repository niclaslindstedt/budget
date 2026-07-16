import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import {
  CAR_COLORS,
  CARS_GLYPH_NAMES,
  DEFAULT_CAR_COLOR,
} from "../../data/constants/taxonomy";
import { newId } from "../../data/sheet";
import type {
  Car,
  CarOwnership,
  CategoryIcon,
  ItemDepreciation,
  Loan,
  Settings,
} from "../../data/types";
import { useDesktopAutoFocus, useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import { formatAmountForInput, parseAmount } from "../../utils/format";
import { tintBorder, tintFill } from "../../utils/tint";
import { ColorPalette } from "../ColorPalette";
import {
  Button,
  Checkbox,
  ClearableInput,
  ClearableTextarea,
  DateField,
  FormSection,
  SelectPicker,
  type SelectOption,
} from "../form";
import { GlyphPicker } from "../GlyphPicker";
import { CategoryIconGlyph } from "../icons";
import { Modal } from "../Modal";

// Create / edit one `Car` — name, how the user has access to it
// (owned / leased / shared / pool), the purchase figures the value model
// anchors on, the depreciation curve, the financing loan, and the sale.
// Snapshots and expenses are managed from the card, not here. Mirrors
// `PropertyEditorModal` / `LoanModal`.
//
// Not `centered`: the name / amount fields open the soft keyboard.

type Props = {
  open: boolean;
  // The car to edit, or null in create mode (blank fields, "New car"
  // title, Save mints a fresh car).
  car: Car | null;
  loans: readonly Loan[];
  settings: Settings;
  onClose: () => void;
  // Fires on Save in edit mode with the changed fields. A field set to
  // `undefined` clears it (the reducer deletes the key).
  onSubmit: (carId: string, patch: Partial<Omit<Car, "id">>) => void;
  // Fires on Save in create mode with the assembled car (fresh id).
  onCreate: (car: Car) => void;
  // Edit mode only: arms the page-level delete confirmation.
  onDelete?: (car: Car) => void;
};

const DEFAULT_COLOR = DEFAULT_CAR_COLOR;
const OWNERSHIPS: readonly CarOwnership[] = [
  "owned",
  "leased",
  "shared",
  "pool",
];
// SelectPicker value for the "no loan" option.
const LOAN_NONE = "";

function seedAmount(value: number | undefined, settings: Settings): string {
  if (value === undefined) return "";
  return formatAmountForInput(Math.abs(value), settings);
}

export function CarEditorModal({
  open,
  car,
  loans,
  settings,
  onClose,
  onSubmit,
  onCreate,
  onDelete,
}: Props) {
  const t = useT();
  const isEdit = car !== null;

  const [name, setName] = useState("");
  const [ownership, setOwnership] = useState<CarOwnership>("owned");
  const [description, setDescription] = useState("");
  const [glyph, setGlyph] = useState<CategoryIcon | null>(null);
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchaseMileage, setPurchaseMileage] = useState("");
  const [sharePct, setSharePct] = useState("");
  const [depreciates, setDepreciates] = useState(false);
  const [depMode, setDepMode] = useState<"steady" | "accelerated">("steady");
  const [ratePerYear, setRatePerYear] = useState("");
  const [initialDrop, setInitialDrop] = useState("");
  const [firstYearRate, setFirstYearRate] = useState("");
  const [floor, setFloor] = useState("");
  const [loanId, setLoanId] = useState<string>(LOAN_NONE);
  const [leaseStart, setLeaseStart] = useState("");
  const [leaseMonths, setLeaseMonths] = useState("");
  const [leaseMonthlyCost, setLeaseMonthlyCost] = useState("");
  const [leaseInterestRate, setLeaseInterestRate] = useState("");
  const [leaseStartValue, setLeaseStartValue] = useState("");
  const [leaseEndValue, setLeaseEndValue] = useState("");
  const [soldDate, setSoldDate] = useState("");
  const [soldFor, setSoldFor] = useState("");

  const nameRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(nameRef, open);

  useResetOnOpen(open, car?.id ?? "__create__", () => {
    setName(car?.name ?? "");
    setOwnership(car?.ownership ?? "owned");
    setDescription(car?.description ?? "");
    setGlyph(car?.glyph ?? null);
    setColor(car?.color ?? DEFAULT_COLOR);
    setPurchasePrice(seedAmount(car?.purchasePrice, settings));
    setPurchaseDate(car?.purchaseDate ?? "");
    setPurchaseMileage(seedAmount(car?.purchaseMileage, settings));
    setSharePct(car?.sharePct !== undefined ? String(car.sharePct) : "");
    const dep = car?.depreciation;
    setDepreciates(dep !== undefined);
    setDepMode(dep?.method === "accelerated" ? "accelerated" : "steady");
    setRatePerYear(dep ? formatAmountForInput(dep.ratePerYear, settings) : "");
    setInitialDrop(
      dep?.method === "accelerated"
        ? formatAmountForInput(dep.initialDrop, settings)
        : "",
    );
    setFirstYearRate(
      dep?.method === "accelerated"
        ? formatAmountForInput(dep.firstYearRate, settings)
        : "",
    );
    setFloor(dep?.floor !== undefined ? seedAmount(dep.floor, settings) : "");
    setLoanId(car?.loanId ?? LOAN_NONE);
    setLeaseStart(car?.leaseStart ?? "");
    setLeaseMonths(
      car?.leaseMonths !== undefined ? String(car.leaseMonths) : "",
    );
    setLeaseMonthlyCost(seedAmount(car?.leaseMonthlyCost, settings));
    setLeaseInterestRate(
      car?.leaseInterestRate !== undefined ? String(car.leaseInterestRate) : "",
    );
    setLeaseStartValue(seedAmount(car?.leaseStartValue, settings));
    setLeaseEndValue(seedAmount(car?.leaseEndValue, settings));
    setSoldDate(car?.soldAt ?? "");
    setSoldFor(seedAmount(car?.soldFor, settings));
  });

  if (!open) return null;

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0;
  // Value tracking (purchase, depreciation, share) only applies to cars
  // the user holds capital in.
  const holdsCapital = ownership === "owned" || ownership === "shared";

  // Car loans first — that's the kind a car is financed with — then the
  // rest, each group in name order.
  const loanOptions: SelectOption<string>[] = [
    { value: LOAN_NONE, label: t("carsSheet.loanNone") },
    ...loans
      .slice()
      .sort((a, b) => {
        const aCar = a.kind === "car" ? 0 : 1;
        const bCar = b.kind === "car" ? 0 : 1;
        if (aCar !== bCar) return aCar - bCar;
        return a.name.localeCompare(b.name);
      })
      .map((loan) => ({ value: loan.id, label: loan.name })),
  ];

  function num(text: string): number | undefined {
    const parsed = parseAmount(text);
    return parsed === null ? undefined : Math.abs(parsed);
  }

  function handleSubmit() {
    if (!canSubmit) return;

    // Depreciation: only persisted for owned / shared cars when enabled
    // AND at least the model's anchor rate is set. Mirrors ItemEditorModal.
    const depOn = depreciates && holdsCapital;
    const rate = depOn ? num(ratePerYear) : undefined;
    const drop = depOn ? num(initialDrop) : undefined;
    const firstYear = depOn ? num(firstYearRate) : undefined;
    let depreciation: ItemDepreciation | undefined;
    if (depOn && depMode === "steady" && rate !== undefined) {
      depreciation = { method: "percentPerYear", ratePerYear: rate };
    } else if (
      depOn &&
      depMode === "accelerated" &&
      (rate !== undefined || drop !== undefined || firstYear !== undefined)
    ) {
      // A blank first-year rate inherits the following-years rate; blank
      // rates are 0.
      depreciation = {
        method: "accelerated",
        initialDrop: drop ?? 0,
        firstYearRate: firstYear ?? rate ?? 0,
        ratePerYear: rate ?? 0,
      };
    }
    if (depreciation) {
      const floorNum = num(floor);
      if (floorNum !== undefined) depreciation.floor = floorNum;
    }

    // The ownership share only means something for a shared car, and only
    // in the exclusive (0, 100) range the type documents.
    const share = ownership === "shared" ? num(sharePct) : undefined;
    const sharePctValue =
      share !== undefined && share > 0 && share < 100 ? share : undefined;

    // Lease terms only ride with a leased car — switching away clears
    // them. Months is a whole positive count.
    const isLeased = ownership === "leased";
    const monthsNum = isLeased ? num(leaseMonths) : undefined;
    const leaseMonthsValue =
      monthsNum !== undefined && monthsNum >= 1
        ? Math.round(monthsNum)
        : undefined;

    const patch: Partial<Omit<Car, "id">> = {
      name: trimmedName,
      ownership,
      description: description.trim() !== "" ? description.trim() : undefined,
      glyph: glyph ?? undefined,
      color,
      purchaseDate:
        holdsCapital && purchaseDate !== "" ? purchaseDate : undefined,
      purchasePrice: holdsCapital ? num(purchasePrice) : undefined,
      purchaseMileage: holdsCapital ? num(purchaseMileage) : undefined,
      sharePct: sharePctValue,
      depreciation,
      leaseStart: isLeased && leaseStart !== "" ? leaseStart : undefined,
      leaseMonths: leaseMonthsValue,
      leaseMonthlyCost: isLeased ? num(leaseMonthlyCost) : undefined,
      leaseInterestRate: isLeased ? num(leaseInterestRate) : undefined,
      leaseStartValue: isLeased ? num(leaseStartValue) : undefined,
      leaseEndValue: isLeased ? num(leaseEndValue) : undefined,
      loanId: holdsCapital && loanId !== LOAN_NONE ? loanId : undefined,
      // The sale amount rides only with a sale date — a price with no date
      // can't place the sale on the timeline.
      soldAt: soldDate !== "" ? soldDate : undefined,
      soldFor: soldDate !== "" ? num(soldFor) : undefined,
    };

    if (car) {
      onSubmit(car.id, patch);
      return;
    }
    // Create mode: drop every `undefined` so the new car is byte-clean
    // (absent optional fields aren't stored).
    const fresh: Car = {
      id: newId(),
      name: trimmedName,
      ownership,
      snapshots: [],
      expenses: [],
      contracts: [],
    };
    for (const [key, value] of Object.entries(patch)) {
      if (key === "name" || key === "ownership" || value === undefined)
        continue;
      (fresh as Record<string, unknown>)[key] = value;
    }
    onCreate(fresh);
  }

  const inputClass =
    "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";

  return (
    <Modal open onClose={onClose} labelledBy="car-editor-modal-title">
      <Modal.Header
        icon={<CategoryIconGlyph name="car" size={14} />}
        title={
          isEdit ? t("carsSheet.editCarTitle") : t("carsSheet.newCarTitle")
        }
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border"
              style={{
                color,
                backgroundColor: tintFill(color),
                borderColor: tintBorder(color),
              }}
            >
              <CategoryIconGlyph name={glyph ?? "car"} size={22} />
            </div>
            <FormSection
              as="label"
              className="min-w-0 flex-1"
              label={t("carsSheet.nameLabel")}
            >
              <ClearableInput
                value={name}
                onValueChange={setName}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                wrapperClassName="w-full min-w-0"
                className={inputClass}
                placeholder={t("carsSheet.namePlaceholder")}
                ref={nameRef}
              />
            </FormSection>
          </div>

          <FormSection label={t("carsSheet.ownershipLabel")}>
            {/* Four-segment sliding-pill toggle — the two-segment pattern
                from ItemEditorModal / MortgageViewToggle widened to four.
                The global reduce-motion rule zeroes the transition. */}
            <div
              role="group"
              aria-label={t("carsSheet.ownershipLabel")}
              className="relative flex rounded border border-line bg-surface-2"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-1/4 rounded bg-surface transition-transform"
                style={{
                  transform: `translateX(${OWNERSHIPS.indexOf(ownership) * 100}%)`,
                }}
              />
              {OWNERSHIPS.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setOwnership(mode)}
                  aria-pressed={ownership === mode}
                  className={`relative z-10 flex-1 cursor-pointer border-0 bg-transparent px-1 py-1.5 text-xs transition-colors ${
                    ownership === mode
                      ? "text-accent"
                      : "text-muted hover:text-fg"
                  }`}
                >
                  {ownershipLabel(t, mode)}
                </button>
              ))}
            </div>
          </FormSection>

          <FormSection as="label" label={t("carsSheet.descriptionLabel")}>
            <ClearableTextarea
              value={description}
              onValueChange={setDescription}
              placeholder={t("carsSheet.descriptionPlaceholder")}
              rows={2}
              wrapperClassName="w-full min-w-0"
              className={`${inputClass} resize-none`}
            />
          </FormSection>

          {holdsCapital && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <FormSection
                  as="label"
                  className="min-w-0"
                  label={t("carsSheet.purchasePriceLabel")}
                >
                  <ClearableInput
                    value={purchasePrice}
                    onValueChange={setPurchasePrice}
                    inputMode="decimal"
                    placeholder={formatAmountForInput(0, settings)}
                    wrapperClassName="w-full min-w-0"
                    className={inputClass}
                  />
                </FormSection>
                <FormSection
                  as="label"
                  className="min-w-0"
                  label={t("carsSheet.purchaseDateLabel")}
                >
                  <DateField value={purchaseDate} onChange={setPurchaseDate} />
                </FormSection>
              </div>

              <FormSection
                as="label"
                label={t("carsSheet.purchaseMileageLabel")}
              >
                <ClearableInput
                  value={purchaseMileage}
                  onValueChange={setPurchaseMileage}
                  inputMode="decimal"
                  placeholder={t("carsSheet.purchaseMileagePlaceholder")}
                  wrapperClassName="w-full min-w-0"
                  className={inputClass}
                />
              </FormSection>

              {ownership === "shared" && (
                <FormSection as="label" label={t("carsSheet.sharePctLabel")}>
                  <ClearableInput
                    value={sharePct}
                    onValueChange={setSharePct}
                    inputMode="decimal"
                    placeholder="50"
                    wrapperClassName="w-full min-w-0"
                    className={inputClass}
                  />
                  <p className="m-0 text-xs text-muted">
                    {t("carsSheet.sharePctHint")}
                  </p>
                </FormSection>
              )}

              <div className="flex flex-col gap-2 rounded border border-line bg-surface-3 p-3">
                <Checkbox
                  checked={depreciates}
                  onChange={setDepreciates}
                  label={t("carsSheet.depreciates")}
                />
                {depreciates && (
                  <>
                    <div
                      role="group"
                      aria-label={t("carsSheet.depreciationModel")}
                      className="relative flex rounded border border-line bg-surface-2"
                    >
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 left-0 w-1/2 rounded bg-surface transition-transform"
                        style={{
                          transform:
                            depMode === "accelerated"
                              ? "translateX(100%)"
                              : "translateX(0)",
                        }}
                      />
                      {(["steady", "accelerated"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setDepMode(mode)}
                          aria-pressed={depMode === mode}
                          className={`relative z-10 flex-1 cursor-pointer border-0 bg-transparent px-2 py-1.5 text-xs transition-colors ${
                            depMode === mode
                              ? "text-accent"
                              : "text-muted hover:text-fg"
                          }`}
                        >
                          {mode === "steady"
                            ? t("carsSheet.depreciationSteady")
                            : t("carsSheet.depreciationAccelerated")}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-muted">
                      {depMode === "steady"
                        ? t("carsSheet.depreciationSteadyHint")
                        : t("carsSheet.depreciationAcceleratedHint")}
                    </span>
                    {depMode === "steady" ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-muted">
                            {t("carsSheet.ratePerYear")}
                          </span>
                          <ClearableInput
                            value={ratePerYear}
                            onValueChange={setRatePerYear}
                            inputMode="decimal"
                            placeholder={t("carsSheet.ratePerYearPlaceholder")}
                            className={inputClass}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-muted">
                            {t("carsSheet.depreciationFloor")}
                          </span>
                          <ClearableInput
                            value={floor}
                            onValueChange={setFloor}
                            inputMode="decimal"
                            className={inputClass}
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-muted">
                            {t("carsSheet.initialDrop")}
                          </span>
                          <ClearableInput
                            value={initialDrop}
                            onValueChange={setInitialDrop}
                            inputMode="decimal"
                            placeholder={t("carsSheet.initialDropPlaceholder")}
                            className={inputClass}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-muted">
                            {t("carsSheet.firstYearRate")}
                          </span>
                          <ClearableInput
                            value={firstYearRate}
                            onValueChange={setFirstYearRate}
                            inputMode="decimal"
                            placeholder={t(
                              "carsSheet.firstYearRatePlaceholder",
                            )}
                            className={inputClass}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-muted">
                            {t("carsSheet.rateAfterFirstYear")}
                          </span>
                          <ClearableInput
                            value={ratePerYear}
                            onValueChange={setRatePerYear}
                            inputMode="decimal"
                            placeholder={t(
                              "carsSheet.rateAfterFirstYearPlaceholder",
                            )}
                            className={inputClass}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-muted">
                            {t("carsSheet.depreciationFloor")}
                          </span>
                          <ClearableInput
                            value={floor}
                            onValueChange={setFloor}
                            inputMode="decimal"
                            className={inputClass}
                          />
                        </label>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {ownership === "leased" && (
            <div className="flex flex-col gap-3 rounded border border-line bg-surface-3 p-3">
              <span className="text-xs text-muted">
                {t("carsSheet.leaseHint")}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <FormSection
                  as="label"
                  className="min-w-0"
                  label={t("carsSheet.leaseStartLabel")}
                >
                  <DateField value={leaseStart} onChange={setLeaseStart} />
                </FormSection>
                <FormSection
                  as="label"
                  className="min-w-0"
                  label={t("carsSheet.leaseMonthsLabel")}
                >
                  <ClearableInput
                    value={leaseMonths}
                    onValueChange={setLeaseMonths}
                    inputMode="numeric"
                    placeholder="36"
                    wrapperClassName="w-full min-w-0"
                    className={inputClass}
                  />
                </FormSection>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormSection
                  as="label"
                  className="min-w-0"
                  label={t("carsSheet.leaseStartValueLabel")}
                >
                  <ClearableInput
                    value={leaseStartValue}
                    onValueChange={setLeaseStartValue}
                    inputMode="decimal"
                    placeholder={formatAmountForInput(0, settings)}
                    wrapperClassName="w-full min-w-0"
                    className={inputClass}
                  />
                </FormSection>
                <FormSection
                  as="label"
                  className="min-w-0"
                  label={t("carsSheet.leaseEndValueLabel")}
                >
                  <ClearableInput
                    value={leaseEndValue}
                    onValueChange={setLeaseEndValue}
                    inputMode="decimal"
                    placeholder={formatAmountForInput(0, settings)}
                    wrapperClassName="w-full min-w-0"
                    className={inputClass}
                  />
                </FormSection>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormSection
                  as="label"
                  className="min-w-0"
                  label={t("carsSheet.leaseMonthlyCostLabel")}
                >
                  <ClearableInput
                    value={leaseMonthlyCost}
                    onValueChange={setLeaseMonthlyCost}
                    inputMode="decimal"
                    placeholder={formatAmountForInput(0, settings)}
                    wrapperClassName="w-full min-w-0"
                    className={inputClass}
                  />
                </FormSection>
                <FormSection
                  as="label"
                  className="min-w-0"
                  label={t("carsSheet.leaseInterestRateLabel")}
                >
                  <ClearableInput
                    value={leaseInterestRate}
                    onValueChange={setLeaseInterestRate}
                    inputMode="decimal"
                    placeholder={t("carsSheet.leaseInterestRatePlaceholder")}
                    wrapperClassName="w-full min-w-0"
                    className={inputClass}
                  />
                </FormSection>
              </div>
              <p className="m-0 text-xs text-muted">
                {t("carsSheet.leaseNetWorthHint")}
              </p>
            </div>
          )}

          {holdsCapital && (
            <FormSection label={t("carsSheet.loanPickerLabel")}>
              <SelectPicker
                value={loanId}
                options={loanOptions}
                onChange={setLoanId}
                ariaLabel={t("carsSheet.loanPickerLabel")}
              />
              <p className="m-0 text-xs text-muted">
                {t("carsSheet.loanHint")}
              </p>
            </FormSection>
          )}

          <FormSection as="label" label={t("carsSheet.soldDateLabel")}>
            <DateField value={soldDate} onChange={setSoldDate} />
            <p className="m-0 text-xs text-muted">
              {t("carsSheet.soldDateHint")}
            </p>
          </FormSection>

          {soldDate !== "" && (
            <FormSection as="label" label={t("carsSheet.soldForLabel")}>
              <ClearableInput
                value={soldFor}
                onValueChange={setSoldFor}
                inputMode="decimal"
                placeholder={formatAmountForInput(0, settings)}
                wrapperClassName="w-full min-w-0"
                className={inputClass}
              />
            </FormSection>
          )}

          <FormSection label={t("account.glyph")}>
            <GlyphPicker
              value={glyph}
              onChange={setGlyph}
              defaultIcon="car"
              icons={CARS_GLYPH_NAMES}
              tintColor={color}
            />
          </FormSection>

          <FormSection label={t("account.color")}>
            <ColorPalette
              colors={CAR_COLORS}
              value={color}
              onChange={setColor}
              bordered
            />
          </FormSection>
        </div>
      </Modal.Body>
      <Modal.Footer className="justify-between">
        <div>
          {isEdit && onDelete && (
            <Button variant="danger" withIcon onClick={() => onDelete(car)}>
              <Trash2 size={14} aria-hidden focusable={false} />
              {t("common.delete")}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {isEdit ? t("common.save") : t("common.create")}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}

// Translated label for an ownership mode — shared by the editor's pill
// toggle and the card's badge (via CarCard's import).
export function ownershipLabel(
  t: ReturnType<typeof useT>,
  ownership: CarOwnership,
): string {
  switch (ownership) {
    case "owned":
      return t("carsSheet.ownershipOwned");
    case "leased":
      return t("carsSheet.ownershipLeased");
    case "shared":
      return t("carsSheet.ownershipShared");
    case "pool":
      return t("carsSheet.ownershipPool");
  }
}
