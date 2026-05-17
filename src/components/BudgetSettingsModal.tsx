import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { newId } from "../data/sheet";
import type { Account } from "../data/types";

type Props = {
  open: boolean;
  budgetName: string;
  accounts: Account[];
  accountId: string | null;
  onClose: () => void;
  onSave: (next: { name: string; accountId: string | null }) => void;
  onCreateAccount: (account: Account) => void;
};

const NEW_ACCOUNT_SENTINEL = "__new__";

export function BudgetSettingsModal({
  open,
  budgetName,
  accounts,
  accountId,
  onClose,
  onSave,
  onCreateAccount,
}: Props) {
  // Local draft so cancelling discards in-progress edits. Resyncs each
  // time the modal opens with whatever the store currently holds.
  const [name, setName] = useState(budgetName);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    accountId,
  );
  const [creating, setCreating] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const newAccountInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(budgetName);
    setSelectedAccountId(accountId);
    setCreating(false);
    setNewAccountName("");
  }, [open, budgetName, accountId]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (creating) newAccountInputRef.current?.focus();
  }, [creating]);

  if (!open) return null;

  function handleAccountChange(value: string) {
    if (value === NEW_ACCOUNT_SENTINEL) {
      setCreating(true);
      return;
    }
    setSelectedAccountId(value === "" ? null : value);
  }

  function handleCreateAccount() {
    const trimmed = newAccountName.trim();
    if (!trimmed) return;
    const account: Account = { id: newId(), name: trimmed };
    onCreateAccount(account);
    setSelectedAccountId(account.id);
    setCreating(false);
    setNewAccountName("");
  }

  function handleCancelCreate() {
    setCreating(false);
    setNewAccountName("");
  }

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({ name: trimmed, accountId: selectedAccountId });
    onClose();
  }

  const canSave = name.trim().length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="budget-settings-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[95vh] w-full max-w-lg flex-col overflow-hidden rounded-t-lg bg-surface shadow-2xl sm:rounded-lg">
        <header className="flex items-center justify-between border-b border-line bg-surface-3 px-4 py-3">
          <h2
            id="budget-settings-title"
            className="text-sm font-bold tracking-wide text-fg-bright"
          >
            Budget settings
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
            <label className="flex flex-col gap-1.5">
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
                placeholder="Sheet 1"
                autoFocus
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Account</span>
              {creating ? (
                <div className="flex flex-col gap-2 rounded border border-line bg-surface-2 p-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted">New account name</span>
                    <input
                      ref={newAccountInputRef}
                      type="text"
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleCreateAccount();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          handleCancelCreate();
                        }
                      }}
                      placeholder="Checking, Cash, Travel fund…"
                      className="field-input rounded border border-line bg-surface px-2 py-1.5 text-sm text-fg"
                    />
                  </label>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleCancelCreate}
                      className="cursor-pointer rounded border border-line px-2 py-1 text-xs text-muted hover:text-fg"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateAccount}
                      disabled={!newAccountName.trim()}
                      className="cursor-pointer rounded border border-accent bg-accent/10 px-2 py-1 text-xs font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ) : (
                <select
                  value={selectedAccountId ?? ""}
                  onChange={(e) => handleAccountChange(e.target.value)}
                  className="field-input cursor-pointer rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg-bright"
                >
                  <option value="">No account</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                  <option value={NEW_ACCOUNT_SENTINEL}>+ New account…</option>
                </select>
              )}
              <p className="text-xs text-muted">
                Attach this budget to an account so its running balance can
                later reflect the account&apos;s real balance. Leave it
                unassigned if you just want a free-standing forward-looking
                ledger.
              </p>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3">
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
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
