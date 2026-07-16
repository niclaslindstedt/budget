import { useState } from "react";
import { Package } from "lucide-react";

import type {
  Category,
  EntryType,
  Item,
  ItemDepreciation,
  Settings,
  Subtype,
} from "../data/types";
import { useResetOnOpen } from "../hooks";
import { useT } from "../i18n";
import { formatAmountForInput, parseAmount } from "../utils/format";
import {
  Button,
  Checkbox,
  ClearableInput,
  ClearableTextarea,
  DateField,
} from "./form";
import { Modal } from "./Modal";
import { SubtypePicker } from "./SubtypePicker";

// Standalone editor for an owned `Item`. Reached from the budget table —
// long-pressing a single-item row's line-item pill, or clicking a line
// item in the description popover — via the `open-edit-item` modal
// command, so the user can grow the data on an item (purchase price,
// depreciation, resale value, disposal) without going through the
// per-entry line-items links modal, which only edits the connection
// between an entry and an item, not THE item.
//
// Items are universal catalog data (like companies), so this lives at the
// components root and is hosted by `UniversalModalHost`, mirroring
// `CompanyEditorModal`.
//
// Not `centered`: the name / amount / note fields open the soft keyboard,
// so the modal keeps the default fullscreen-on-mobile layout whose
// visual-viewport math keeps the footer above the keyboard.

type Props = {
  open: boolean;
  // The item to edit. Null until a pill / line item resolves one — the
  // modal renders nothing until then. In create mode (`item` null but
  // `creating` true) the fields seed blank and Save mints a new item.
  item: Item | null;
  // Create mode: render with blank fields and a "New item" title, and
  // route Save to `onCreate` instead of `onSubmit`. Fired by the Items
  // sheet's "+ add item" button.
  creating?: boolean;
  subtypes: readonly Subtype[];
  types: readonly EntryType[];
  categories: readonly Category[];
  settings: Settings;
  // Count of line-item links that point at this item, across budget rows
  // and bank history. Shown as a hint under the purchase-price field so the
  // user can see how many transactions link to it (the price lives on the
  // item, not the link). Absent / 0 when no links point at it.
  linkedCount?: number;
  onCreateSubtype: (draft: Omit<Subtype, "id">) => Subtype;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  // Fires on Save with the changed fields. A field set to `undefined`
  // clears it (the reducer deletes the key). The host routes this to the
  // `updateItem` action.
  onSubmit: (itemId: string, patch: Partial<Omit<Item, "id">>) => void;
  // Fires on Save in create mode with the assembled draft (no id yet).
  // The host routes this to the `addItem` action. Required only when
  // `creating` can be true.
  onCreate?: (draft: Omit<Item, "id">) => void;
  onClose: () => void;
};

// Seed an amount field from a stored number (absolute value as text), or
// "" when the field is unset.
function seedAmount(value: number | undefined, settings: Settings): string {
  if (value === undefined) return "";
  return formatAmountForInput(Math.abs(value), settings);
}

export function ItemEditorModal({
  open,
  item,
  creating = false,
  subtypes,
  types,
  categories,
  settings,
  linkedCount,
  onCreateSubtype,
  onCreateType,
  onCreateCategory,
  onSubmit,
  onCreate,
  onClose,
}: Props) {
  const t = useT();

  const [name, setName] = useState("");
  const [subtypeId, setSubtypeId] = useState<string | null>(null);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [acquiredAt, setAcquiredAt] = useState("");
  const [depreciates, setDepreciates] = useState(false);
  const [depMode, setDepMode] = useState<"steady" | "accelerated">("steady");
  const [ratePerYear, setRatePerYear] = useState("");
  const [initialDrop, setInitialDrop] = useState("");
  const [firstYearRate, setFirstYearRate] = useState("");
  const [floor, setFloor] = useState("");
  const [lifetimeYears, setLifetimeYears] = useState("");
  const [resaleValue, setResaleValue] = useState("");
  const [disposed, setDisposed] = useState(false);
  const [disposedAt, setDisposedAt] = useState("");
  const [soldFor, setSoldFor] = useState("");
  const [note, setNote] = useState("");

  useResetOnOpen(
    open,
    item?.id ?? (creating ? "__create__" : undefined),
    () => {
      setName(item?.name ?? "");
      setSubtypeId(item?.subtypeId ?? null);
      setPurchasePrice(seedAmount(item?.purchasePrice, settings));
      setAcquiredAt(item?.acquiredAt ?? "");
      const dep = item?.depreciation;
      setDepreciates(dep !== undefined);
      setDepMode(dep?.method === "accelerated" ? "accelerated" : "steady");
      setRatePerYear(
        dep ? formatAmountForInput(dep.ratePerYear, settings) : "",
      );
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
      setLifetimeYears(
        item?.lifetimeYears !== undefined
          ? formatAmountForInput(item.lifetimeYears, settings)
          : "",
      );
      setResaleValue(seedAmount(item?.resaleValue, settings));
      setDisposed(
        item?.disposedAt !== undefined || item?.soldFor !== undefined,
      );
      setDisposedAt(item?.disposedAt ?? "");
      setSoldFor(seedAmount(item?.soldFor, settings));
      setNote(item?.note ?? "");
    },
  );

  if (!open || (!item && !creating)) return null;

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0;

  function num(text: string): number | undefined {
    const parsed = parseAmount(text);
    return parsed === null ? undefined : Math.abs(parsed);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    const patch: Partial<Omit<Item, "id">> = {
      name: trimmedName,
      subtypeId: subtypeId ?? undefined,
      acquiredAt: acquiredAt !== "" ? acquiredAt : undefined,
      purchasePrice: num(purchasePrice),
      resaleValue: num(resaleValue),
      note: note.trim() !== "" ? note.trim() : undefined,
    };

    // Depreciation: only persisted when enabled AND at least the model's
    // anchor rate is set — the yearly rate for the steady model, any of
    // the three rates for the accelerated one (an initial drop alone is a
    // valid model: "loses 20 % when opened, then holds").
    const rate = depreciates ? num(ratePerYear) : undefined;
    const drop = depreciates ? num(initialDrop) : undefined;
    const firstYear = depreciates ? num(firstYearRate) : undefined;
    let depreciation: ItemDepreciation | undefined;
    if (depreciates && depMode === "steady" && rate !== undefined) {
      depreciation = { method: "percentPerYear", ratePerYear: rate };
    } else if (
      depreciates &&
      depMode === "accelerated" &&
      (rate !== undefined || drop !== undefined || firstYear !== undefined)
    ) {
      // A blank first-year rate inherits the following-years rate (a car
      // that drops 20 % up front, then a flat 15 %/yr); blank rates are 0.
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
    patch.depreciation = depreciation;

    // Lifetime: persisted only when a positive number is typed — zero or
    // garbage clears the field (the cost is never spread).
    const lifetime = num(lifetimeYears);
    patch.lifetimeYears =
      lifetime !== undefined && lifetime > 0 ? lifetime : undefined;

    // Disposal: only persisted when the toggle is on.
    if (disposed) {
      patch.disposedAt = disposedAt !== "" ? disposedAt : undefined;
      patch.soldFor = num(soldFor);
    } else {
      patch.disposedAt = undefined;
      patch.soldFor = undefined;
    }

    if (item) {
      onSubmit(item.id, patch);
      return;
    }
    // Create mode: drop every `undefined` so the new item is byte-clean
    // (absent optional fields aren't stored), matching what a reload
    // from storage produces. `name` is always present (canSubmit guard).
    const draft: Omit<Item, "id"> = { name: trimmedName };
    for (const [key, value] of Object.entries(patch)) {
      if (key === "name" || value === undefined) continue;
      (draft as Record<string, unknown>)[key] = value;
    }
    onCreate?.(draft);
  }

  const linkedHint =
    linkedCount !== undefined && linkedCount !== 0
      ? linkedCount === 1
        ? t("items.linkedCountOne", { count: linkedCount })
        : t("items.linkedCountOther", { count: linkedCount })
      : null;

  const amountInputClass =
    "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="item-editor-modal-title"
      size="max-w-sm"
    >
      <Modal.Header
        icon={<Package size={14} aria-hidden focusable={false} />}
        title={creating ? t("items.newItemTitle") : t("items.editItemTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t("items.itemName")}</span>
            <ClearableInput
              value={name}
              onValueChange={setName}
              placeholder={t("items.itemNamePlaceholder")}
              className={amountInputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("items.subtypeOptional")}
            </span>
            <SubtypePicker
              subtypes={subtypes}
              types={types}
              categories={categories}
              selectedId={subtypeId}
              onSelect={setSubtypeId}
              onCreate={onCreateSubtype}
              onCreateType={onCreateType}
              onCreateCategory={onCreateCategory}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("items.purchasePrice")}
            </span>
            <ClearableInput
              value={purchasePrice}
              onValueChange={setPurchasePrice}
              inputMode="decimal"
              placeholder={t("items.purchasePricePlaceholder")}
              className={amountInputClass}
            />
            {linkedHint && (
              <span className="text-xs text-muted">{linkedHint}</span>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t("items.acquiredAt")}</span>
            <DateField value={acquiredAt} onChange={setAcquiredAt} />
          </label>

          <div className="flex flex-col gap-2 rounded border border-line bg-surface-3 p-3">
            <Checkbox
              checked={depreciates}
              onChange={setDepreciates}
              label={t("items.depreciates")}
            />
            {depreciates && (
              <>
                {/* Two-segment model toggle — same sliding-pill track as
                    MortgageViewToggle, with text halves instead of glyphs.
                    The global reduce-motion rule zeroes the transition. */}
                <div
                  role="group"
                  aria-label={t("items.depreciationModel")}
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
                        ? t("items.depreciationSteady")
                        : t("items.depreciationAccelerated")}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-muted">
                  {depMode === "steady"
                    ? t("items.depreciationSteadyHint")
                    : t("items.depreciationAcceleratedHint")}
                </span>
                {depMode === "steady" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted">
                        {t("items.ratePerYear")}
                      </span>
                      <ClearableInput
                        value={ratePerYear}
                        onValueChange={setRatePerYear}
                        inputMode="decimal"
                        placeholder={t("items.ratePerYearPlaceholder")}
                        className={amountInputClass}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted">
                        {t("items.depreciationFloor")}
                      </span>
                      <ClearableInput
                        value={floor}
                        onValueChange={setFloor}
                        inputMode="decimal"
                        className={amountInputClass}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted">
                        {t("items.initialDrop")}
                      </span>
                      <ClearableInput
                        value={initialDrop}
                        onValueChange={setInitialDrop}
                        inputMode="decimal"
                        placeholder={t("items.initialDropPlaceholder")}
                        className={amountInputClass}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted">
                        {t("items.firstYearRate")}
                      </span>
                      <ClearableInput
                        value={firstYearRate}
                        onValueChange={setFirstYearRate}
                        inputMode="decimal"
                        placeholder={t("items.firstYearRatePlaceholder")}
                        className={amountInputClass}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted">
                        {t("items.rateAfterFirstYear")}
                      </span>
                      <ClearableInput
                        value={ratePerYear}
                        onValueChange={setRatePerYear}
                        inputMode="decimal"
                        placeholder={t("items.rateAfterFirstYearPlaceholder")}
                        className={amountInputClass}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted">
                        {t("items.depreciationFloor")}
                      </span>
                      <ClearableInput
                        value={floor}
                        onValueChange={setFloor}
                        inputMode="decimal"
                        className={amountInputClass}
                      />
                    </label>
                  </div>
                )}
              </>
            )}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("items.lifetimeYears")}
            </span>
            <ClearableInput
              value={lifetimeYears}
              onValueChange={setLifetimeYears}
              inputMode="decimal"
              placeholder={t("items.lifetimeYearsPlaceholder")}
              className={amountInputClass}
            />
            <span className="text-xs text-muted">
              {t("items.lifetimeYearsHint")}
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t("items.resaleValue")}</span>
            <ClearableInput
              value={resaleValue}
              onValueChange={setResaleValue}
              inputMode="decimal"
              className={amountInputClass}
            />
          </label>

          <div className="flex flex-col gap-2 rounded border border-line bg-surface-3 p-3">
            <Checkbox
              checked={disposed}
              onChange={setDisposed}
              label={t("items.disposed")}
            />
            {disposed && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">
                    {t("items.disposedAt")}
                  </span>
                  <DateField value={disposedAt} onChange={setDisposedAt} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">
                    {t("items.soldFor")}
                  </span>
                  <ClearableInput
                    value={soldFor}
                    onValueChange={setSoldFor}
                    inputMode="decimal"
                    className={amountInputClass}
                  />
                </label>
              </div>
            )}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t("items.itemNote")}</span>
            <ClearableTextarea
              value={note}
              onValueChange={setNote}
              placeholder={t("items.itemNotePlaceholder")}
              rows={2}
              className="field-input w-full min-w-0 resize-none rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </label>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
          {t("items.save")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
