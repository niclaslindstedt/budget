import { useState } from "react";
import { Package, Trash2 } from "lucide-react";

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
import {
  formatAmountForInput,
  formatNumber,
  parseAmount,
  withCurrency,
} from "../utils/format";
import { Button, Checkbox, ClearableInput, ClearableTextarea } from "./form";
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
  // modal renders nothing until then.
  item: Item | null;
  subtypes: readonly Subtype[];
  types: readonly EntryType[];
  categories: readonly Category[];
  settings: Settings;
  // Sum of every line-item link's absolute amount that points at this
  // item, across budget rows and bank history. Shown as a hint under the
  // purchase-price field so the user can see what they've allocated to
  // the item without it overwriting their own figure. Absent / 0 when no
  // links point at it.
  linkedTotal?: number;
  onCreateSubtype: (draft: Omit<Subtype, "id">) => Subtype;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  // Fires on Save with the changed fields. A field set to `undefined`
  // clears it (the reducer deletes the key). The host routes this to the
  // `updateItem` action.
  onSubmit: (itemId: string, patch: Partial<Omit<Item, "id">>) => void;
  onDelete: (itemId: string) => void;
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
  subtypes,
  types,
  categories,
  settings,
  linkedTotal,
  onCreateSubtype,
  onCreateType,
  onCreateCategory,
  onSubmit,
  onDelete,
  onClose,
}: Props) {
  const t = useT();

  const [name, setName] = useState("");
  const [subtypeId, setSubtypeId] = useState<string | null>(null);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [acquiredAt, setAcquiredAt] = useState("");
  const [depreciates, setDepreciates] = useState(false);
  const [ratePerYear, setRatePerYear] = useState("");
  const [floor, setFloor] = useState("");
  const [resaleValue, setResaleValue] = useState("");
  const [disposed, setDisposed] = useState(false);
  const [disposedAt, setDisposedAt] = useState("");
  const [soldFor, setSoldFor] = useState("");
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useResetOnOpen(open, item?.id, () => {
    setName(item?.name ?? "");
    setSubtypeId(item?.subtypeId ?? null);
    setPurchasePrice(seedAmount(item?.purchasePrice, settings));
    setAcquiredAt(item?.acquiredAt ?? "");
    const dep = item?.depreciation;
    setDepreciates(dep !== undefined);
    setRatePerYear(dep ? formatAmountForInput(dep.ratePerYear, settings) : "");
    setFloor(dep?.floor !== undefined ? seedAmount(dep.floor, settings) : "");
    setResaleValue(seedAmount(item?.resaleValue, settings));
    setDisposed(item?.disposedAt !== undefined || item?.soldFor !== undefined);
    setDisposedAt(item?.disposedAt ?? "");
    setSoldFor(seedAmount(item?.soldFor, settings));
    setNote(item?.note ?? "");
    setConfirmDelete(false);
  });

  if (!open || !item) return null;

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0;

  function num(text: string): number | undefined {
    const parsed = parseAmount(text);
    return parsed === null ? undefined : Math.abs(parsed);
  }

  function handleSubmit() {
    if (!item || !canSubmit) return;
    const patch: Partial<Omit<Item, "id">> = {
      name: trimmedName,
      subtypeId: subtypeId ?? undefined,
      acquiredAt: acquiredAt !== "" ? acquiredAt : undefined,
      purchasePrice: num(purchasePrice),
      resaleValue: num(resaleValue),
      note: note.trim() !== "" ? note.trim() : undefined,
    };

    // Depreciation: only persisted when enabled AND a finite rate is set.
    const rate = depreciates ? parseAmount(ratePerYear) : null;
    if (depreciates && rate !== null) {
      const depreciation: ItemDepreciation = {
        method: "percentPerYear",
        ratePerYear: Math.abs(rate),
      };
      const floorNum = num(floor);
      if (floorNum !== undefined) depreciation.floor = floorNum;
      patch.depreciation = depreciation;
    } else {
      patch.depreciation = undefined;
    }

    // Disposal: only persisted when the toggle is on.
    if (disposed) {
      patch.disposedAt = disposedAt !== "" ? disposedAt : undefined;
      patch.soldFor = num(soldFor);
    } else {
      patch.disposedAt = undefined;
      patch.soldFor = undefined;
    }

    onSubmit(item.id, patch);
  }

  const linkedHint =
    linkedTotal !== undefined && linkedTotal !== 0
      ? t("items.linkedTotal", {
          amount: withCurrency(formatNumber(linkedTotal, settings), settings),
        })
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
        title={t("items.editItemTitle")}
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
            <input
              type="date"
              value={acquiredAt}
              onChange={(e) => setAcquiredAt(e.target.value)}
              className={amountInputClass}
            />
          </label>

          <div className="flex flex-col gap-2 rounded border border-line bg-surface-3 p-3">
            <Checkbox
              checked={depreciates}
              onChange={setDepreciates}
              label={t("items.depreciates")}
            />
            {depreciates && (
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
            )}
          </div>

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
                  <input
                    type="date"
                    value={disposedAt}
                    onChange={(e) => setDisposedAt(e.target.value)}
                    className={amountInputClass}
                  />
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

          <div className="mt-1 border-t border-line pt-3">
            {confirmDelete ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-danger">
                  {t("items.deleteItemConfirm")}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmDelete(false)}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button variant="danger" onClick={() => onDelete(item.id)}>
                    {t("items.deleteItem")}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-xs text-muted hover:text-danger"
              >
                <Trash2 size={14} aria-hidden focusable={false} />
                {t("items.deleteItem")}
              </button>
            )}
          </div>
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
