import { useState } from "react";
import { Home } from "lucide-react";

import { newId } from "../../data/sheet";
import type { Company, Property, Settings } from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import { formatAmountForInput, parseAmount } from "../../utils/format";
import { CompanyPicker } from "../CompanyPicker";
import { Button, ClearableInput } from "../form";
import { Modal } from "../Modal";

// Create / edit one `Property` — name, what it was bought for, and the
// purchase date. The value history and mortgages are managed from the
// card, not here. Mirrors `ItemEditorModal`.
//
// Not `centered`: the name / amount fields open the soft keyboard, so the
// modal keeps the default fullscreen-on-mobile layout.

type Props = {
  open: boolean;
  // The property to edit, or null in create mode (blank fields, "New
  // property" title, Save mints a fresh property).
  property: Property | null;
  companies: readonly Company[];
  settings: Settings;
  onClose: () => void;
  // Fires on Save in edit mode with the changed fields. A field set to
  // `undefined` clears it.
  onSubmit: (propertyId: string, patch: Partial<Omit<Property, "id">>) => void;
  // Fires on Save in create mode with the assembled property (fresh id).
  onCreate: (property: Property) => void;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
};

function seedAmount(value: number | undefined, settings: Settings): string {
  if (value === undefined) return "";
  return formatAmountForInput(Math.abs(value), settings);
}

export function PropertyEditorModal({
  open,
  property,
  companies,
  settings,
  onClose,
  onSubmit,
  onCreate,
  onCreateCompany,
}: Props) {
  const t = useT();
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [size, setSize] = useState("");

  useResetOnOpen(open, property?.id ?? "__create__", () => {
    setName(property?.name ?? "");
    setCompanyId(property?.companyId ?? null);
    setPurchaseAmount(seedAmount(property?.purchaseAmount, settings));
    setPurchaseDate(property?.purchaseDate ?? "");
    setSize(seedAmount(property?.size, settings));
  });

  if (!open) return null;

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0;

  function num(text: string): number | undefined {
    const parsed = parseAmount(text);
    return parsed === null ? undefined : Math.abs(parsed);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    const patch: Partial<Omit<Property, "id">> = {
      name: trimmedName,
      // `null` from the picker clears the field via the `undefined` patch.
      companyId: companyId ?? undefined,
      purchaseAmount: num(purchaseAmount),
      purchaseDate: purchaseDate !== "" ? purchaseDate : undefined,
      size: num(size),
    };
    if (property) {
      onSubmit(property.id, patch);
      return;
    }
    // Create mode: drop every `undefined` so the new property is
    // byte-clean (absent optional fields aren't stored).
    const fresh: Property = {
      id: newId(),
      name: trimmedName,
      valueHistory: [],
      mortgages: [],
    };
    if (companyId) fresh.companyId = companyId;
    if (patch.purchaseAmount !== undefined)
      fresh.purchaseAmount = patch.purchaseAmount;
    if (patch.purchaseDate !== undefined)
      fresh.purchaseDate = patch.purchaseDate;
    if (patch.size !== undefined) fresh.size = patch.size;
    onCreate(fresh);
  }

  const amountInputClass =
    "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";
  const dateInputClass =
    "field-input rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="property-editor-modal-title"
      size="max-w-sm"
    >
      <Modal.Header
        icon={<Home size={14} aria-hidden focusable={false} />}
        title={
          property
            ? t("properties.editPropertyTitle")
            : t("properties.newPropertyTitle")
        }
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.nameLabel")}
            </span>
            <ClearableInput
              value={name}
              onValueChange={setName}
              placeholder={t("properties.namePlaceholder")}
              className={amountInputClass}
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.lenderLabel")}
            </span>
            <CompanyPicker
              companies={companies}
              selectedId={companyId}
              onSelect={setCompanyId}
              onCreate={onCreateCompany}
              placeholder={t("properties.lenderPlaceholder")}
            />
            <p className="m-0 text-xs text-muted">
              {t("properties.lenderHint")}
            </p>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.purchaseAmountLabel")}
            </span>
            <ClearableInput
              value={purchaseAmount}
              onValueChange={setPurchaseAmount}
              inputMode="decimal"
              placeholder={t("properties.purchaseAmountPlaceholder")}
              className={amountInputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.purchaseDateLabel")}
            </span>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className={dateInputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.sizeLabel")}
            </span>
            <div className="flex items-center gap-2">
              <ClearableInput
                value={size}
                onValueChange={setSize}
                inputMode="decimal"
                placeholder={t("properties.sizePlaceholder")}
                className={amountInputClass}
              />
              <span className="shrink-0 text-sm text-muted">
                {settings.propertySizeUnit}
              </span>
            </div>
          </label>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
          {property ? t("properties.save") : t("properties.create")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
