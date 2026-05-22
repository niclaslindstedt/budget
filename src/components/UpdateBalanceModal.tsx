import { useEffect, useMemo, useRef, useState } from "react";

import type { Account, Settings } from "../data/types";
import { useDesktopAutoFocus } from "../hooks";
import { useT } from "../i18n";
import {
  formatAmountForInput,
  formatBalance,
  normalizeAmountInput,
  parseAmount,
  withCurrency,
} from "../utils/format";
import { Modal } from "./Modal";

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
  const t = useT();
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

  // On desktop the input focuses immediately via `useDesktopAutoFocus`
  // and the seed is selected so the next keystroke replaces it. On
  // mobile we skip the autoFocus (popping the keyboard during the modal
  // entrance shoves the field around) and wait for the user to tap the
  // input themselves; `onFocus` handles the select() there.
  const inputRef = useRef<HTMLInputElement | null>(null);
  useDesktopAutoFocus(inputRef, open && canRecord, account?.id);
  useEffect(() => {
    if (!open || !canRecord) return;
    const id = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el && document.activeElement === el) {
        el.setSelectionRange(0, el.value.length);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [open, account?.id, canRecord]);

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

  function handleConfirm() {
    if (!canRecord || !hasDelta || parsed === null) return;
    onConfirm(parsed);
  }

  return (
    <Modal
      open={open && account !== null}
      onClose={onCancel}
      labelledBy="update-balance-title"
      role="alertdialog"
      size="max-w-md"
      scrollableBody={false}
    >
      <Modal.Header title={t("updateBalance.title")} onClose={onCancel} />
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 text-sm text-fg">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted">{t("updateBalance.account")}</span>
          <span className="font-bold text-fg-bright">{account?.name}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted">
            {t("updateBalance.currentBalance")}
          </span>
          <span
            className={`tabular-nums ${
              currentBalance < 0 ? "text-negative" : "text-positive"
            }`}
          >
            {formatBalance(currentBalance, accountSettings)}
          </span>
        </div>

        {canRecord && account ? (
          <label className="flex flex-col gap-1">
            <span className="text-muted">{t("updateBalance.newBalance")}</span>
            <input
              key={account.id}
              ref={inputRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              value={text}
              onChange={(e) =>
                setText(normalizeAmountInput(e.target.value, accountSettings))
              }
              className="field-input w-full rounded border border-line bg-surface-2 px-2.5 py-2 text-right font-mono tabular-nums text-fg-bright outline-none focus:border-accent"
            />
          </label>
        ) : (
          <p className="text-xs text-muted">
            {t("updateBalance.noBudgetHint")}
          </p>
        )}

        {canRecord && hasDelta && (
          <p className="text-xs text-muted">
            {t("updateBalance.correctionHintPrefix")}{" "}
            <span
              className={`font-mono tabular-nums ${
                delta >= 0 ? "text-positive" : "text-negative"
              }`}
            >
              {deltaText}
            </span>{" "}
            {t("updateBalance.correctionHintMiddle")}{" "}
            <span className="font-mono text-flag">{date}</span>{" "}
            {t("updateBalance.correctionHintEnd")}{" "}
            <span className="font-mono tabular-nums text-fg-bright">
              {newBalanceText}
            </span>
            .
          </p>
        )}
        {canRecord && parsed !== null && !hasDelta && (
          <p className="text-xs text-muted">
            {t("updateBalance.alreadyAtBalance")}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 px-4 py-3">
        {canRecord && (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!hasDelta}
            className="cursor-pointer rounded border border-accent/60 bg-accent/10 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-muted disabled:hover:bg-transparent"
          >
            {t("updateBalance.confirmUpdate")}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded border border-line px-3 py-2 text-sm text-muted hover:text-fg"
        >
          {canRecord ? t("common.cancel") : t("common.close")}
        </button>
      </div>
    </Modal>
  );
}
