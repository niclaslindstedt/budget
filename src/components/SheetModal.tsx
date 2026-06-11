import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Plus, Table, Trash2, Wallet } from "lucide-react";

import {
  DEFAULT_SHEET_COLOR,
  DEFAULT_SHEET_GLYPH,
  SHEET_COLORS,
  SHEET_GLYPH_NAMES,
} from "../data/constants/taxonomy";
import { normalizeName } from "../data/normalize";
import {
  SHEET_TYPE_REGISTRY,
  getSheetTypeDescriptor,
} from "../data/sheet-types";
import type {
  Account,
  Sheet,
  SheetGlyph,
  SheetType,
  TaxProfile,
} from "../data/types";
import { useDesktopAutoFocus, type FloatingPlacement } from "../hooks";
import { useT } from "../i18n";
import { tintBorder, tintFill } from "../utils/tint";
import { ColorPalette } from "./ColorPalette";
import { FloatingPanel } from "./FloatingPanel";
import { Button, ClearableInput, ClearableTextarea, FormSection } from "./form";
import { GlyphGrid } from "./GlyphGrid";
import { Modal } from "./Modal";
import { TaxProfilePicker } from "./salary/TaxProfilePicker";
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
  // The tax profile bound to the sheet's salary item (or null) — seeds
  // the tax-profile picker on a salary sheet so an edit doesn't appear
  // to wipe it on open.
  currentTaxProfileId: string | null;
  // The reusable tax-profile library, offered by the picker on salary
  // sheets.
  taxProfiles: TaxProfile[];
  // Persist a freshly-created profile to the library immediately (so it
  // survives even if the sheet edit is cancelled), mirroring how the
  // employer picker creates an employer on the spot.
  onCreateTaxProfile: (profile: TaxProfile) => void;
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
  currentTaxProfileId,
  taxProfiles,
  onCreateTaxProfile,
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
  const [taxProfileId, setTaxProfileId] = useState<string | null>(null);
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
    setTaxProfileId(currentTaxProfileId);
  }, [open, sheet, currentAccountId, currentTaxProfileId]);

  useEffect(() => {
    if (creatingAccount) newAccountInputRef.current?.focus();
  }, [creatingAccount]);

  const trimmedName = normalizeName(name);
  const trimmedNewAccount = normalizeName(newAccountName);
  const canSave =
    trimmedName !== null && (!creatingAccount || trimmedNewAccount !== null);
  const selectedType = getSheetTypeDescriptor(type);

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
    if (trimmedName === null) return;
    onSave({
      name: trimmedName,
      type,
      glyph,
      color,
      description: description.trim(),
      accountId: creatingAccount ? null : accountId,
      newAccountName:
        creatingAccount && trimmedNewAccount !== null
          ? trimmedNewAccount
          : null,
      taxProfileId: type === "salary" ? taxProfileId : null,
    });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="sheet-modal-title">
      <Modal.Header
        icon={<Table size={14} aria-hidden focusable={false} />}
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
                backgroundColor: tintFill(color),
                borderColor: tintBorder(color),
              }}
            >
              <CategoryIconGlyph name={glyph} size={22} />
            </div>
            <FormSection
              as="label"
              className="flex-1"
              label={t("sheetModal.name")}
            >
              <ClearableInput
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
            </FormSection>
          </div>

          <FormSection label={t("sheetModal.type")}>
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
          </FormSection>

          {type === "accounts" && (
            <p className="rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
              {t("sheetModal.accountsHint")}
            </p>
          )}

          {type === "items" && (
            <p className="rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
              {t("sheetModal.itemsHint")}
            </p>
          )}

          {type === "properties" && (
            <p className="rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
              {t("sheetModal.propertiesHint")}
            </p>
          )}

          {type === "loans" && (
            <p className="rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
              {t("sheetModal.loansHint")}
            </p>
          )}

          {type === "insights" && (
            <p className="rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
              {t("sheetModal.insightsHint")}
            </p>
          )}

          {(type === "budget" || type === "salary") && (
            <FormSection label={t("sheetModal.account")}>
              {creatingAccount ? (
                <div className="flex flex-col gap-2 rounded border border-line bg-surface-2 p-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted">
                      {t("sheetModal.newAccountName")}
                    </span>
                    <ClearableInput
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
                {type === "salary"
                  ? t("sheetModal.salaryAccountHint")
                  : t("sheetModal.accountHint")}
              </p>
            </FormSection>
          )}

          {type === "salary" && (
            <FormSection label={t("tax.label")}>
              <TaxProfilePicker
                value={taxProfileId}
                profiles={taxProfiles}
                onPick={setTaxProfileId}
                onCreate={onCreateTaxProfile}
              />
              <p className="text-xs text-muted">{t("tax.sheetHint")}</p>
            </FormSection>
          )}

          <FormSection label={t("sheetModal.color")}>
            <ColorPalette
              colors={SHEET_COLORS}
              value={color}
              onChange={setColor}
            />
          </FormSection>

          <FormSection label={t("sheetModal.glyph")}>
            <GlyphGrid
              icons={selectedType.glyphNames ?? SHEET_GLYPH_NAMES}
              value={glyph}
              onChange={setGlyph}
              size={8}
              tintColor={color}
            />
          </FormSection>

          <FormSection as="label" label={t("sheetModal.description")}>
            <ClearableTextarea
              value={description}
              onValueChange={setDescription}
              rows={2}
              placeholder={t("sheetModal.descriptionPlaceholder")}
              wrapperClassName="w-full"
              className="field-input w-full resize-none rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </FormSection>
        </div>
      </Modal.Body>
      <Modal.Footer className="justify-between">
        <div>
          {isEdit && onDelete && (
            <Button
              variant="danger"
              withIcon
              onClick={onDelete}
              disabled={!canDelete}
              title={
                canDelete
                  ? t("sheetModal.deleteThisSheet")
                  : t("sheetModal.cantDeleteLast")
              }
            >
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
            {isEdit ? t("common.save") : t("sheetModal.create")}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}

// Full-width dropdown anchored to the trigger's left edge. Routed
// through `FloatingPanel` so the menu's portal lifts it out of the
// SheetModal's z-50 stacking context, which would otherwise cap the
// menu options against the dismiss backdrop and swallow every tap.
const ACCOUNT_PICKER_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 240 },
  anchor: "left",
  coordinateSpace: "viewport",
};

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
  const t = useT();
  const triggerRef = useRef<HTMLDivElement>(null);
  const selected = accounts.find((a) => a.id === value) ?? null;
  const noAccountLabel = t("sheetModal.noAccount");

  return (
    <div ref={triggerRef} className="relative">
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
          {selected ? selected.name : noAccountLabel}
        </span>
        <ChevronDown
          size={14}
          className="shrink-0 text-muted"
          aria-hidden
          focusable={false}
        />
      </button>
      <FloatingPanel
        open={open}
        onClose={onClose}
        triggerRef={triggerRef}
        placement={ACCOUNT_PICKER_PLACEMENT}
      >
        <ul role="listbox" className="max-h-64 overflow-auto py-1">
          <AccountOption
            label={noAccountLabel}
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
              {t("sheetModal.newAccount")}
            </button>
          </li>
        </ul>
      </FloatingPanel>
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

// Same `FloatingPanel` rationale as `AccountPicker` above — the sheet
// type picker lives inside the SheetModal's z-50 stacking context, so
// rendering its option list inline would cap its z-index against the
// dismiss backdrop.
const SHEET_TYPE_PICKER_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 240 },
  anchor: "left",
  coordinateSpace: "viewport",
};

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
  const t = useT();
  const triggerRef = useRef<HTMLDivElement>(null);
  const selected = getSheetTypeDescriptor(value);

  return (
    <div ref={triggerRef} className="relative">
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
      <FloatingPanel
        open={open}
        onClose={onClose}
        triggerRef={triggerRef}
        placement={SHEET_TYPE_PICKER_PLACEMENT}
      >
        <ul role="listbox" className="overflow-hidden py-1">
          {SHEET_TYPE_REGISTRY.map((opt) => {
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
                    <span className="text-xs text-muted">
                      {t("sheetModal.alreadyExists")}
                    </span>
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
      </FloatingPanel>
    </div>
  );
}
