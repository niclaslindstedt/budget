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
import { FloatingPanel } from "../FloatingPanel";
import { Modal } from "../Modal";
import { DatePickerModal } from "../DatePickerModal";
import { Button, Checkbox, ClearableInput } from "../form";
import { CategoryIconGlyph } from "../icons";
import { TypePicker } from "../TypePicker";
import type { Settings } from "../../data/types";

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

export function TransferModal({
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
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [amountText, setAmountText] = useState("");
  const [fromAccountId, setFromAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [typeId, setTypeId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [isTransfer, setIsTransfer] = useState(true);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  const descriptionRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(descriptionRef, open);

  // Seed the form whenever the modal opens or the request changes. Each
  // mode has its own seeding strategy: edit pre-fills from the
  // transfer, create reuses the workspace defaults.
  useEffect(() => {
    if (!open || !request) return;
    if (request.kind === "edit") {
      setDate(request.date);
      setDescription(request.description);
      setAmountText(formatAmountForInput(request.amount, settings));
      setFromAccountId(request.fromAccountId);
      setToAccountId(request.toAccountId);
      setTypeId(request.typeId);
      setCompleted(request.completed);
      setIsTransfer(true);
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
  const canSave = willUncollapse
    ? true
    : isImported
      ? description.trim().length > 0
      : parsedAmount !== null &&
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
    if (!canSave) return;
    if (willUncollapse && request?.kind === "edit") {
      onUncollapse(request.transferId);
      onClose();
      return;
    }
    if (parsedAmount === null) return;
    const draft: TransferDraft = {
      date,
      description: description.trim(),
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
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">{t("transfer.date")}</span>
              {isImported ? (
                <div className="field-input rounded border border-line bg-surface px-2 py-1.5 text-left font-mono text-sm text-fg-bright">
                  {formatDate(date, settings.dateFormat, settings.language) ||
                    "—"}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setDatePickerOpen(true)}
                  className="field-input cursor-pointer rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm text-fg hover:border-accent"
                >
                  {date || "—"}
                </button>
              )}
              <DatePickerModal
                open={datePickerOpen}
                value={date}
                onClose={() => setDatePickerOpen(false)}
                onSelect={(next) => setDate(next ?? "")}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">{t("transfer.amount")}</span>
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
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">
              {t("transfer.description")}
            </span>
            <ClearableInput
              ref={descriptionRef}
              value={description}
              onValueChange={setDescription}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) {
                  e.preventDefault();
                  handleSave();
                }
              }}
              placeholder={t("transfer.descriptionPlaceholder")}
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </label>

          <div className="flex flex-col gap-2 rounded border border-line bg-surface-2 p-3">
            <span className="text-xs text-muted">{t("transfer.transfer")}</span>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">{t("transfer.from")}</span>
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
                  aria-label={t("transfer.swap")}
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
                >
                  <ArrowDown size={12} aria-hidden focusable={false} />
                </button>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">{t("transfer.to")}</span>
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
            {fromAccountId && toAccountId && fromAccountId === toAccountId && (
              <p className="text-xs text-danger">
                {t("transfer.needTwoAccounts")}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t("transfer.type")}</span>
            <TypePicker
              types={types}
              categories={categories}
              selectedId={typeId}
              onSelect={setTypeId}
              onCreate={onCreateType}
              onCreateCategory={onCreateCategory}
              variant="field"
            />
          </div>

          {/* The Mark-as-done checkbox is redundant for imported pairs:
              the bank already records the movement, so the transfer is
              by definition done. Hide it; show the "is a transfer"
              toggle in its place. */}
          {isImported ? (
            <Checkbox
              checked={isTransfer}
              onChange={setIsTransfer}
              label={t("transfer.isTransfer")}
              className="items-center"
            />
          ) : (
            <Checkbox
              checked={completed}
              onChange={setCompleted}
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

// Routed through `FloatingPanel` so the list lifts out of the
// TransferModal's z-50 stacking context — otherwise its options
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
      <FloatingPanel
        open={open}
        onClose={onClose}
        triggerRef={triggerRef}
        placement={TRANSFER_ACCOUNT_PICKER_PLACEMENT}
      >
        <ul role="listbox" className="max-h-64 overflow-auto py-1">
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
      </FloatingPanel>
    </div>
  );
}
