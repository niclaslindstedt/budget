import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import {
  SAVINGS_GLYPH_NAMES,
  SHEET_COLORS,
} from "../../data/constants/taxonomy";
import { normalizeName } from "../../data/normalize";
import type { CategoryIcon, Saving, Settings } from "../../data/types";
import { useDesktopAutoFocus, useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import { formatAmountForInput } from "../../utils/format";
import { tintBorder, tintFill } from "../../utils/tint";
import { ColorPalette } from "../ColorPalette";
import {
  Button,
  ClearableInput,
  ClearableTextarea,
  FormSection,
} from "../form";
import { GlyphPicker } from "../GlyphPicker";
import { Modal } from "../Modal";
import { CategoryIconGlyph } from "../icons";

export type SavingDraft = {
  name: string;
  description: string;
  glyph: CategoryIcon | null;
  color: string | null;
  bank: string;
  clearing: string;
  accountNumber: string;
  // Only meaningful in create mode — the opening balance, recorded as the
  // first dated balance point. Edit mode hides the field (balance changes go
  // through the Update balance flow), so it stays empty there.
  currentBalance: string;
};

type Props = {
  open: boolean;
  // When set, the modal opens in edit mode and pre-fills its fields from the
  // savings account. When null it's the create form. Edit mode surfaces a
  // Delete button and hides the balance field; create mode collects an
  // opening balance.
  saving: Saving | null;
  settings: Settings;
  onClose: () => void;
  onSave: (draft: SavingDraft) => void;
  onDelete?: () => void;
};

const DEFAULT_COLOR = SHEET_COLORS[9];

// Not `centered`: the name / bank / balance fields open the soft keyboard.
export function SavingsModal({
  open,
  saving,
  settings,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const t = useT();
  const isEdit = saving !== null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [glyph, setGlyph] = useState<CategoryIcon | null>(null);
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [bank, setBank] = useState("");
  const [clearing, setClearing] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [currentBalance, setCurrentBalance] = useState("");

  const nameRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(nameRef, open);

  useResetOnOpen(open, saving?.id ?? null, () => {
    setName(saving?.name ?? "");
    setDescription(saving?.description ?? "");
    setGlyph(saving?.glyph ?? null);
    setColor(saving?.color ?? DEFAULT_COLOR);
    setBank(saving?.bank ?? "");
    setClearing(saving?.clearing ?? "");
    setAccountNumber(saving?.accountNumber ?? "");
    setCurrentBalance("");
  });

  const trimmedName = normalizeName(name);
  const canSave = trimmedName !== null;

  function handleSave() {
    if (trimmedName === null) return;
    onSave({
      name: trimmedName,
      description: description.trim(),
      glyph,
      color,
      bank: bank.trim(),
      clearing: clearing.trim(),
      accountNumber: accountNumber.trim(),
      currentBalance: currentBalance.trim(),
    });
    onClose();
  }

  const inputClass =
    "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";
  const monoInputClass = `${inputClass} font-mono`;

  return (
    <Modal open={open} onClose={onClose} labelledBy="savings-modal-title">
      <Modal.Header
        icon={<CategoryIconGlyph name="coins" size={14} />}
        title={
          isEdit ? t("savingsSheet.editTitle") : t("savingsSheet.newTitle")
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
              <CategoryIconGlyph name={glyph ?? "coins"} size={22} />
            </div>
            <FormSection
              as="label"
              className="min-w-0 flex-1"
              label={t("savingsSheet.name")}
            >
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
                placeholder={t("savingsSheet.namePlaceholder")}
                ref={nameRef}
              />
            </FormSection>
          </div>

          <FormSection as="label" label={t("savingsSheet.description")}>
            <ClearableTextarea
              value={description}
              onValueChange={setDescription}
              rows={2}
              wrapperClassName="w-full min-w-0"
              className={`${inputClass} resize-none`}
            />
          </FormSection>

          <FormSection label={t("account.glyph")}>
            <GlyphPicker
              value={glyph}
              onChange={setGlyph}
              defaultIcon="coins"
              icons={SAVINGS_GLYPH_NAMES}
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

          <FormSection as="label" label={t("savingsSheet.bank")}>
            <ClearableInput
              value={bank}
              onValueChange={setBank}
              placeholder={t("savingsSheet.bankPlaceholder")}
              wrapperClassName="w-full min-w-0"
              className={inputClass}
            />
          </FormSection>

          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <FormSection
              as="label"
              className="min-w-0"
              label={t("savingsSheet.clearing")}
            >
              <ClearableInput
                value={clearing}
                onValueChange={setClearing}
                wrapperClassName="w-full min-w-0"
                className={monoInputClass}
              />
            </FormSection>
            <FormSection
              as="label"
              className="min-w-0"
              label={t("savingsSheet.accountNumber")}
            >
              <ClearableInput
                value={accountNumber}
                onValueChange={setAccountNumber}
                wrapperClassName="w-full min-w-0"
                className={monoInputClass}
              />
            </FormSection>
          </div>

          {!isEdit && (
            <FormSection as="label" label={t("savingsSheet.currentBalance")}>
              <ClearableInput
                value={currentBalance}
                onValueChange={setCurrentBalance}
                inputMode="decimal"
                placeholder={
                  formatAmountForInput(0, settings) ||
                  t("savingsSheet.balancePlaceholder")
                }
                wrapperClassName="w-full min-w-0"
                className={monoInputClass}
              />
            </FormSection>
          )}
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
            {isEdit ? t("common.save") : t("savingsSheet.create")}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
