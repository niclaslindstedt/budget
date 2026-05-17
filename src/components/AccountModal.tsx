import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";

import { SHEET_COLORS } from "../data/constants";
import type { Account, CategoryIcon } from "../data/types";
import { useBodyScrollLock } from "../utils/scroll-lock";
import { GlyphPicker } from "./GlyphPicker";
import { CategoryIconGlyph } from "./icons";

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
  // when budgets / transactions still reference the account).
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

  useBodyScrollLock(open);

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

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[95vh] w-full max-w-lg flex-col overflow-hidden rounded-t-lg bg-surface shadow-2xl sm:rounded-lg">
        <header className="flex items-center justify-between border-b border-line bg-surface-3 px-4 py-3">
          <h2
            id="account-modal-title"
            className="text-sm font-bold tracking-wide text-fg-bright"
          >
            {isEdit ? "Edit account" : "New account"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X size={18} aria-hidden focusable={false} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
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
                <span className="text-xs text-muted">Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canSave) {
                      e.preventDefault();
                      handleSave();
                    }
                  }}
                  className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
                  placeholder="Checking, Travel fund, Cash…"
                  autoFocus
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Optional. e.g. shared household savings."
                className="field-input w-full min-w-0 resize-none rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Glyph</span>
              <GlyphPicker
                value={glyph}
                onChange={setGlyph}
                defaultIcon="wallet"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Color</span>
              <div className="flex flex-wrap gap-1.5">
                {SHEET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    aria-pressed={c === color}
                    onClick={() => setColor(c)}
                    className={`h-6 w-6 cursor-pointer rounded-full border-2 ${
                      c === color ? "border-fg-bright" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Bank</span>
              <input
                type="text"
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                placeholder="e.g. Swedbank, Nordea, Revolut…"
                className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
              />
            </div>

            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-xs text-muted">Clearing</span>
                <input
                  type="text"
                  value={clearing}
                  onChange={(e) => setClearing(e.target.value)}
                  placeholder="8327"
                  className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-xs text-muted">Account number</span>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="123 456 789"
                  className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
                />
              </label>
            </div>

            <div className="grid grid-cols-[2fr_1fr] gap-2">
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-xs text-muted">IBAN</span>
                <input
                  type="text"
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="SE45 5000 0000 0583 9825 7466"
                  className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-xs text-muted">BIC / SWIFT</span>
                <input
                  type="text"
                  value={bic}
                  onChange={(e) => setBic(e.target.value)}
                  placeholder="SWEDSESS"
                  className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Currency override</span>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="Leave blank to use the global setting"
                className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
              />
              <span className="text-xs text-muted">
                Free-form token. Empty means use the workspace setting.
              </span>
            </label>

            {!hasDetails && (
              <p className="rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
                This account has no bank details. You can still track its
                balance and transfers — fill them in later for easier
                reconciliation.
              </p>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-line bg-surface-3 px-4 py-3">
          <div>
            {isEdit && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-danger/60 bg-danger/10 px-3 py-1.5 text-sm text-danger hover:bg-danger/20"
              >
                <Trash2 size={14} aria-hidden focusable={false} />
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isEdit ? "Save" : "Create"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
