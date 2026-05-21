import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Plus, Trash2, Wallet } from "lucide-react";

import {
  DEFAULT_SHEET_COLOR,
  DEFAULT_SHEET_GLYPH,
  SHEET_COLORS,
  SHEET_GLYPH_NAMES,
  SHEET_TYPES,
} from "../data/constants";
import type { Account, Sheet, SheetGlyph, SheetType } from "../data/types";
import { useDesktopAutoFocus, usePointerOutside } from "../hooks";
import { useT } from "../i18n";
import { ColorPalette } from "./ColorPalette";
import { ClearableTextInput } from "./form";
import { GlyphGrid } from "./GlyphGrid";
import { Modal } from "./Modal";
import { CategoryIconGlyph } from "./icons";

export type { SheetDraft } from "../data/action-payloads";
import type { SheetDraft } from "../data/action-payloads";

type Props = {
  open: boolean;
  // When set, the modal opens in "edit" mode and pre-fills its fields
  // from the sheet. When null it's the new-sheet form. Edit mode also
  // surfaces a Delete button (disabled when the sheet is the only one
  // left so the user always has somewhere to land).
  sheet: Sheet | null;
  // The accountId currently attached to the sheet's budget item (or
  // null for a new sheet) — used to seed the account picker so an
  // edit doesn't appear to wipe the account on open.
  currentAccountId: string | null;
  accounts: Account[];
  canDelete: boolean;
  // True when the workspace already contains an Accounts sheet (other
  // than the one being edited). The TypePicker greys out the Accounts
  // option in that case so the user can't create a second.
  accountsSheetTaken?: boolean;
  onClose: () => void;
  onSave: (draft: SheetDraft) => void;
  onDelete?: () => void;
};

const NEW_ACCOUNT_SENTINEL = "__new__";

// Single editor for both the New-sheet flow and per-sheet metadata
// edits. Holds a local draft so cancel discards in-progress edits;
// reseeds every time the modal opens with the canonical source.
export function SheetModal({
  open,
  sheet,
  currentAccountId,
  accounts,
  canDelete,
  accountsSheetTaken = false,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const t = useT();
  const isEdit = sheet !== null;
  const [name, setName] = useState("");
  const [type, setType] = useState<SheetType>("budget");
  const [glyph, setGlyph] = useState<SheetGlyph>(DEFAULT_SHEET_GLYPH);
  const [color, setColor] = useState<string>(DEFAULT_SHEET_COLOR);
  const [description, setDescription] = useState("");
  const [typeOpen, setTypeOpen] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const newAccountInputRef = useRef<HTMLInputElement | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(nameRef, open);

  useEffect(() => {
    if (!open) return;
    setName(sheet?.name ?? "");
    setType(sheet?.type ?? "budget");
    setGlyph(sheet?.glyph ?? DEFAULT_SHEET_GLYPH);
    setColor(sheet?.color ?? DEFAULT_SHEET_COLOR);
    setDescription(sheet?.description ?? "");
    setTypeOpen(false);
    setAccountId(currentAccountId);
    setAccountOpen(false);
    setCreatingAccount(false);
    setNewAccountName("");
  }, [open, sheet, currentAccountId]);

  useEffect(() => {
    if (creatingAccount) newAccountInputRef.current?.focus();
  }, [creatingAccount]);

  const trimmedNewAccount = newAccountName.trim();
  const canSave =
    name.trim().length > 0 &&
    (!creatingAccount || trimmedNewAccount.length > 0);
  const selectedType = SHEET_TYPES.find((t) => t.id === type) ?? SHEET_TYPES[0];

  function handleAccountChange(value: string) {
    if (value === NEW_ACCOUNT_SENTINEL) {
      setCreatingAccount(true);
      setAccountOpen(false);
      return;
    }
    setAccountId(value === "" ? null : value);
    setAccountOpen(false);
  }

  function handleCancelCreateAccount() {
    setCreatingAccount(false);
    setNewAccountName("");
  }

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({
      name: trimmed,
      type,
      glyph,
      color,
      description: description.trim(),
      accountId: creatingAccount ? null : accountId,
      newAccountName:
        creatingAccount && trimmedNewAccount ? trimmedNewAccount : null,
    });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="sheet-modal-title">
      <Modal.Header
        title={isEdit ? t("sheetModal.titleEdit") : t("sheetModal.titleNew")}
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
              <CategoryIconGlyph name={glyph} size={22} />
            </div>
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-xs text-muted">{t("sheetModal.name")}</span>
              <ClearableTextInput
                ref={nameRef}
                value={name}
                onValueChange={setName}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSave) {
                    e.preventDefault();
                    handleSave();
                  }
                }}
                className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
                placeholder={t("sheetModal.namePlaceholder")}
              />
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t("sheetModal.type")}</span>
            <TypePicker
              value={type}
              open={typeOpen}
              accountsTaken={accountsSheetTaken}
              onToggle={() => setTypeOpen((v) => !v)}
              onClose={() => setTypeOpen(false)}
              onPick={(next) => {
                setType(next);
                setTypeOpen(false);
              }}
            />
            <p className="text-xs text-muted">{selectedType.description}</p>
          </div>

          {type === "accounts" && (
            <p className="rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
              {t("sheetModal.accountsHint")}
            </p>
          )}

          {type === "budget" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">
                {t("sheetModal.account")}
              </span>
              {creatingAccount ? (
                <div className="flex flex-col gap-2 rounded border border-line bg-surface-2 p-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted">
                      {t("sheetModal.newAccountName")}
                    </span>
                    <ClearableTextInput
                      ref={newAccountInputRef}
                      value={newAccountName}
                      onValueChange={setNewAccountName}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          handleCancelCreateAccount();
                        }
                      }}
                      placeholder={t("sheetModal.newAccountPlaceholder")}
                      className="field-input w-full min-w-0 rounded border border-line bg-surface px-2 py-1.5 text-sm text-fg"
                    />
                  </label>
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={handleCancelCreateAccount}
                      className="cursor-pointer rounded border border-line px-2 py-1 text-xs text-muted hover:text-fg"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <AccountPicker
                  value={accountId}
                  accounts={accounts}
                  open={accountOpen}
                  onToggle={() => setAccountOpen((v) => !v)}
                  onClose={() => setAccountOpen(false)}
                  onPick={handleAccountChange}
                />
              )}
              <p className="text-xs text-muted">
                {t("sheetModal.accountHint")}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t("sheetModal.color")}</span>
            <ColorPalette
              colors={SHEET_COLORS}
              value={color}
              onChange={setColor}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t("sheetModal.glyph")}</span>
            <GlyphGrid
              icons={SHEET_GLYPH_NAMES}
              value={glyph}
              onChange={setGlyph}
              size={8}
              tintColor={color}
            />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">
              {t("sheetModal.description")}
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t("sheetModal.descriptionPlaceholder")}
              className="field-input resize-none rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </label>
        </div>
      </Modal.Body>
      <Modal.Footer className="justify-between">
        <div>
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={!canDelete}
              title={
                canDelete
                  ? t("sheetModal.deleteThisSheet")
                  : t("sheetModal.cantDeleteLast")
              }
              className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-danger/60 bg-danger/10 px-3 py-1.5 text-sm text-danger hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={14} aria-hidden focusable={false} />
              {t("common.delete")}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEdit ? t("common.save") : t("sheetModal.create")}
          </button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}

function AccountPicker({
  value,
  accounts,
  open,
  onToggle,
  onClose,
  onPick,
}: {
  value: string | null;
  accounts: Account[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPick: (value: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = accounts.find((a) => a.id === value) ?? null;

  usePointerOutside(open, [rootRef], onClose);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
      >
        <span className="text-muted">
          <Wallet size={16} aria-hidden focusable={false} />
        </span>
        <span className="flex-1 truncate">
          {selected ? selected.name : "No account"}
        </span>
        <ChevronDown
          size={14}
          className="shrink-0 text-muted"
          aria-hidden
          focusable={false}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-10 mt-1 max-h-64 overflow-auto rounded border border-line bg-surface-2 py-1 shadow-lg"
        >
          <AccountOption
            label="No account"
            icon={<Wallet size={16} aria-hidden focusable={false} />}
            selected={value === null}
            onClick={() => onPick("")}
          />
          {accounts.map((a) => (
            <AccountOption
              key={a.id}
              label={a.name}
              icon={<Wallet size={16} aria-hidden focusable={false} />}
              selected={a.id === value}
              onClick={() => onPick(a.id)}
            />
          ))}
          <li className="mt-1 border-t border-line">
            <button
              type="button"
              onClick={() => onPick(NEW_ACCOUNT_SENTINEL)}
              className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <Plus size={14} aria-hidden focusable={false} />
              New account
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

function AccountOption({
  label,
  icon,
  selected,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onClick}
        className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <span className="text-muted">{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        {selected && (
          <Check
            size={14}
            className="text-accent"
            aria-hidden
            focusable={false}
          />
        )}
      </button>
    </li>
  );
}

function TypePicker({
  value,
  open,
  accountsTaken,
  onToggle,
  onClose,
  onPick,
}: {
  value: SheetType;
  open: boolean;
  accountsTaken: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPick: (next: SheetType) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = SHEET_TYPES.find((t) => t.id === value) ?? SHEET_TYPES[0];

  usePointerOutside(open, [rootRef], onClose);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
      >
        <span className="text-muted">
          <CategoryIconGlyph name={selected.glyph} size={16} />
        </span>
        <span className="flex-1 truncate">{selected.label}</span>
        <ChevronDown
          size={14}
          className="shrink-0 text-muted"
          aria-hidden
          focusable={false}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded border border-line bg-surface-2 py-1 shadow-lg"
        >
          {SHEET_TYPES.map((opt) => {
            const isSelected = opt.id === value;
            // Singleton enforcement: only one Accounts sheet can exist
            // per workspace. Once one is in place, the option greys out
            // (unless this modal is editing that very sheet — handled
            // by the parent passing `accountsTaken=false` in that case).
            const isDisabled =
              opt.id === "accounts" && accountsTaken && !isSelected;
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={isDisabled}
                  onClick={() => {
                    if (isDisabled) return;
                    onPick(opt.id);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-muted">
                    <CategoryIconGlyph name={opt.glyph} size={16} />
                  </span>
                  <span className="flex-1 truncate">{opt.label}</span>
                  {isDisabled && (
                    <span className="text-xs text-muted">Already exists</span>
                  )}
                  {isSelected && (
                    <Check
                      size={14}
                      className="text-accent"
                      aria-hidden
                      focusable={false}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
