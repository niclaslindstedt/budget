import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import type { Account, Settings } from "../data/types";
import {
  formatAmountForInput,
  formatBalance,
  normalizeAmountInput,
  parseAmount,
  withCurrency,
} from "../utils/format";
import { useBodyScrollLock } from "../utils/scroll-lock";

type Props = {
  open: boolean;
  account: Account | null;
  // Current balance computed by the parent from the same accountBalance()
  // call that drives the Accounts page, so the modal and the page agree
  // on the starting number even when the user opens us mid-keystroke.
  currentBalance: number;
  settings: Settings;
  // ISO date the correction row will be stamped with (the parent decides
  // — today in the normal flow; broken out as a prop so a future "pick
  // a date" affordance can pass something else in without re-plumbing).
  date: string;
  // True when at least one AccountBudget in the workspace tracks this
  // account. When false, the modal renders a hint explaining why no
  // correction can be recorded and shows only a Close button.
  canRecord: boolean;
  onConfirm: (newBalance: number) => void;
  onCancel: () => void;
};

export function UpdateBalanceModal({
  open,
  account,
  currentBalance,
  settings,
  date,
  canRecord,
  onConfirm,
  onCancel,
}: Props) {
  useBodyScrollLock(open);

  // Account-scoped settings so the modal renders amounts in the same
  // currency the Accounts page just showed the user (per-account
  // currency overrides the global one).
  const accountSettings = useMemo(
    () =>
      account?.currency
        ? { ...settings, currency: account.currency }
        : settings,
    [account, settings],
  );

  // Lazy init so the input renders pre-seeded on the first paint after
  // open — important on iOS, where the input must be ready *and* focused
  // inside the click gesture that opened the modal for the soft keyboard
  // to appear. The `key={account.id}` on the <input> remounts it when
  // the user opens the modal for a different account, re-running the
  // autoFocus + reseeding via the effect below.
  const [text, setText] = useState(() =>
    formatAmountForInput(currentBalance, accountSettings),
  );
  useEffect(() => {
    if (!open) return;
    setText(formatAmountForInput(currentBalance, accountSettings));
  }, [open, account?.id, currentBalance, accountSettings]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open || !account) return null;

  const parsed = parseAmount(text);
  const delta = parsed !== null ? parsed - currentBalance : null;
  const hasDelta = delta !== null && delta !== 0;
  // Pre-format the bits the summary line stitches together so the JSX
  // stays tidy and the signed prefix is explicit (the `+` is suppressed
  // by `formatBalance` for positives, but the line needs the sign so
  // the user can tell additions from withdrawals at a glance).
  const deltaText =
    delta !== null
      ? `${delta >= 0 ? "+" : "−"}${withCurrency(
          formatAmountForInput(Math.abs(delta), accountSettings),
          accountSettings,
        )}`
      : "";
  const newBalanceText =
    parsed !== null ? formatBalance(parsed, accountSettings) : "";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canRecord || !hasDelta || parsed === null) return;
    onConfirm(parsed);
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-balance-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-t-lg bg-surface shadow-2xl sm:rounded-lg"
      >
        <header className="flex items-center justify-between border-b border-line bg-surface-3 px-4 py-3">
          <h2
            id="update-balance-title"
            className="text-sm font-bold tracking-wide text-fg-bright"
          >
            Update balance
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="-mr-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X size={18} aria-hidden focusable={false} />
          </button>
        </header>

        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 text-sm text-fg">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted">Account</span>
            <span className="font-bold text-fg-bright">{account.name}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted">Current balance</span>
            <span
              className={`tabular-nums ${
                currentBalance < 0 ? "text-negative" : "text-positive"
              }`}
            >
              {formatBalance(currentBalance, accountSettings)}
            </span>
          </div>

          {canRecord ? (
            <label className="flex flex-col gap-1">
              <span className="text-muted">New balance</span>
              <input
                key={account.id}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                value={text}
                onChange={(e) =>
                  setText(normalizeAmountInput(e.target.value, accountSettings))
                }
                className="field-input w-full rounded border border-line bg-surface-2 px-2.5 py-2 text-right font-mono tabular-nums text-fg-bright outline-none focus:border-accent"
              />
            </label>
          ) : (
            <p className="text-xs text-muted">
              No budget sheet tracks this account yet. Add one (Sheet → Edit →
              pick this account) before recording a correction.
            </p>
          )}

          {canRecord && hasDelta && (
            <p className="text-xs text-muted">
              Adds a balance correction of{" "}
              <span
                className={`font-mono tabular-nums ${
                  delta >= 0 ? "text-positive" : "text-negative"
                }`}
              >
                {deltaText}
              </span>{" "}
              on <span className="font-mono text-flag">{date}</span> so the
              running balance lands on{" "}
              <span className="font-mono tabular-nums text-fg-bright">
                {newBalanceText}
              </span>
              .
            </p>
          )}
          {canRecord && parsed !== null && !hasDelta && (
            <p className="text-xs text-muted">
              Already at this balance — nothing to record.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 px-4 py-3">
          {canRecord && (
            <button
              type="submit"
              disabled={!hasDelta}
              className="cursor-pointer rounded border border-accent/60 bg-accent/10 px-3 py-2 text-left text-sm font-medium text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-muted disabled:hover:bg-transparent"
            >
              Confirm balance update
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded border border-line px-3 py-2 text-sm text-muted hover:text-fg"
          >
            {canRecord ? "Cancel" : "Close"}
          </button>
        </div>
      </form>
    </div>
  );
}
