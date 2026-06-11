import { useRef, useState } from "react";
import { Trash2, TrendingUp } from "lucide-react";

import {
  INVESTMENT_GLYPH_NAMES,
  SHEET_COLORS,
} from "../../data/constants/taxonomy";
import { normalizeName } from "../../data/normalize";
import type {
  CategoryIcon,
  StockOwnership,
  StockPosition,
} from "../../data/types";
import { useDesktopAutoFocus, useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import { ColorPalette } from "../ColorPalette";
import {
  Button,
  ClearableInput,
  FormSection,
  SelectPicker,
  type SelectOption,
} from "../form";
import { GlyphPicker } from "../GlyphPicker";
import { Modal } from "../Modal";

export type StockPositionDraft = {
  name: string;
  ownership: StockOwnership;
  glyph: CategoryIcon | null;
  color: string;
};

type Props = {
  open: boolean;
  position: StockPosition | null;
  onClose: () => void;
  onSave: (draft: StockPositionDraft) => void;
  onDelete?: () => void;
};

const DEFAULT_COLOR = SHEET_COLORS[6];

// Not `centered`: the name field opens the soft keyboard.
export function StockPositionModal({
  open,
  position,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const t = useT();
  const isEdit = position !== null;
  const [name, setName] = useState("");
  const [ownership, setOwnership] = useState<StockOwnership>("private");
  const [glyph, setGlyph] = useState<CategoryIcon | null>(null);
  const [color, setColor] = useState<string>(DEFAULT_COLOR);

  const nameRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(nameRef, open);

  useResetOnOpen(open, position?.id ?? null, () => {
    setName(position?.name ?? "");
    setOwnership(position?.ownership ?? "private");
    setGlyph(position?.glyph ?? null);
    setColor(position?.color ?? DEFAULT_COLOR);
  });

  const trimmedName = normalizeName(name);
  const canSave = trimmedName !== null;

  const ownershipOptions: SelectOption<StockOwnership>[] = [
    {
      value: "private",
      label: t("investment.ownershipPrivate"),
      hint: t("investment.ownershipPrivateHint"),
    },
    {
      value: "company",
      label: t("investment.ownershipCompany"),
      hint: t("investment.ownershipCompanyHint"),
    },
  ];

  function handleSave() {
    if (trimmedName === null) return;
    onSave({ name: trimmedName, ownership, glyph, color });
    onClose();
  }

  const inputClass =
    "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="stock-position-modal-title"
    >
      <Modal.Header
        icon={<TrendingUp size={14} aria-hidden focusable={false} />}
        title={
          isEdit
            ? t("investment.editStockTitle")
            : t("investment.newStockTitle")
        }
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <FormSection as="label" label={t("investment.name")}>
            <ClearableInput
              value={name}
              onValueChange={setName}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) {
                  e.preventDefault();
                  handleSave();
                }
              }}
              wrapperClassName="w-full min-w-0"
              className={inputClass}
              placeholder={t("investment.stockNamePlaceholder")}
              ref={nameRef}
            />
          </FormSection>

          <FormSection label={t("investment.ownershipLabel")}>
            <SelectPicker
              value={ownership}
              options={ownershipOptions}
              onChange={setOwnership}
              ariaLabel={t("investment.ownershipLabel")}
            />
          </FormSection>

          <FormSection label={t("account.glyph")}>
            <GlyphPicker
              value={glyph}
              onChange={setGlyph}
              defaultIcon="trending-up"
              icons={INVESTMENT_GLYPH_NAMES}
              tintColor={color}
            />
          </FormSection>

          <FormSection label={t("account.color")}>
            <ColorPalette
              colors={SHEET_COLORS}
              value={color}
              onChange={setColor}
            />
          </FormSection>
        </div>
      </Modal.Body>
      <Modal.Footer className="justify-between">
        <div>
          {isEdit && onDelete && (
            <Button variant="danger" withIcon onClick={onDelete}>
              <Trash2 size={14} aria-hidden focusable={false} />
              {t("common.delete")}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave}>
            {isEdit ? t("common.save") : t("investment.createStock")}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
