import { useRef, useState } from "react";
import { Trash2, Wallet } from "lucide-react";

import {
  ACCOUNT_GLYPH_NAMES,
  SHEET_COLORS,
} from "../../data/constants/taxonomy";
import { normalizeName } from "../../data/normalize";
import type { Account, CategoryIcon } from "../../data/types";
import { useDesktopAutoFocus, useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
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

export type AccountDraft = {
  name: string;
  description: string;
  glyph: CategoryIcon | null;
  color: string | null;
  bank: string;
  clearing: string;
  accountNumber: string;
  iban: string;
  bic: string;
  currency: string;
};

type Props = {
  open: boolean;
  // When set, the modal opens in edit mode and pre-fills its fields
  // from the account. When null it's the create-account form. Edit
  // mode surfaces a Delete button in the footer; the parent decides
  // whether the delete actually goes through (it may need to refuse
  // when budgets / transfers still reference the account).
  account: Account | null;
  onClose: () => void;
  onSave: (draft: AccountDraft) => void;
  onDelete?: () => void;
};

const DEFAULT_COLOR = SHEET_COLORS[5];

export function AccountModal({
  open,
  account,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const t = useT();
  const isEdit = account !== null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [glyph, setGlyph] = useState<CategoryIcon | null>(null);
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [bank, setBank] = useState("");
  const [clearing, setClearing] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [currency, setCurrency] = useState("");

  const nameRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(nameRef, open);

  useResetOnOpen(open, account?.id ?? null, () => {
    setName(account?.name ?? "");
    setDescription(account?.description ?? "");
    setGlyph(account?.glyph ?? null);
    setColor(account?.color ?? DEFAULT_COLOR);
    setBank(account?.bank ?? "");
    setClearing(account?.clearing ?? "");
    setAccountNumber(account?.accountNumber ?? "");
    setIban(account?.iban ?? "");
    setBic(account?.bic ?? "");
    setCurrency(account?.currency ?? "");
  });

  const trimmedName = normalizeName(name);
  const canSave = trimmedName !== null;

  // Surface a non-blocking hint when the user has filled in neither a
  // local bank-detail pair nor an international one. The account still
  // saves — many users will only care about the name + balance — but
  // the modal nudges them to add details so transactions can be
  // reconciled against real bank records later.
  const hasDetails =
    bank.trim().length > 0 ||
    (clearing.trim().length > 0 && accountNumber.trim().length > 0) ||
    iban.trim().length > 0;

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
      iban: iban.trim(),
      bic: bic.trim(),
      currency: currency.trim(),
    });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="account-modal-title">
      <Modal.Header
        icon={<Wallet size={14} aria-hidden focusable={false} />}
        title={isEdit ? t("account.titleEdit") : t("account.titleNew")}
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
                backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
                borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
              }}
            >
              {glyph !== null ? (
                <CategoryIconGlyph name={glyph} size={22} />
              ) : (
                <CategoryIconGlyph name="wallet" size={22} />
              )}
            </div>
            <FormSection
              as="label"
              className="min-w-0 flex-1"
              label={t("account.name")}
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
                className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
                placeholder={t("account.namePlaceholder")}
                ref={nameRef}
              />
            </FormSection>
          </div>

          <FormSection as="label" label={t("account.description")}>
            <ClearableTextarea
              value={description}
              onValueChange={setDescription}
              rows={2}
              placeholder={t("account.descriptionPlaceholder")}
              wrapperClassName="w-full min-w-0"
              className="field-input w-full min-w-0 resize-none rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </FormSection>

          <FormSection label={t("account.glyph")}>
            <GlyphPicker
              value={glyph}
              onChange={setGlyph}
              defaultIcon="wallet"
              icons={ACCOUNT_GLYPH_NAMES}
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

          <FormSection label={t("account.bank")}>
            <ClearableInput
              value={bank}
              onValueChange={setBank}
              placeholder={t("account.bankPlaceholder")}
              wrapperClassName="w-full min-w-0"
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </FormSection>

          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <FormSection
              as="label"
              className="min-w-0"
              label={t("account.clearing")}
            >
              <ClearableInput
                value={clearing}
                onValueChange={setClearing}
                placeholder={t("account.clearingPlaceholder")}
                wrapperClassName="w-full min-w-0"
                className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
              />
            </FormSection>
            <FormSection
              as="label"
              className="min-w-0"
              label={t("account.accountNumber")}
            >
              <ClearableInput
                value={accountNumber}
                onValueChange={setAccountNumber}
                placeholder={t("account.accountNumberPlaceholder")}
                wrapperClassName="w-full min-w-0"
                className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
              />
            </FormSection>
          </div>

          <div className="grid grid-cols-[2fr_1fr] gap-2">
            <FormSection
              as="label"
              className="min-w-0"
              label={t("account.iban")}
            >
              <ClearableInput
                value={iban}
                onValueChange={setIban}
                placeholder={t("account.ibanPlaceholder")}
                wrapperClassName="w-full min-w-0"
                className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
              />
            </FormSection>
            <FormSection
              as="label"
              className="min-w-0"
              label={t("account.bic")}
            >
              <ClearableInput
                value={bic}
                onValueChange={setBic}
                placeholder={t("account.bicPlaceholder")}
                wrapperClassName="w-full min-w-0"
                className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
              />
            </FormSection>
          </div>

          <FormSection as="label" label={t("account.currencyOverride")}>
            <ClearableInput
              value={currency}
              onValueChange={setCurrency}
              placeholder={t("account.currencyOverridePlaceholder")}
              wrapperClassName="w-full min-w-0"
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
            />
            <span className="text-xs text-muted">
              {t("account.currencyOverrideHint")}
            </span>
          </FormSection>

          {!hasDetails && (
            <p className="rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
              {t("account.noDetailsHint")}
            </p>
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
            {isEdit ? t("common.save") : t("account.create")}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
