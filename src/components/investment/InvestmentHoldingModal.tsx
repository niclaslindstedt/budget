import { useRef, useState } from "react";
import { Trash2, TrendingUp } from "lucide-react";

import {
  INVESTMENT_GLYPH_NAMES,
  SHEET_COLORS,
} from "../../data/constants/taxonomy";
import { normalizeName } from "../../data/normalize";
import type {
  CategoryIcon,
  InvestmentHolding,
  InvestmentKind,
  InvestmentWrapper,
  Settings,
} from "../../data/types";
import { useDesktopAutoFocus, useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { formatAmountForInput, parseAmount } from "../../utils/format";
import { ColorPalette } from "../ColorPalette";
import {
  Button,
  ClearableInput,
  DateField,
  FormSection,
  SelectPicker,
  type SelectOption,
} from "../form";
import { GlyphPicker } from "../GlyphPicker";
import { Modal } from "../Modal";

export type InvestmentHoldingDraft = {
  name: string;
  wrapper: InvestmentWrapper;
  kind: InvestmentKind;
  glyph: CategoryIcon | null;
  color: string;
  purchaseAmount: number | undefined;
  purchaseDate: string | undefined;
};

type Props = {
  open: boolean;
  // When set, the modal opens in edit mode and pre-fills from the holding.
  // When null it's the create form. Edit mode surfaces a Delete button.
  holding: InvestmentHolding | null;
  settings: Settings;
  onClose: () => void;
  onSave: (draft: InvestmentHoldingDraft) => void;
  onDelete?: () => void;
};

const DEFAULT_COLOR = SHEET_COLORS[3];

// Not `centered`: the name / amount fields open the soft keyboard.
export function InvestmentHoldingModal({
  open,
  holding,
  settings,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const t = useT();
  const isEdit = holding !== null;
  const [name, setName] = useState("");
  const [wrapper, setWrapper] = useState<InvestmentWrapper>("isk");
  const [kind, setKind] = useState<InvestmentKind>("fund");
  const [glyph, setGlyph] = useState<CategoryIcon | null>(null);
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");

  const nameRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(nameRef, open);

  useResetOnOpen(open, holding?.id ?? null, () => {
    setName(holding?.name ?? "");
    setWrapper(holding?.wrapper ?? "isk");
    setKind(holding?.kind ?? "fund");
    setGlyph(holding?.glyph ?? null);
    setColor(holding?.color ?? DEFAULT_COLOR);
    setPurchaseAmount(
      holding?.purchaseAmount !== undefined
        ? formatAmountForInput(holding.purchaseAmount, settings)
        : "",
    );
    setPurchaseDate(holding?.purchaseDate ?? "");
  });

  const trimmedName = normalizeName(name);
  const canSave = trimmedName !== null;

  const wrapperOptions: SelectOption<InvestmentWrapper>[] = [
    {
      value: "isk",
      label: t("investment.wrapperIsk"),
      hint: t("investment.wrapperIskHint"),
    },
    {
      value: "kf",
      label: t("investment.wrapperKf"),
      hint: t("investment.wrapperKfHint"),
    },
    {
      value: "depot",
      label: t("investment.wrapperDepot"),
      hint: t("investment.wrapperDepotHint"),
    },
  ];

  const kindOptions: SelectOption<InvestmentKind>[] = [
    { value: "stock", label: t("investment.kindStock") },
    { value: "fund", label: t("investment.kindFund") },
    { value: "bond", label: t("investment.kindBond") },
    { value: "crypto", label: t("investment.kindCrypto") },
    { value: "metal", label: t("investment.kindMetal") },
    { value: "other", label: t("investment.kindOther") },
  ];

  function handleSave() {
    if (trimmedName === null) return;
    const parsedAmount = parseAmount(purchaseAmount);
    onSave({
      name: trimmedName,
      wrapper,
      kind,
      glyph,
      color,
      purchaseAmount:
        parsedAmount === null ? undefined : Math.abs(parsedAmount),
      purchaseDate: purchaseDate === "" ? undefined : purchaseDate,
    });
    onClose();
  }

  const inputClass =
    "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";
  const monoInputClass = `${inputClass} font-mono`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="investment-holding-modal-title"
    >
      <Modal.Header
        icon={<TrendingUp size={14} aria-hidden focusable={false} />}
        title={
          isEdit
            ? t("investment.editHoldingTitle")
            : t("investment.newHoldingTitle")
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
              placeholder={t("investment.namePlaceholder")}
              ref={nameRef}
            />
          </FormSection>

          <div className="grid grid-cols-2 gap-2">
            <FormSection label={t("investment.wrapperLabel")}>
              <SelectPicker
                value={wrapper}
                options={wrapperOptions}
                onChange={setWrapper}
                ariaLabel={t("investment.wrapperLabel")}
              />
            </FormSection>
            <FormSection label={t("investment.kindLabel")}>
              <SelectPicker
                value={kind}
                options={kindOptions}
                onChange={setKind}
                ariaLabel={t("investment.kindLabel")}
              />
            </FormSection>
          </div>

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

          <div className="grid grid-cols-2 gap-2">
            <FormSection as="label" label={t("investment.purchaseAmountLabel")}>
              <ClearableInput
                value={purchaseAmount}
                onValueChange={setPurchaseAmount}
                inputMode="decimal"
                placeholder={formatAmountForInput(0, settings)}
                wrapperClassName="w-full min-w-0"
                className={monoInputClass}
              />
            </FormSection>
            <FormSection as="label" label={t("investment.purchaseDateLabel")}>
              <DateField
                value={purchaseDate}
                max={todayIso()}
                onChange={setPurchaseDate}
              />
            </FormSection>
          </div>
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
            {isEdit ? t("common.save") : t("investment.createHolding")}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
