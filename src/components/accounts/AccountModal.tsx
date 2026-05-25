import { useEffect, useRef, useState } from "react";
import { Trash2, Wallet } from "lucide-react";

import { ACCOUNT_GLYPH_NAMES, SHEET_COLORS } from "../../data/constants";
import type { Account, CategoryIcon } from "../../data/types";
import { useDesktopAutoFocus } from "../../hooks";
import { useT } from "../../i18n";
import { ColorPalette } from "../ColorPalette";
import { Button, ClearableTextInput } from "../form";
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

  useEffect(() => {
    if (!open) return;
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
  }, [open, account]);

  const canSave = name.trim().length > 0;

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
    if (!canSave) return;
    onSave({
      name: name.trim(),
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
            <label className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-xs text-muted">{t("account.name")}</span>
              <ClearableTextInput
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
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">
              {t("account.description")}
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t("account.descriptionPlaceholder")}
              className="field-input w-full min-w-0 resize-none rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t("account.glyph")}</span>
            <GlyphPicker
              value={glyph}
              onChange={setGlyph}
              defaultIcon="wallet"
              icons={ACCOUNT_GLYPH_NAMES}
              tintColor={color}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t("account.color")}</span>
            <ColorPalette
              colors={SHEET_COLORS}
              value={color}
              onChange={setColor}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t("account.bank")}</span>
            <ClearableTextInput
              value={bank}
              onValueChange={setBank}
              placeholder={t("account.bankPlaceholder")}
              wrapperClassName="w-full min-w-0"
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </div>

          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs text-muted">
                {t("account.clearing")}
              </span>
              <ClearableTextInput
                value={clearing}
                onValueChange={setClearing}
                placeholder={t("account.clearingPlaceholder")}
                wrapperClassName="w-full min-w-0"
                className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs text-muted">
                {t("account.accountNumber")}
              </span>
              <ClearableTextInput
                value={accountNumber}
                onValueChange={setAccountNumber}
                placeholder={t("account.accountNumberPlaceholder")}
                wrapperClassName="w-full min-w-0"
                className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
              />
            </label>
          </div>

          <div className="grid grid-cols-[2fr_1fr] gap-2">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs text-muted">{t("account.iban")}</span>
              <ClearableTextInput
                value={iban}
                onValueChange={setIban}
                placeholder={t("account.ibanPlaceholder")}
                wrapperClassName="w-full min-w-0"
                className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs text-muted">{t("account.bic")}</span>
              <ClearableTextInput
                value={bic}
                onValueChange={setBic}
                placeholder={t("account.bicPlaceholder")}
                wrapperClassName="w-full min-w-0"
                className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">
              {t("account.currencyOverride")}
            </span>
            <ClearableTextInput
              value={currency}
              onValueChange={setCurrency}
              placeholder={t("account.currencyOverridePlaceholder")}
              wrapperClassName="w-full min-w-0"
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
            />
            <span className="text-xs text-muted">
              {t("account.currencyOverrideHint")}
            </span>
          </label>

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
