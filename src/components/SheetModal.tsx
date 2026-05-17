import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Plus, Trash2, Wallet, X } from "lucide-react";

import {
  CATEGORY_ICON_NAMES,
  DEFAULT_SHEET_COLOR,
  DEFAULT_SHEET_GLYPH,
  SHEET_COLORS,
  SHEET_TYPES,
} from "../data/constants";
import type { Account, Sheet, SheetGlyph, SheetType } from "../data/types";
import { CategoryIconGlyph } from "./icons";

export type SheetDraft = {
  name: string;
  type: SheetType;
  glyph: SheetGlyph;
  color: string;
  description: string;
  // Type-specific payload. Today only `budget` exists and carries an
  // optional account id; future flavours can grow their own branches
  // without affecting the existing shape.
  accountId: string | null;
  // When set, the parent should mint a new Account by this name and
  // attach it to the budget. Lets the user create both a sheet and
  // the account it lives on in a single round-trip through the
  // modal.
  newAccountName: string | null;
};

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
  onClose,
  onSave,
  onDelete,
}: Props) {
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

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sheet-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[95vh] w-full max-w-lg flex-col overflow-hidden rounded-t-lg bg-surface shadow-2xl sm:rounded-lg">
        <header className="flex items-center justify-between border-b border-line bg-surface-3 px-4 py-3">
          <h2
            id="sheet-modal-title"
            className="text-sm font-bold tracking-wide text-fg-bright"
          >
            {isEdit ? "Edit sheet" : "New sheet"}
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

        <div className="flex-1 overflow-y-auto px-4 py-4">
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
                  className="field-input rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
                  placeholder="Checking, Travel fund, Child account…"
                  autoFocus
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Type</span>
              <TypePicker
                value={type}
                open={typeOpen}
                onToggle={() => setTypeOpen((v) => !v)}
                onPick={(next) => {
                  setType(next);
                  setTypeOpen(false);
                }}
              />
              <p className="text-xs text-muted">{selectedType.description}</p>
            </label>

            {type === "budget" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">Account</span>
                {creatingAccount ? (
                  <div className="flex flex-col gap-2 rounded border border-line bg-surface-2 p-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted">
                        New account name
                      </span>
                      <input
                        ref={newAccountInputRef}
                        type="text"
                        value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            handleCancelCreateAccount();
                          }
                        }}
                        placeholder="Checking, Cash, Travel fund…"
                        className="field-input rounded border border-line bg-surface px-2 py-1.5 text-sm text-fg"
                      />
                    </label>
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={handleCancelCreateAccount}
                        className="cursor-pointer rounded border border-line px-2 py-1 text-xs text-muted hover:text-fg"
                      >
                        Cancel
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
                  Attach this budget to an account so its running balance can
                  reflect the account&apos;s real balance. Leave it unassigned
                  for a free-standing forward-looking ledger.
                </p>
              </div>
            )}

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
              <span className="text-xs text-muted">Glyph</span>
              <div className="grid grid-cols-8 gap-1">
                {CATEGORY_ICON_NAMES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-label={`Glyph ${name}`}
                    aria-pressed={name === glyph}
                    onClick={() => setGlyph(name)}
                    className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded border ${
                      name === glyph
                        ? "border-current"
                        : "border-line text-muted hover:border-fg"
                    }`}
                    style={
                      name === glyph
                        ? {
                            color,
                            backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
                          }
                        : undefined
                    }
                  >
                    <CategoryIconGlyph name={name} size={16} />
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Optional. e.g. expenses for child account."
                className="field-input resize-none rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
              />
            </label>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-line bg-surface-3 px-4 py-3">
          <div>
            {isEdit && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={!canDelete}
                title={
                  canDelete
                    ? "Delete this sheet"
                    : "Can't delete the only sheet"
                }
                className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-danger/60 bg-danger/10 px-3 py-1.5 text-sm text-danger hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-50"
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

  useEffect(() => {
    if (!open) return;
    function handlePointer(e: PointerEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      onClose();
    }
    document.addEventListener("pointerdown", handlePointer);
    return () => document.removeEventListener("pointerdown", handlePointer);
  }, [open, onClose]);

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
  onToggle,
  onPick,
}: {
  value: SheetType;
  open: boolean;
  onToggle: () => void;
  onPick: (next: SheetType) => void;
}) {
  const selected = SHEET_TYPES.find((t) => t.id === value) ?? SHEET_TYPES[0];
  return (
    <div className="relative">
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
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => onPick(opt.id)}
                  className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="text-muted">
                    <CategoryIconGlyph name={opt.glyph} size={16} />
                  </span>
                  <span className="flex-1 truncate">{opt.label}</span>
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
