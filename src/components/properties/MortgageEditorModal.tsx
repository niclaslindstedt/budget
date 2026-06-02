import { useRef, useState } from "react";
import { Check, ChevronDown, Landmark, Wallet } from "lucide-react";

import { newId } from "../../data/sheet";
import type { Account, Mortgage } from "../../data/types";
import { useResetOnOpen, type FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import { tintBorder, tintFill } from "../../utils/tint";
import { Button, ClearableInput } from "../form";
import { FloatingPanel } from "../FloatingPanel";
import { CategoryIconGlyph } from "../icons";
import { Modal } from "../Modal";

// Create / edit one mortgage (loan) under a property — its name and the
// bank account "Find payments" scans. Mirrors the shape of the salary
// sheet's account binding, but per-mortgage rather than per-sheet.
//
// Not `centered`: the name field opens the soft keyboard.

type Props = {
  open: boolean;
  // The mortgage to edit, or null in create mode.
  mortgage: Mortgage | null;
  accounts: readonly Account[];
  onClose: () => void;
  onSubmit: (mortgageId: string, patch: Partial<Omit<Mortgage, "id">>) => void;
  onCreate: (mortgage: Mortgage) => void;
};

export function MortgageEditorModal({
  open,
  mortgage,
  accounts,
  onClose,
  onSubmit,
  onCreate,
}: Props) {
  const t = useT();
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  useResetOnOpen(open, mortgage?.id ?? "__create__", () => {
    setName(mortgage?.name ?? "");
    setAccountId(mortgage?.accountId ?? null);
    setAccountOpen(false);
  });

  if (!open) return null;

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    if (mortgage) {
      onSubmit(mortgage.id, { name: trimmedName, accountId });
      return;
    }
    onCreate({
      id: newId(),
      name: trimmedName,
      accountId,
      payments: [],
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="mortgage-editor-modal-title"
      size="max-w-sm"
    >
      <Modal.Header
        icon={<Landmark size={14} aria-hidden focusable={false} />}
        title={
          mortgage
            ? t("properties.editMortgageTitle")
            : t("properties.newMortgageTitle")
        }
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.mortgageNameLabel")}
            </span>
            <ClearableInput
              value={name}
              onValueChange={setName}
              placeholder={t("properties.mortgageNamePlaceholder")}
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.accountLabel")}
            </span>
            <MortgageAccountPicker
              value={accountId}
              accounts={accounts}
              open={accountOpen}
              onToggle={() => setAccountOpen((v) => !v)}
              onClose={() => setAccountOpen(false)}
              onPick={(id) => {
                setAccountId(id);
                setAccountOpen(false);
              }}
            />
            <p className="m-0 text-xs text-muted">
              {t("properties.accountHint")}
            </p>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
          {mortgage ? t("properties.save") : t("properties.create")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// Routed through `FloatingPanel` so the list lifts out of the modal's
// stacking context. Mirrors the account pickers in AccountTransferModal /
// SheetModal — no native `<select>`. `null` value means "no account".
const ACCOUNT_PICKER_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 240 },
  anchor: "left",
  coordinateSpace: "viewport",
};

function MortgageAccountPicker({
  value,
  accounts,
  open,
  onToggle,
  onClose,
  onPick,
}: {
  value: string | null;
  accounts: readonly Account[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPick: (value: string | null) => void;
}) {
  const t = useT();
  const triggerRef = useRef<HTMLDivElement>(null);
  const selected = accounts.find((a) => a.id === value) ?? null;

  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
      >
        <span
          aria-hidden
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
          style={{
            color: selected?.color,
            backgroundColor: selected?.color
              ? tintFill(selected.color)
              : undefined,
            borderColor: selected?.color
              ? tintBorder(selected.color)
              : undefined,
          }}
        >
          {selected?.glyph ? (
            <CategoryIconGlyph name={selected.glyph} size={12} />
          ) : (
            <Wallet size={12} aria-hidden focusable={false} />
          )}
        </span>
        <span className="flex-1 truncate">
          {selected ? selected.name : t("properties.chooseAccount")}
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
          <li>
            <button
              type="button"
              role="option"
              aria-selected={value === null}
              onClick={() => onPick(null)}
              className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-muted hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <span className="flex-1 truncate">
                {t("properties.noAccount")}
              </span>
              {value === null && (
                <Check
                  size={14}
                  className="text-accent"
                  aria-hidden
                  focusable={false}
                />
              )}
            </button>
          </li>
          {accounts.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted">
              {t("properties.noAccountsYet")}
            </li>
          )}
          {accounts.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                role="option"
                aria-selected={a.id === value}
                onClick={() => onPick(a.id)}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <span
                  aria-hidden
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
                  style={{
                    color: a.color,
                    backgroundColor: a.color ? tintFill(a.color) : undefined,
                    borderColor: a.color ? tintBorder(a.color) : undefined,
                  }}
                >
                  {a.glyph ? (
                    <CategoryIconGlyph name={a.glyph} size={12} />
                  ) : (
                    <Wallet size={12} aria-hidden focusable={false} />
                  )}
                </span>
                <span className="flex-1 truncate">{a.name}</span>
                {a.id === value && (
                  <Check
                    size={14}
                    className="text-accent"
                    aria-hidden
                    focusable={false}
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      </FloatingPanel>
    </div>
  );
}
