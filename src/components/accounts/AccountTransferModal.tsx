import { useEffect, useReducer, useRef } from "react";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Check,
  ChevronDown,
  Trash2,
  Wallet,
} from "lucide-react";

import { normalizeName } from "../../data/normalize";
import type { Account, Category, EntryType } from "../../data/types";
import { useDesktopAutoFocus, type FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import {
  formatAmountForInput,
  formatDate,
  normalizeAmountInput,
  parseAmount,
  withCurrency,
} from "../../utils/format";
import { tintBorder, tintFill } from "../../utils/tint";
import { FloatingPanel } from "../FloatingPanel";
import { Modal } from "../Modal";
import { DatePickerModal } from "../DatePickerModal";
import { Button, Checkbox, ClearableInput, FormSection } from "../form";
import { CategoryIconGlyph } from "../icons";
import { TypePicker } from "../TypePicker";
import type { Settings } from "../../data/types";
import {
  initialTransferModalState,
  transferModalReducer,
} from "./account-transfer-modal-reducer";

export type TransferDraft = {
  date: string;
  description: string;
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  typeId: string | null;
  completed: boolean;
};

// Source-of-truth payload describing what the modal is editing. The
// parent supplies one of two shapes:
//
//   - { kind: "create" }: a standalone create from the Accounts
//     dashboard. Both pickers visible, defaults seeded from the
//     workspace's first two accounts (caller can override).
//
//   - { kind: "edit", transferId }: editing an existing transfer.
//     Same UI as "create" but with a Delete button in the footer.
export type TransferModalRequest =
  | {
      kind: "create";
      defaultFromId: string | null;
      defaultToId: string | null;
      seedDate: string;
    }
  | {
      kind: "edit";
      transferId: string;
      date: string;
      description: string;
      amount: number;
      fromAccountId: string;
      toAccountId: string;
      typeId: string | null;
      completed: boolean;
      // True when this transfer was minted by collapsing two
      // imported bank-history entries (i.e. at least one HistoryEntry
      // points at this tx via `collapsedIntoTransferId`). The bank
      // statement owns the date, amount, accounts, and completion
      // status — only the user-supplied transfer metadata (description
      // and type) stays editable. The modal also exposes an "is a
      // transfer" toggle that uncollapses the pair when cleared.
      isImportedPair: boolean;
    };

type Props = {
  open: boolean;
  request: TransferModalRequest | null;
  accounts: Account[];
  categories: readonly Category[];
  types: readonly EntryType[];
  settings: Settings;
  onClose: () => void;
  onCreate: (draft: TransferDraft) => void;
  onEdit: (transferId: string, draft: TransferDraft) => void;
  onDelete: (transferId: string) => void;
  // Imported-pair-only: invoked when the user clears the "is a
  // transfer" toggle on an edit-mode modal whose `isImportedPair` is
  // true. The parent owns the confirmation prompt and the
  // `deleteTransfer` dispatch that uncollapses the pair.
  onUncollapse: (transferId: string) => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
};

export function AccountTransferModal({
  open,
  request,
  accounts,
  categories,
  types,
  settings,
  onClose,
  onCreate,
  onEdit,
  onDelete,
  onUncollapse,
  onCreateType,
  onCreateCategory,
}: Props) {
  const t = useT();
  const [state, dispatch] = useReducer(transferModalReducer, null, () =>
    initialTransferModalState(request, settings),
  );
  const {
    date,
    description,
    amountText,
    fromAccountId,
    toAccountId,
    typeId,
    completed,
    isTransfer,
    datePickerOpen,
    fromOpen,
    toOpen,
  } = state;

  const descriptionRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(descriptionRef, open);

  // Seed the form whenever the modal opens or the request changes. Each
  // mode has its own seeding strategy: edit pre-fills from the
  // transfer, create reuses the workspace defaults.
  useEffect(() => {
    if (!open || !request) return;
    dispatch({
      kind: "reset",
      state: initialTransferModalState(request, settings),
    });
  }, [open, request, settings]);

  if (!request) {
    return (
      <Modal open={false} onClose={onClose} labelledBy="tx-modal-title">
        <></>
      </Modal>
    );
  }

  const isEdit = request.kind === "edit";
  // Bank-imported transfers lock everything but description + type
  // because the statement is the source of truth. The "is a transfer"
  // toggle lets the user demote the pair back to two stand-alone
  // history entries; while it's cleared, Save dispatches an uncollapse
  // instead of a patch.
  const isImported = isEdit && request.isImportedPair;
  const willUncollapse = isImported && !isTransfer;

  // Imported pairs lock BOTH sides because the bank statement owns the
  // accounts. Everything else (plain create / non-imported edit) lets
  // the user pick freely via the AccountPicker.
  const lockedFromId = isImported ? request.fromAccountId : null;
  const lockedToId = isImported ? request.toAccountId : null;

  const parsedAmount = parseAmount(amountText);
  const trimmedDescription = normalizeName(description);
  const canSave = willUncollapse
    ? true
    : isImported
      ? trimmedDescription !== null
      : parsedAmount !== null &&
        parsedAmount > 0 &&
        trimmedDescription !== null &&
        !!date &&
        !!fromAccountId &&
        !!toAccountId &&
        fromAccountId !== toAccountId;

  function commitAmount(text: string) {
    const stripped = text.replace(/-/g, "");
    dispatch({
      kind: "setAmountText",
      value: normalizeAmountInput(stripped, settings),
    });
  }

  function swap() {
    dispatch({ kind: "swapAccounts" });
  }

  function handleSave() {
    if (!canSave) return;
    if (willUncollapse && request?.kind === "edit") {
      onUncollapse(request.transferId);
      onClose();
      return;
    }
    if (parsedAmount === null || trimmedDescription === null) return;
    const draft: TransferDraft = {
      date,
      description: trimmedDescription,
      amount: Math.abs(parsedAmount),
      fromAccountId,
      toAccountId,
      typeId,
      completed,
    };
    if (request?.kind === "edit") onEdit(request.transferId, draft);
    else onCreate(draft);
    onClose();
  }

  function handleDelete() {
    if (request?.kind !== "edit") return;
    onDelete(request.transferId);
    onClose();
  }

  const fromAccount = accounts.find((a) => a.id === fromAccountId) ?? null;
  const toAccount = accounts.find((a) => a.id === toAccountId) ?? null;

  return (
    <Modal open={open} onClose={onClose} labelledBy="tx-modal-title">
      <Modal.Header
        icon={<ArrowLeftRight size={14} aria-hidden focusable={false} />}
        title={isEdit ? t("transfer.titleEdit") : t("transfer.titleNew")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          {isImported && (
            <p className="text-xs text-muted">
              {t("transfer.importedLockedHint")}
            </p>
          )}
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <FormSection as="label" label={t("transfer.date")}>
              {isImported ? (
                <div className="field-input rounded border border-line bg-surface px-2 py-1.5 text-left font-mono text-sm text-fg-bright">
                  {formatDate(date, settings.dateFormat, settings.language) ||
                    "—"}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    dispatch({ kind: "setDatePickerOpen", value: true })
                  }
                  className="field-input cursor-pointer rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm text-fg hover:border-accent"
                >
                  {date || "—"}
                </button>
              )}
              <DatePickerModal
                open={datePickerOpen}
                value={date}
                onClose={() =>
                  dispatch({ kind: "setDatePickerOpen", value: false })
                }
                onSelect={(next) =>
                  dispatch({ kind: "setDate", value: next ?? "" })
                }
              />
            </FormSection>
            <FormSection as="label" label={t("transfer.amount")}>
              {isImported ? (
                <div className="field-input rounded border border-line bg-surface px-2 py-1.5 text-right font-mono text-sm tabular-nums text-fg-bright">
                  {parsedAmount !== null
                    ? withCurrency(
                        formatAmountForInput(Math.abs(parsedAmount), settings),
                        settings,
                      )
                    : "—"}
                </div>
              ) : (
                <>
                  <ClearableInput
                    inputMode="decimal"
                    value={amountText}
                    onValueChange={commitAmount}
                    placeholder="0"
                    className="field-input w-full rounded border border-line bg-surface-2 px-2 py-1.5 text-right font-mono text-sm tabular-nums text-fg"
                  />
                  <span className="text-right text-xs text-muted">
                    {parsedAmount !== null
                      ? withCurrency(
                          formatAmountForInput(
                            Math.abs(parsedAmount),
                            settings,
                          ),
                          settings,
                        )
                      : "—"}
                  </span>
                </>
              )}
            </FormSection>
          </div>

          <FormSection as="label" label={t("transfer.description")}>
            <ClearableInput
              ref={descriptionRef}
              value={description}
              onValueChange={(value) =>
                dispatch({ kind: "setDescription", value })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) {
                  e.preventDefault();
                  handleSave();
                }
              }}
              placeholder={t("transfer.descriptionPlaceholder")}
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </FormSection>

          <div className="flex flex-col gap-2 rounded border border-line bg-surface-2 p-3">
            <span className="text-xs text-muted">{t("transfer.transfer")}</span>
            <FormSection label={t("transfer.from")}>
              {lockedFromId !== null ? (
                <LockedAccountChip account={fromAccount} direction="from" />
              ) : (
                <AccountPicker
                  value={fromAccountId}
                  accounts={accounts}
                  excludeId={toAccountId}
                  open={fromOpen}
                  onToggle={() =>
                    dispatch({ kind: "setFromOpen", value: !fromOpen })
                  }
                  onClose={() =>
                    dispatch({ kind: "setFromOpen", value: false })
                  }
                  onPick={(id) =>
                    dispatch({ kind: "pickFromAccount", value: id })
                  }
                />
              )}
            </FormSection>
            {lockedFromId === null && lockedToId === null && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={swap}
                  aria-label={t("transfer.swap")}
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
                >
                  <ArrowDown size={12} aria-hidden focusable={false} />
                </button>
              </div>
            )}
            <FormSection label={t("transfer.to")}>
              {lockedToId !== null ? (
                <LockedAccountChip account={toAccount} direction="to" />
              ) : (
                <AccountPicker
                  value={toAccountId}
                  accounts={accounts}
                  excludeId={fromAccountId}
                  open={toOpen}
                  onToggle={() =>
                    dispatch({ kind: "setToOpen", value: !toOpen })
                  }
                  onClose={() => dispatch({ kind: "setToOpen", value: false })}
                  onPick={(id) =>
                    dispatch({ kind: "pickToAccount", value: id })
                  }
                />
              )}
            </FormSection>
            {fromAccountId && toAccountId && fromAccountId === toAccountId && (
              <p className="text-xs text-danger">
                {t("transfer.needTwoAccounts")}
              </p>
            )}
          </div>

          <FormSection label={t("transfer.type")}>
            <TypePicker
              types={types}
              categories={categories}
              selectedId={typeId}
              onSelect={(value) => dispatch({ kind: "setTypeId", value })}
              onCreate={onCreateType}
              onCreateCategory={onCreateCategory}
              variant="field"
            />
          </FormSection>

          {/* The Mark-as-done checkbox is redundant for imported pairs:
              the bank already records the movement, so the transfer is
              by definition done. Hide it; show the "is a transfer"
              toggle in its place. */}
          {isImported ? (
            <Checkbox
              checked={isTransfer}
              onChange={(value) => dispatch({ kind: "setIsTransfer", value })}
              label={t("transfer.isTransfer")}
              className="items-center"
            />
          ) : (
            <Checkbox
              checked={completed}
              onChange={(value) => dispatch({ kind: "setCompleted", value })}
              label={t("transfer.markAsDone")}
              className="items-center"
            />
          )}
        </div>
      </Modal.Body>
      <Modal.Footer className="justify-between">
        <div>
          {isEdit && !isImported && (
            <Button variant="danger" withIcon onClick={handleDelete}>
              <Trash2 size={14} aria-hidden focusable={false} />
              {t("common.delete")}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={willUncollapse ? "danger" : "primary"}
            onClick={handleSave}
            disabled={!canSave}
          >
            {willUncollapse
              ? t("transfer.uncollapseConfirm")
              : isEdit
                ? t("common.save")
                : t("account.create")}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}

// Locked account chip: rendered in place of the AccountPicker on the
// fixed side of a promote-row transfer so the user can see which
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
          backgroundColor: account?.color ? tintFill(account.color) : undefined,
          borderColor: account?.color ? tintBorder(account.color) : undefined,
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

// Routed through `FloatingPanel` so the list lifts out of the
// AccountTransferModal's z-50 stacking context — otherwise its options
// would render underneath the dismiss backdrop.
const TRANSFER_ACCOUNT_PICKER_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 240 },
  anchor: "left",
  coordinateSpace: "viewport",
};

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
          {selected ? selected.name : t("transfer.chooseAccount")}
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
        placement={TRANSFER_ACCOUNT_PICKER_PLACEMENT}
      >
        <ul role="listbox" className="max-h-64 overflow-auto py-1">
          {accounts.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted">
              {t("transfer.noAccountsYet")}
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
            );
          })}
        </ul>
      </FloatingPanel>
    </div>
  );
}
