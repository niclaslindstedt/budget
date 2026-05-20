import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Check,
  ChevronDown,
  Trash2,
  Wallet,
} from "lucide-react";

import type { Account, Category, EntryType, Row } from "../data/types";
import { useDesktopAutoFocus } from "../hooks";
import { useT } from "../i18n";
import {
  formatAmountForInput,
  normalizeAmountInput,
  parseAmount,
  withCurrency,
} from "../utils/format";
import { Modal } from "./Modal";
import { DatePickerModal } from "./DatePickerModal";
import { Checkbox, ClearableTextInput } from "./form";
import { CategoryIconGlyph } from "./icons";
import { TypePicker } from "./TypePicker";
import type { Settings } from "../data/types";

export type TransactionDraft = {
  date: string;
  description: string;
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  typeId: string | null;
  completed: boolean;
};

// Source-of-truth payload describing what the modal is editing. The
// parent supplies one of three shapes:
//
//   - { kind: "promote" }: the user clicked the transfer button on a
//     budget row. The row's account is fixed as one endpoint, and the
//     modal asks for the OTHER account. The direction follows from
//     the row's amount sign: negative = money flowing OUT of self
//     (self → other), positive = money flowing IN (other → self).
//     Submitting calls `onPromote` so the parent can drop the row and
//     mint a transaction in one reducer cycle.
//
//   - { kind: "create" }: a standalone create from the Accounts
//     dashboard. Both pickers visible, defaults seeded from the
//     workspace's first two accounts (caller can override).
//
//   - { kind: "edit", transactionId }: editing an existing transaction.
//     Same UI as "create" but with a Delete button in the footer.
export type TransactionModalRequest =
  | {
      kind: "promote";
      row: Row;
      selfAccountId: string;
      seedDate: string;
      seedDescription: string;
      seedAmount: number;
      // Sign of the row's amount drives direction; we precompute the
      // boolean here so the modal doesn't have to know about column ids.
      outgoing: boolean;
      seedTypeId: string | null;
    }
  | {
      kind: "create";
      defaultFromId: string | null;
      defaultToId: string | null;
      seedDate: string;
    }
  | {
      kind: "edit";
      transactionId: string;
      date: string;
      description: string;
      amount: number;
      fromAccountId: string;
      toAccountId: string;
      typeId: string | null;
      completed: boolean;
    };

type Props = {
  open: boolean;
  request: TransactionModalRequest | null;
  accounts: Account[];
  categories: readonly Category[];
  types: readonly EntryType[];
  typeUsageById?: ReadonlyMap<string, number>;
  settings: Settings;
  onClose: () => void;
  onPromote: (draft: TransactionDraft) => void;
  onCreate: (draft: TransactionDraft) => void;
  onEdit: (transactionId: string, draft: TransactionDraft) => void;
  onDelete: (transactionId: string) => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
};

export function TransactionModal({
  open,
  request,
  accounts,
  categories,
  types,
  typeUsageById,
  settings,
  onClose,
  onPromote,
  onCreate,
  onEdit,
  onDelete,
  onCreateType,
}: Props) {
  const t = useT();
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [amountText, setAmountText] = useState("");
  const [fromAccountId, setFromAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [typeId, setTypeId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  const descriptionRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(descriptionRef, open);

  // Seed the form whenever the modal opens or the request changes. Each
  // mode has its own seeding strategy: promote-row pre-fills from the
  // row, edit pre-fills from the transaction, create reuses the
  // workspace defaults.
  useEffect(() => {
    if (!open || !request) return;
    if (request.kind === "promote") {
      setDate(request.seedDate);
      setDescription(request.seedDescription);
      setAmountText(
        formatAmountForInput(Math.abs(request.seedAmount), settings),
      );
      if (request.outgoing) {
        setFromAccountId(request.selfAccountId);
        setToAccountId("");
      } else {
        setFromAccountId("");
        setToAccountId(request.selfAccountId);
      }
      setTypeId(request.seedTypeId);
      setCompleted(false);
    } else if (request.kind === "edit") {
      setDate(request.date);
      setDescription(request.description);
      setAmountText(formatAmountForInput(request.amount, settings));
      setFromAccountId(request.fromAccountId);
      setToAccountId(request.toAccountId);
      setTypeId(request.typeId);
      setCompleted(request.completed);
    } else {
      setDate(request.seedDate);
      setDescription("");
      setAmountText("");
      setFromAccountId(request.defaultFromId ?? "");
      setToAccountId(request.defaultToId ?? "");
      setTypeId(null);
      setCompleted(false);
    }
    setDatePickerOpen(false);
    setFromOpen(false);
    setToOpen(false);
  }, [open, request, settings]);

  if (!request) {
    return (
      <Modal open={false} onClose={onClose} labelledBy="tx-modal-title">
        <></>
      </Modal>
    );
  }

  const isPromote = request.kind === "promote";
  const isEdit = request.kind === "edit";

  // Promote-row mode locks the direction (driven by the row's amount
  // sign) so the user only needs to pick the OTHER account. The fixed
  // side renders as a read-only chip; the open side is a regular
  // AccountPicker.
  const lockedFromId =
    isPromote && request.outgoing ? request.selfAccountId : null;
  const lockedToId =
    isPromote && !request.outgoing ? request.selfAccountId : null;

  const parsedAmount = parseAmount(amountText);
  const canSave =
    parsedAmount !== null &&
    parsedAmount > 0 &&
    description.trim().length > 0 &&
    !!date &&
    !!fromAccountId &&
    !!toAccountId &&
    fromAccountId !== toAccountId;

  function commitAmount(text: string) {
    const stripped = text.replace(/-/g, "");
    setAmountText(normalizeAmountInput(stripped, settings));
  }

  function swap() {
    setFromAccountId(toAccountId);
    setToAccountId(fromAccountId);
  }

  function handleSave() {
    if (!canSave || parsedAmount === null) return;
    const draft: TransactionDraft = {
      date,
      description: description.trim(),
      amount: Math.abs(parsedAmount),
      fromAccountId,
      toAccountId,
      typeId,
      completed,
    };
    if (request?.kind === "promote") onPromote(draft);
    else if (request?.kind === "edit") onEdit(request.transactionId, draft);
    else onCreate(draft);
    onClose();
  }

  function handleDelete() {
    if (request?.kind !== "edit") return;
    onDelete(request.transactionId);
    onClose();
  }

  const fromAccount = accounts.find((a) => a.id === fromAccountId) ?? null;
  const toAccount = accounts.find((a) => a.id === toAccountId) ?? null;

  return (
    <Modal open={open} onClose={onClose} labelledBy="tx-modal-title">
      <Modal.Header
        title={
          <>
            <ArrowLeftRight
              size={14}
              className="text-flag"
              aria-hidden
              focusable={false}
            />
            {isEdit
              ? t("transaction.titleEdit")
              : isPromote
                ? t("transaction.titlePromote")
                : t("transaction.titleNew")}
          </>
        }
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">
                {t("transaction.date")}
              </span>
              <button
                type="button"
                onClick={() => setDatePickerOpen(true)}
                className="field-input cursor-pointer rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm text-fg hover:border-accent"
              >
                {date || "—"}
              </button>
              <DatePickerModal
                open={datePickerOpen}
                value={date}
                onClose={() => setDatePickerOpen(false)}
                onSelect={(next) => setDate(next ?? "")}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">
                {t("transaction.amount")}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={amountText}
                onChange={(e) => commitAmount(e.target.value)}
                placeholder="0"
                className="field-input rounded border border-line bg-surface-2 px-2 py-1.5 text-right font-mono text-sm tabular-nums text-fg"
              />
              <span className="text-right text-xs text-muted">
                {parsedAmount !== null
                  ? withCurrency(
                      formatAmountForInput(Math.abs(parsedAmount), settings),
                      settings,
                    )
                  : "—"}
              </span>
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">
              {t("transaction.description")}
            </span>
            <ClearableTextInput
              ref={descriptionRef}
              value={description}
              onValueChange={setDescription}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) {
                  e.preventDefault();
                  handleSave();
                }
              }}
              placeholder={t("transaction.descriptionPlaceholder")}
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </label>

          <div className="flex flex-col gap-2 rounded border border-line bg-surface-2 p-3">
            <span className="text-xs text-muted">
              {t("transaction.transfer")}
            </span>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">
                {t("transaction.from")}
              </span>
              {lockedFromId !== null ? (
                <LockedAccountChip account={fromAccount} direction="from" />
              ) : (
                <AccountPicker
                  value={fromAccountId}
                  accounts={accounts}
                  excludeId={toAccountId}
                  open={fromOpen}
                  onToggle={() => setFromOpen((v) => !v)}
                  onClose={() => setFromOpen(false)}
                  onPick={(id) => {
                    setFromAccountId(id);
                    setFromOpen(false);
                  }}
                />
              )}
            </div>
            {lockedFromId === null && lockedToId === null && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={swap}
                  aria-label={t("transaction.swap")}
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
                >
                  <ArrowDown size={12} aria-hidden focusable={false} />
                </button>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">{t("transaction.to")}</span>
              {lockedToId !== null ? (
                <LockedAccountChip account={toAccount} direction="to" />
              ) : (
                <AccountPicker
                  value={toAccountId}
                  accounts={accounts}
                  excludeId={fromAccountId}
                  open={toOpen}
                  onToggle={() => setToOpen((v) => !v)}
                  onClose={() => setToOpen(false)}
                  onPick={(id) => {
                    setToAccountId(id);
                    setToOpen(false);
                  }}
                />
              )}
            </div>
            {isPromote && (
              <p className="text-xs text-muted">
                {request.outgoing
                  ? t("transaction.moneyLeaves")
                  : t("transaction.moneyArrives")}
              </p>
            )}
            {fromAccountId && toAccountId && fromAccountId === toAccountId && (
              <p className="text-xs text-danger">
                {t("transaction.needTwoAccounts")}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t("transaction.type")}</span>
            <TypePicker
              types={types}
              categories={categories}
              selectedId={typeId}
              onSelect={setTypeId}
              onCreate={onCreateType}
              usageById={typeUsageById}
              variant="field"
            />
          </div>

          <Checkbox
            checked={completed}
            onChange={setCompleted}
            label={t("transaction.markAsDone")}
            className="items-center"
          />
        </div>
      </Modal.Body>
      <Modal.Footer className="justify-between">
        <div>
          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-danger/60 bg-danger/10 px-3 py-1.5 text-sm text-danger hover:bg-danger/20"
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
            {isEdit
              ? t("common.save")
              : isPromote
                ? t("transaction.titlePromote")
                : t("account.create")}
          </button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}

// Locked account chip: rendered in place of the AccountPicker on the
// fixed side of a promote-row transaction so the user can see which
// account is anchoring the transfer (and isn't tempted to change it).
function LockedAccountChip({
  account,
  direction,
}: {
  account: Account | null;
  direction: "from" | "to";
}) {
  return (
    <div
      className="flex items-center gap-2 rounded border border-line bg-surface px-2 py-1.5 text-sm text-fg-bright"
      aria-label={`${direction === "from" ? "From" : "To"} ${
        account?.name ?? "this account"
      } (locked)`}
    >
      <span
        aria-hidden
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
        style={{
          color: account?.color,
          backgroundColor: account?.color
            ? `color-mix(in srgb, ${account.color} 18%, transparent)`
            : undefined,
          borderColor: account?.color
            ? `color-mix(in srgb, ${account.color} 55%, transparent)`
            : undefined,
        }}
      >
        {account?.glyph ? (
          <CategoryIconGlyph name={account.glyph} size={12} />
        ) : (
          <Wallet size={12} aria-hidden focusable={false} />
        )}
      </span>
      <span className="flex-1 truncate">
        {account?.name ?? "Unknown account"}
      </span>
      {direction === "from" ? (
        <ArrowUp
          size={12}
          className="text-muted"
          aria-hidden
          focusable={false}
        />
      ) : (
        <ArrowDown
          size={12}
          className="text-muted"
          aria-hidden
          focusable={false}
        />
      )}
    </div>
  );
}

function AccountPicker({
  value,
  accounts,
  excludeId,
  open,
  onToggle,
  onClose,
  onPick,
}: {
  value: string;
  accounts: Account[];
  // Account id to grey out so the user can't pick both sides as the
  // same account. Empty string means "no exclusion".
  excludeId: string;
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
        className="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
      >
        <span
          aria-hidden
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
          style={{
            color: selected?.color,
            backgroundColor: selected?.color
              ? `color-mix(in srgb, ${selected.color} 18%, transparent)`
              : undefined,
            borderColor: selected?.color
              ? `color-mix(in srgb, ${selected.color} 55%, transparent)`
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
          {selected ? selected.name : "Choose an account"}
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
          {accounts.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted">
              No accounts yet — create one from the Accounts sheet.
            </li>
          )}
          {accounts.map((a) => {
            const isExcluded = a.id === excludeId && a.id !== value;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={a.id === value}
                  disabled={isExcluded}
                  onClick={() => onPick(a.id)}
                  className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span
                    aria-hidden
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
                    style={{
                      color: a.color,
                      backgroundColor: a.color
                        ? `color-mix(in srgb, ${a.color} 18%, transparent)`
                        : undefined,
                      borderColor: a.color
                        ? `color-mix(in srgb, ${a.color} 55%, transparent)`
                        : undefined,
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
            );
          })}
        </ul>
      )}
    </div>
  );
}
